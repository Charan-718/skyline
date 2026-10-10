import { randomToken, ticketCode } from '../../../shared/tokens.js';
import { now } from '../../../shared/clock.js';

export function createTicketPaymentHandler({
  eventRepository,
  ledgerService,
  notificationService,
  authService,
}) {
  return {
    purpose: 'EVENT_TICKET',
    async onSucceeded(payment, trx) {
      const booking = await eventRepository.findBooking(payment.bookingId, trx);
      if (!booking || booking.status !== 'PENDING_PAYMENT') return null;

      const [updated] = await trx('bookings')
        .where({ id: booking.id, status: 'PENDING_PAYMENT' })
        .update({ status: 'CONFIRMED', confirmed_at: now() })
        .returning('*');
      if (!updated) return null;

      let ticket = null;
      for (let i = 0; i < 3; i++) {
        try {
          ticket = await eventRepository.insertTicket(
            {
              booking_id: booking.id,
              event_id: booking.eventId,
              club_id: booking.clubId,
              user_id: booking.userId,
              ticket_code: ticketCode(),
              qr_token: randomToken(16),
              status: 'VALID',
            },
            trx,
          );
          break;
        } catch (err) {
          if (err.code !== '23505') throw err;
        }
      }

      await ledgerService.postPaymentIncome(trx, payment, {
        eventId: booking.eventId,
        description: `Ticket sale ${payment.reference}`,
      });

      const user = await authService.getUserPublic(booking.userId);
      if (user?.email) {
        await notificationService.enqueue(trx, {
          recipientUserId: booking.userId,
          channel: 'EMAIL',
          template: 'BOOKING_CONFIRMED',
          clubId: booking.clubId,
          destination: user.email,
          dedupeKey: `booking-confirmed:${booking.id}:EMAIL`,
          payload: { eventId: booking.eventId, ticketCode: ticket?.ticketCode },
        });
      }

      return { ticket, booking: updated };
    },

    async onFailed(payment, reason, trx) {
      const booking = await eventRepository.findBooking(payment.bookingId, trx);
      if (!booking || !['PENDING_PAYMENT'].includes(booking.status)) return;
      const status = reason === 'HOLD_EXPIRED' || reason === 'EXPIRED' ? 'EXPIRED' : 'CANCELLED';
      await trx('bookings')
        .where({ id: booking.id })
        .update({
          status,
          cancelled_at: status === 'CANCELLED' ? now() : null,
          cancel_reason: reason,
        });
      await eventRepository.releaseSeat(booking.eventId, booking.usesEarlyBird, trx);
    },
  };
}
