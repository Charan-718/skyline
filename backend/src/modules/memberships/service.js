import { AppError, assertFound } from '../../shared/errors.js';
import { toCamelCase } from '../../shared/caseMap.js';
import { withTransaction } from '../../db/transaction.js';
import { randomToken } from '../../shared/tokens.js';
import { todayIST } from '../../shared/clock.js';
import { buildMembershipQrPayload, renderQrSvg } from '../../shared/qr.js';
import { canRegister, canRenew, effectiveMembershipStatus } from './domain/membershipStateMachine.js';
import { computeTermDates } from './domain/termDates.js';
import { membershipSummary } from './presenter.js';
import { parsePagination, paginatedResponse } from '../../shared/pagination.js';

function planSnapshot(plan) {
  return {
    plan_id: plan.id,
    plan_name: plan.name,
    fee_paise: plan.feePaise,
    duration_months: plan.durationMonths,
    event_discount_bps: plan.eventDiscountBps,
    merch_discount_bps: plan.merchDiscountBps,
    early_bird_access: plan.earlyBirdAccess,
    benefits_text: plan.benefitsText ?? '',
  };
}

export function createMembershipService({
  membershipRepository,
  paymentService,
  authService,
  authz,
  clubRepository,
}) {
  async function assertVerified(userId) {
    if (!(await authService.isVerifiedStudent(userId))) {
      throw new AppError('NOT_VERIFIED', 403, 'Verified student required');
    }
  }

  async function assertPlanAvailable(plan, clubId, expectedFee) {
    if (!plan || plan.clubId !== clubId || plan.status !== 'ACTIVE') {
      throw new AppError('PLAN_NOT_AVAILABLE', 422, 'Plan not available');
    }
    if (Number(plan.feePaise) !== Number(expectedFee)) {
      throw new AppError('PRICE_CHANGED', 409, 'Plan fee changed', { feePaise: Number(plan.feePaise) });
    }
  }

  async function activateFreeTerm(trx, membership, term, plan) {
    const { startsOn, endsOn } = computeTermDates(membership, plan.durationMonths);
    await trx('membership_terms')
      .where({ id: term.id })
      .update({ status: 'PAID', starts_on: startsOn, ends_on: endsOn, paid_at: trx.fn.now() });
    let memberNumber = membership.memberNumber;
    if (!memberNumber) {
      memberNumber = await clubRepository.allocateMemberNumber(membership.clubId, trx);
    }
    await trx('memberships')
      .where({ id: membership.id })
      .update({
        status: 'ACTIVE',
        member_number: memberNumber,
        current_plan_id: plan.id,
        started_on: membership.startedOn ?? startsOn,
        expires_on: endsOn,
      });
    return { membership: await membershipRepository.findMembershipById(membership.id, trx), payment: null };
  }

  return {
    async getActiveBenefits(userId, clubId, dateStr = todayIST()) {
      const membership = await membershipRepository.db('memberships')
        .where({ user_id: userId, club_id: clubId })
        .first();
      if (!membership) return null;
      const eff = effectiveMembershipStatus(membership);
      if (eff !== 'ACTIVE') return null;
      const term = await membershipRepository.getPaidTermCoveringDate(membership.id, dateStr);
      if (!term) return null;
      return {
        membershipId: membership.id,
        termId: term.id,
        planName: term.planName,
        eventDiscountBps: term.eventDiscountBps,
        merchDiscountBps: term.merchDiscountBps,
        earlyBirdAccess: term.earlyBirdAccess,
      };
    },

    async register(actor, clubId, planId, expectedFeePaise) {
      await assertVerified(actor.userId);
      const plan = await membershipRepository.findPlan(planId);
      await assertPlanAvailable(plan, clubId, expectedFeePaise);

      return withTransaction(async (trx) => {
        let membership = await membershipRepository.findMembershipForUserClub(actor.userId, clubId, trx);
        const reg = canRegister(membership);
        if (!reg.ok) {
          if (reg.code === 'PAYMENT_ALREADY_PENDING') {
            const pendingTerm = await membershipRepository.findPendingPaymentForMembership(membership.id, trx);
            const pay = await trx('payments')
              .where({ membership_term_id: pendingTerm.id })
              .whereIn('status', ['INITIATED', 'PENDING'])
              .first();
            throw new AppError('PAYMENT_ALREADY_PENDING', 409, 'Payment already pending', {
              paymentId: pay?.id,
            });
          }
          throw new AppError(reg.code, 409, reg.code);
        }

        if (!membership) {
          membership = await membershipRepository.insertMembership(
            {
              user_id: actor.userId,
              club_id: clubId,
              status: 'PENDING_PAYMENT',
              qr_token: randomToken(16),
            },
            trx,
          );
        } else {
          membership = await membershipRepository.updateMembership(
            membership.id,
            { status: 'PENDING_PAYMENT', updated_at: trx.fn.now() },
            trx,
          );
        }

        const term = await membershipRepository.insertTerm(
          {
            membership_id: membership.id,
            club_id: clubId,
            user_id: actor.userId,
            kind: 'JOIN',
            source: 'MANUAL',
            ...planSnapshot(plan),
            status: 'PENDING_PAYMENT',
          },
          trx,
        );

        if (Number(plan.feePaise) === 0) {
          const result = await activateFreeTerm(trx, membership, term, plan);
          return { membership: result.membership, term, payment: null };
        }

        const payment = await paymentService.create(
          {
            clubId,
            userId: actor.userId,
            purpose: 'MEMBERSHIP_JOIN',
            membershipTermId: term.id,
            amountPaise: Number(plan.feePaise),
          },
          trx,
        );

        return { membership, term, payment };
      });
    },

    async renew(actor, membershipId, planId, expectedFeePaise) {
      await assertVerified(actor.userId);
      const membership = await membershipRepository.findMembershipById(membershipId);
      assertFound(membership, 'Membership not found');
      if (membership.userId !== actor.userId) {
        throw new AppError('FORBIDDEN', 403, 'Forbidden');
      }
      const renewCheck = canRenew(membership);
      if (!renewCheck.ok) {
        throw new AppError(renewCheck.code, 409, renewCheck.code);
      }

      const plan = await membershipRepository.findPlan(planId);
      await assertPlanAvailable(plan, membership.clubId, expectedFeePaise);

      return withTransaction(async (trx) => {
        const locked = await membershipRepository.findMembershipForUserClub(
          actor.userId,
          membership.clubId,
          trx,
        );
        const term = await membershipRepository.insertTerm(
          {
            membership_id: locked.id,
            club_id: locked.clubId,
            user_id: actor.userId,
            kind: 'RENEWAL',
            source: 'MANUAL',
            ...planSnapshot(plan),
            status: 'PENDING_PAYMENT',
          },
          trx,
        );

        if (Number(plan.feePaise) === 0) {
          const result = await activateFreeTerm(trx, locked, term, plan);
          return { term, payment: null, membership: result.membership };
        }

        const payment = await paymentService.create(
          {
            clubId: locked.clubId,
            userId: actor.userId,
            purpose: 'MEMBERSHIP_RENEWAL',
            membershipTermId: term.id,
            amountPaise: Number(plan.feePaise),
          },
          trx,
        );
        return { term, payment, membership: locked };
      });
    },

    async listMine(userId) {
      const rows = await membershipRepository.listMyMemberships(userId);
      return Promise.all(
        rows.map((m) => membershipSummary(membershipRepository.db, m, { clubRepository, membershipRepository })),
      );
    },

    async getDetail(userId, membershipId) {
      const membership = await membershipRepository.findMembershipById(membershipId);
      assertFound(membership, 'Membership not found');
      if (membership.userId !== userId) throw new AppError('FORBIDDEN', 403, 'Forbidden');
      const summary = await membershipSummary(membershipRepository.db, membership, {
        clubRepository,
        membershipRepository,
      });
      const terms = await membershipRepository.db('membership_terms')
        .where({ membership_id: membershipId })
        .orderBy('created_at', 'desc');
      const termIds = terms.map((t) => t.id);
      const current = terms.find(
        (t) => t.status === 'PAID' && t.starts_on <= todayIST() && t.ends_on >= todayIST(),
      );
      const payments = termIds.length
        ? await membershipRepository.db('payments').whereIn('membership_term_id', termIds).orderBy('created_at', 'desc')
        : [];
      const pendingPayment =
        payments.find((p) => ['INITIATED', 'PENDING'].includes(p.status) && p.method === 'SIMULATED') ?? null;
      const renewalOptions = await membershipRepository.listPlansForClub(membership.clubId, false);
      const consents = await membershipRepository.db('autopay_consents')
        .where({ membership_id: membershipId })
        .orderBy('created_at', 'desc');
      const renewalAttempts = await membershipRepository.db('renewal_attempts')
        .where({ membership_id: membershipId })
        .orderBy('created_at', 'desc');
      const verified = await authService.isVerifiedStudent(userId);
      return {
        ...summary,
        benefits: current
          ? {
              planName: current.plan_name,
              eventDiscountBps: current.event_discount_bps,
              merchDiscountBps: current.merch_discount_bps,
              earlyBirdAccess: current.early_bird_access,
              benefitsText: current.benefits_text,
            }
          : null,
        terms: terms.map((t) => toCamelCase(t)),
        payments: payments.map((p) => toCamelCase(p)),
        pendingPayment: pendingPayment ? toCamelCase(pendingPayment) : null,
        renewalOptions: renewalOptions.map((p) => ({
          planId: p.id,
          name: p.name,
          feePaise: Number(p.feePaise),
          durationMonths: p.durationMonths,
        })),
        autopay: {
          enabled: membership.autopayEnabled,
          planId: membership.autopayPlanId,
          amountPaise: membership.autopayAmountPaise,
          nextAttemptOn: membership.autopayEnabled ? membership.expiresOn : null,
        },
        consents: consents.map((c) => toCamelCase(c)),
        renewalAttempts: renewalAttempts.map((r) => toCamelCase(r)),
        verifiedStudent: verified,
      };
    },

    async setAutopay(userId, membershipId, body) {
      const membership = await membershipRepository.findMembershipById(membershipId);
      assertFound(membership, 'Membership not found');
      if (membership.userId !== userId) throw new AppError('FORBIDDEN', 403, 'Forbidden');
      if (body.enabled) {
        if (effectiveMembershipStatus(membership) !== 'ACTIVE') {
          throw new AppError('MEMBERSHIP_NOT_ACTIVE', 422, 'Membership not active');
        }
        if (!body.acknowledgeSimulated || !body.consentTextVersion) {
          throw new AppError('ACK_REQUIRED', 400, 'AutoPay acknowledgement required');
        }
        const plan = await membershipRepository.findPlan(body.planId);
        if (!plan || plan.clubId !== membership.clubId || plan.status !== 'ACTIVE') {
          throw new AppError('PLAN_NOT_AVAILABLE', 422, 'Plan not available');
        }
        await membershipRepository.updateMembership(membershipId, {
          autopay_enabled: true,
          autopay_plan_id: plan.id,
          autopay_amount_paise: plan.feePaise,
        });
        await membershipRepository.db('autopay_consents').insert({
          membership_id: membershipId,
          user_id: userId,
          action: 'ENABLED',
          plan_id: plan.id,
          consented_amount_paise: plan.feePaise,
          consent_text_version: body.consentTextVersion,
        });
      } else {
        await membershipRepository.updateMembership(membershipId, { autopay_enabled: false });
        await membershipRepository.db('autopay_consents').insert({
          membership_id: membershipId,
          user_id: userId,
          action: 'DISABLED',
          plan_id: membership.autopayPlanId,
          consented_amount_paise: membership.autopayAmountPaise,
          consent_text_version: null,
        });
      }
      const updated = await membershipRepository.findMembershipById(membershipId);
      return {
        enabled: updated.autopayEnabled,
        planId: updated.autopayPlanId,
        amountPaise: updated.autopayAmountPaise,
        nextAttemptOn: updated.autopayEnabled ? updated.expiresOn : null,
      };
    },

    async listClubMembers(actorUserId, clubId, query) {
      const head = await authz.isClubHead(actorUserId, clubId);
      const tr = await authz.isTreasurer(actorUserId, clubId);
      if (!head && !tr) throw new AppError('FORBIDDEN', 403, 'Forbidden');
      const { page, pageSize, offset } = parsePagination(query, { page: 1, pageSize: 20, maxPageSize: 100 });
      const { rows, total } = await membershipRepository.listClubMemberships(clubId, {
        q: query.q,
        status: query.status,
        planId: query.planId,
        expiringWithin: query.expiringWithin,
        offset,
        limit: pageSize,
      });
      const data = await Promise.all(
        rows.map(async (r) => {
          const m = toCamelCase(r);
          m.effectiveStatus = effectiveMembershipStatus(m);
          const summary = await membershipSummary(membershipRepository.db, m, {
            clubRepository,
            membershipRepository,
          });
          const verified = await authService.isVerifiedStudent(m.userId);
          return {
            ...summary,
            userId: m.userId,
            fullName: r.full_name,
            email: r.email,
            verificationStatus: verified ? 'VERIFIED' : 'NOT_VERIFIED',
          };
        }),
      );
      return paginatedResponse(data, page, pageSize, total);
    },

    async getDigitalId(userId, membershipId) {
      const membership = await membershipRepository.findMembershipById(membershipId);
      assertFound(membership, 'Not found');
      if (membership.userId !== userId) throw new AppError('FORBIDDEN', 403, 'Forbidden');
      const eff = effectiveMembershipStatus(membership);
      if (!['ACTIVE', 'EXPIRED'].includes(eff) && !membership.memberNumber) {
        throw new AppError('MEMBERSHIP_NEVER_ACTIVATED', 422, 'Membership never activated');
      }
      const club = await clubRepository.findById(membership.clubId);
      const plan = membership.currentPlanId
        ? await membershipRepository.findPlan(membership.currentPlanId)
        : null;
      const user = await authService.getUserPublic(userId);
      const qrPayload = buildMembershipQrPayload(membership.qrToken);
      const qrSvg = await renderQrSvg(qrPayload);
      return {
        memberName: user?.fullName,
        clubName: club?.name,
        memberNumber: membership.memberNumber,
        planName: plan?.name,
        effectiveStatus: eff,
        expiresOn: membership.expiresOn,
        qrPayload,
        qrSvg,
      };
    },

    async rotateDigitalId(userId, membershipId) {
      const membership = await membershipRepository.findMembershipById(membershipId);
      assertFound(membership, 'Not found');
      if (membership.userId !== userId) throw new AppError('FORBIDDEN', 403, 'Forbidden');
      const token = randomToken(16);
      await membershipRepository.updateMembership(membershipId, { qr_token: token });
      return this.getDigitalId(userId, membershipId);
    },

    async verifyMembershipQr(actorUserId, qrPayload, requestId) {
      const { parseMembershipQrPayload } = await import('../../shared/qr.js');
      const token = parseMembershipQrPayload(qrPayload);
      if (!token) throw new AppError('INVALID_QR_FORMAT', 400, 'Invalid QR format');
      const membership = await membershipRepository.findByQrToken(token);
      assertFound(membership, 'Not found');
      // Authorization checked in controller via TEAM/STAFF
      const club = await clubRepository.findById(membership.clubId);
      const plan = membership.currentPlanId
        ? await membershipRepository.findPlan(membership.currentPlanId)
        : null;
      const user = await authService.getUserPublic(membership.userId);
      return {
        memberName: user?.fullName,
        clubName: club?.name,
        memberNumber: membership.memberNumber,
        planName: plan?.name,
        effectiveStatus: effectiveMembershipStatus(membership),
        expiresOn: membership.expiresOn,
      };
    },
  };
}
