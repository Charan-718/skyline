import { now } from '../../../shared/clock.js';
import { computeTermDates } from '../domain/termDates.js';

export function createMembershipPaymentHandler({
  membershipRepository,
  clubRepository,
  ledgerService,
  notificationService,
}) {
  async function activatePaidTerm(payment, term, trx) {
    const memRow = await trx('memberships').where({ id: term.membershipId }).forUpdate().first();
    const membership = {
      status: memRow.status,
      expiresOn: memRow.expires_on,
      startedOn: memRow.started_on,
      id: memRow.id,
    };
    const { startsOn, endsOn } = computeTermDates(membership, term.durationMonths);
    await trx('membership_terms')
      .where({ id: term.id })
      .update({
        status: 'PAID',
        starts_on: startsOn,
        ends_on: endsOn,
        paid_at: now(),
      });

    let memberNumber = membership.member_number;
    if (!memberNumber) {
      memberNumber = await clubRepository.allocateMemberNumber(term.clubId, trx);
    }

    await trx('memberships')
      .where({ id: membership.id })
      .update({
        status: 'ACTIVE',
        member_number: memberNumber,
        current_plan_id: term.planId,
        started_on: membership.started_on ?? startsOn,
        expires_on: endsOn,
        updated_at: trx.fn.now(),
      });

    const category = term.kind === 'JOIN' ? 'MEMBERSHIP_DUES' : 'MEMBERSHIP_RENEWAL';
    await ledgerService.post(trx, {
      clubId: term.clubId,
      direction: 'IN',
      category,
      amountPaise: Number(payment.amountPaise),
      sourceType: 'PAYMENT',
      sourceId: payment.id,
      paymentId: payment.id,
      membershipId: membership.id,
      payerUserId: payment.userId,
      description: `${category} payment ${payment.reference}`,
      reference: payment.reference,
    });

    if (term.source === 'AUTOPAY') {
      await trx('renewal_attempts')
        .where({ term_id: term.id })
        .update({ status: 'SUCCEEDED', completed_at: now() });
      await notificationService.enqueue(trx, {
        recipientUserId: payment.userId,
        channel: 'EMAIL',
        template: 'AUTOPAY_RESULT',
        clubId: term.clubId,
        dedupeKey: `autopay-result:${payment.id}:EMAIL`,
        payload: { outcome: 'SUCCEEDED', membershipId: membership.id },
      });
    }

    const updatedMembership = await membershipRepository.findMembershipById(membership.id, trx);
    return {
      membershipStatus: updatedMembership.status,
      expiresOn: updatedMembership.expiresOn,
      memberNumber: updatedMembership.memberNumber,
    };
  }

  return {
    purpose: 'MEMBERSHIP_JOIN',
    async onSucceeded(payment, trx) {
      const term = await membershipRepository.findTermForUpdate(payment.membershipTermId, trx);
      if (!term || term.status !== 'PENDING_PAYMENT') return null;
      return activatePaidTerm(payment, term, trx);
    },
    async onFailed(payment, reason, trx) {
      const term = await membershipRepository.findTermForUpdate(payment.membershipTermId, trx);
      if (!term) return;
      await trx('membership_terms').where({ id: term.id }).update({ status: 'FAILED' });
      if (term.kind === 'JOIN') {
        await trx('memberships').where({ id: term.membershipId }).update({ status: 'CANCELLED' });
      }
      if (term.source === 'AUTOPAY') {
        await trx('renewal_attempts')
          .where({ term_id: term.id })
          .update({ status: 'FAILED', completed_at: now() });
        await notificationService.enqueue(trx, {
          recipientUserId: payment.userId,
          channel: 'EMAIL',
          template: 'AUTOPAY_RESULT',
          clubId: term.clubId,
          dedupeKey: `autopay-result:${payment.id}:EMAIL`,
          payload: { outcome: 'FAILED', reason },
        });
      }
    },
  };
}

export function createMembershipRenewalPaymentHandler(deps) {
  const joinHandler = createMembershipPaymentHandler(deps);
  return {
    purpose: 'MEMBERSHIP_RENEWAL',
    onSucceeded: joinHandler.onSucceeded,
    onFailed: joinHandler.onFailed,
  };
}
