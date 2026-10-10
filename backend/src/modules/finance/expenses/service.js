import { appError } from '../../../shared/errors.js';
import { record as auditRecord } from '../../../shared/audit.js';
import { startOfDay } from '../../../shared/dates.js';
import { toOffset } from '../../../shared/pagination.js';
import { CLUB_ROLES } from '../../../shared/access.js';

// LLD §2.10: reimbursements may be submitted by any club role holder or an organizer of a club
// event (named explicitly there, so OQ-38 does not remove it).
const REIMBURSEMENT_SUBMITTERS = Object.freeze([...CLUB_ROLES, 'ORGANIZER']);
import { canApprove, canPay } from '../domain/approvalPolicy.js';
import { dateProblems, REQUIRED_STATUS } from '../domain/expenseStateMachine.js';
import * as repository from './repository.js';

// Expenses and reimbursements (LLD §2.10, §4.9, §5.11; T-81).
// Ledger rows are written only when an expense becomes PAID, in the same transaction.

export function createExpenseService({ db, withTransaction, clock, access, auth, ledger, files, getEventClub, assertFundraiserLinkable, timeZone }) {
  const validation = (problems) => appError('VALIDATION_FAILED', { fields: problems });

  async function load(id) {
    const e = await repository.findExpense(db, id);
    if (!e) throw appError('NOT_FOUND');
    return e;
  }

  /** Club head, treasurer, or the submitter (LLD §4.9 GET /expenses/:id, /receipt). */
  async function loadForReader(actor, id) {
    const e = await load(id);
    const standing = await access.requireRole(actor, e.club_id, ['CLUB_HEAD', 'TREASURER'], {
      alsoAllow: () => e.submitted_by === actor.userId,
    });
    return { expense: e, standing };
  }

  async function assertReferences(clubId, { eventId, fundraiserId }) {
    if (eventId && (await getEventClub(eventId)) !== clubId) throw appError('EVENT_NOT_IN_CLUB');
    if (fundraiserId) await assertFundraiserLinkable(clubId, fundraiserId);
  }

  /**
   * POST /clubs/:clubId/expenses (multipart). REIMBURSEMENT: club roles or organizer → SUBMITTED, no ledger.
   * DIRECT: TREASURER → PAID + ledger OUT DIRECT_EXPENSE in the same transaction (OD-06).
   */
  async function submit(actor, clubId, dto, file, { requestId } = {}) {
    const allowed = dto.kind === 'DIRECT' ? ['TREASURER'] : REIMBURSEMENT_SUBMITTERS;
    await access.requireRole(actor, clubId, allowed);
    if (!file) throw appError('RECEIPT_REQUIRED');
    const problems = dateProblems({ incurredOn: dto.incurredOn, today: clock.todayIST() });
    if (problems.length) throw validation(problems);
    await assertReferences(clubId, dto);

    return files.withStoredFile(file, { clubId, uploadedBy: actor.userId }, (insertFile) =>
      withTransaction(async (trx) => {
        const receipt = await insertFile(trx);
        const now = clock.now();
        const direct = dto.kind === 'DIRECT';
        const expense = await repository.insertExpense(trx, {
          club_id: clubId,
          kind: dto.kind,
          title: dto.title,
          description: dto.description,
          amount_paise: dto.amountPaise,
          incurred_on: dto.incurredOn,
          event_id: dto.eventId ?? null,
          fundraiser_id: dto.fundraiserId ?? null,
          receipt_file_id: receipt.id,
          submitted_by: actor.userId,
          payee_user_id: direct ? null : actor.userId,
          status: direct ? 'PAID' : 'SUBMITTED',
          paid_by: direct ? actor.userId : null,
          paid_at: direct ? now : null,
          created_at: now,
        });
        if (direct) {
          await ledger.post(trx, {
            clubId,
            direction: 'OUT',
            category: 'DIRECT_EXPENSE',
            amountPaise: expense.amount_paise,
            sourceType: 'EXPENSE',
            sourceId: expense.id,
            expenseId: expense.id,
            eventId: expense.event_id,
            fundraiserId: expense.fundraiser_id,
            recordedBy: actor.userId,
            description: expense.title,
            evidenceFileId: receipt.id,
            occurredAt: startOfDay(expense.incurred_on, timeZone), // OQ-16
          });
        }
        await auditRecord(trx, {
          actorUserId: actor.userId,
          clubId,
          action: direct ? 'DIRECT_EXPENSE_RECORDED' : 'EXPENSE_SUBMITTED',
          entityType: 'expense',
          entityId: expense.id,
          metadata: { kind: expense.kind, amountPaise: expense.amount_paise },
          requestId,
        });
        return { expense, receipt };
      }),
    );
  }

  async function reviewContext(actor, expense, personField) {
    const standing = await access.standing(actor.userId, expense.club_id);
    if (!standing.team && expense.submitted_by !== actor.userId) throw appError('NOT_FOUND');
    const person = expense[personField];
    const personStanding = person ? await access.standing(person, expense.club_id) : { roles: new Set() };
    return { actor: { userId: actor.userId, roles: standing.roles }, personRoles: personStanding.roles };
  }

  async function transition(id, toStatus, changes, trx) {
    const updated = await repository.transitionIfStatus(trx, id, REQUIRED_STATUS[toStatus], changes);
    if (!updated) {
      const current = await repository.findExpense(trx, id);
      throw appError('CONFLICT_STATE', { currentStatus: current.status });
    }
    return updated;
  }

  /** approve / reject (LLD §4.9): conditional UPDATE … WHERE status = 'SUBMITTED'. */
  async function decide(actor, id, decision, note, { requestId } = {}) {
    const expense = await load(id);
    const ctx = await reviewContext(actor, expense, 'submitted_by');
    const verdict = canApprove(ctx.actor, expense, { submitterRoles: ctx.personRoles });
    if (!verdict.allowed) throw appError(verdict.code);
    const toStatus = decision === 'approve' ? 'APPROVED' : 'REJECTED';
    return withTransaction(async (trx) => {
      const updated = await transition(id, toStatus, { status: toStatus, decided_by: actor.userId, decided_at: clock.now(), decision_note: note ?? null }, trx);
      await auditRecord(trx, {
        actorUserId: actor.userId,
        clubId: expense.club_id,
        action: toStatus === 'APPROVED' ? 'EXPENSE_APPROVED' : 'EXPENSE_REJECTED',
        entityType: 'expense',
        entityId: id,
        metadata: { note: note ?? null },
        requestId,
      });
      return updated;
    });
  }

  /** mark-paid: WHERE status = 'APPROVED' + ledger OUT REIMBURSEMENT_PAYOUT in one transaction. */
  async function markPaid(actor, id, { payoutReference, paidOn }, { requestId } = {}) {
    const expense = await load(id);
    const ctx = await reviewContext(actor, expense, 'payee_user_id');
    const verdict = canPay(ctx.actor, expense, { payeeRoles: ctx.personRoles });
    if (!verdict.allowed) throw appError(verdict.code);
    const problems = dateProblems({ incurredOn: expense.incurred_on, paidOn, today: clock.todayIST() });
    if (problems.length) throw validation(problems);
    return withTransaction(async (trx) => {
      const updated = await transition(id, 'PAID', { status: 'PAID', paid_by: actor.userId, paid_at: clock.now(), payout_reference: payoutReference }, trx);
      await ledger.post(trx, {
        clubId: updated.club_id,
        direction: 'OUT',
        category: 'REIMBURSEMENT_PAYOUT',
        amountPaise: updated.amount_paise,
        sourceType: 'EXPENSE',
        sourceId: updated.id,
        expenseId: updated.id,
        eventId: updated.event_id,
        fundraiserId: updated.fundraiser_id,
        recordedBy: actor.userId,
        approvedBy: updated.decided_by,
        description: updated.title,
        reference: payoutReference,
        evidenceFileId: updated.receipt_file_id,
        occurredAt: startOfDay(paidOn, timeZone), // OQ-16
      });
      await auditRecord(trx, {
        actorUserId: actor.userId,
        clubId: updated.club_id,
        action: 'EXPENSE_PAID',
        entityType: 'expense',
        entityId: id,
        metadata: { payoutReference, paidOn },
        requestId,
      });
      return updated;
    });
  }

  async function get(actor, id) {
    return (await loadForReader(actor, id)).expense;
  }

  async function receipt(actor, id) {
    const { expense } = await loadForReader(actor, id);
    const opened = await files.openForDownload(expense.receipt_file_id);
    if (!opened) throw new Error(`receipt file row missing for expense ${id}`);
    return { expense, ...opened };
  }

  const page = (query) => ({ limit: query.pageSize, offset: toOffset(query) });

  async function listForClub(clubId, query) {
    return repository.listExpenses(db, { club_id: clubId }, query, page(query));
  }

  async function listMine(actor, query) {
    return repository.listExpenses(db, { submitted_by: actor.userId }, query, page(query));
  }

  /** Receipt metadata and display names for a set of expenses (OQ-22: names via auth). */
  async function describe(expenses) {
    const receipts = await repository.findFilesByIds(db, [...new Set(expenses.map((e) => e.receipt_file_id))]);
    const ids = expenses.flatMap((e) => [e.submitted_by, e.payee_user_id, e.decided_by, e.paid_by]).filter(Boolean);
    const users = ids.length ? await auth.getUsersByIds([...new Set(ids)]) : [];
    return { receipts: new Map(receipts.map((f) => [f.id, f])), names: new Map(users.map((u) => [u.id, u.fullName])) };
  }

  return Object.freeze({ submit, decide, markPaid, get, receipt, listForClub, listMine, describe });
}
