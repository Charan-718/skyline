// Separation of duties for reimbursements (LLD §2.10, OD-06, OQ-21 as decided in Step 3 §B4).
// Pure. Roles are the CURRENT active club roles of each person in the expense's club.
//
// canApprove(actor, expense, club)  — approve and reject
//   1. actor must be TREASURER or CLUB_HEAD                         else FORBIDDEN
//   2. actor ≠ submitter                                             else SELF_APPROVAL_FORBIDDEN
//   3. submitter is CLUB_HEAD and TREASURER → only another CLUB_HEAD else FORBIDDEN
//      ("a head who is also treasurer approves own claims only through the club-head rule")
//   4. submitter is TREASURER → a CLUB_HEAD or another TREASURER     (OD-06 + several treasurers)
//   5. otherwise → a TREASURER                                       else FORBIDDEN
//
// canPay(actor, expense, club)  — mark paid; the same rule as approvals (OQ-44 APPROVED)
//   1. actor must be TREASURER or CLUB_HEAD                         else FORBIDDEN
//   2. actor ≠ payee                                                 else SELF_PAYOUT_FORBIDDEN
//   3. payee is CLUB_HEAD and TREASURER → only another CLUB_HEAD     else FORBIDDEN
//   4. payee is TREASURER → a CLUB_HEAD or another TREASURER
//   5. otherwise → a TREASURER                                       else FORBIDDEN
//
// actor: { userId, roles: Set }   expense: { submitted_by, payee_user_id }
// club:  { submitterRoles: Set, payeeRoles: Set }

const ok = Object.freeze({ allowed: true });
const deny = (code) => ({ allowed: false, code });

const isReviewer = (roles) => roles.has('TREASURER') || roles.has('CLUB_HEAD');

export function canApprove(actor, expense, club) {
  if (!isReviewer(actor.roles)) return deny('FORBIDDEN');
  if (actor.userId === expense.submitted_by) return deny('SELF_APPROVAL_FORBIDDEN');
  return byPersonRoles(actor, club.submitterRoles);
}

// Steps 3–5, shared by approvals and payouts. `person` = submitter or payee roles; the actor is
// already known to be a reviewer and not that person.
function byPersonRoles(actor, person) {
  if (person.has('CLUB_HEAD') && person.has('TREASURER')) return actor.roles.has('CLUB_HEAD') ? ok : deny('FORBIDDEN');
  if (person.has('TREASURER')) return ok;
  return actor.roles.has('TREASURER') ? ok : deny('FORBIDDEN');
}

export function canPay(actor, expense, club) {
  if (!isReviewer(actor.roles)) return deny('FORBIDDEN');
  if (actor.userId === expense.payee_user_id) return deny('SELF_PAYOUT_FORBIDDEN');
  return byPersonRoles(actor, club.payeeRoles);
}
