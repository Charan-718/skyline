import { pageResponse } from '../../shared/pagination.js';

const iso = (v) => (v ? new Date(v).toISOString() : null);

export function createNotificationController({ notifications }) {
  return Object.freeze({
    async outbox(req, res) {
      const { rows, total } = await notifications.outbox(req.valid.query);
      const data = rows.map(({ row, message }) => ({
        id: row.id,
        channel: row.channel,
        template: row.template,
        recipientUserId: row.recipient_user_id,
        destination: row.destination,
        subject: message.subject,
        text: message.text,
        status: row.status,
        attempts: row.attempts,
        lastError: row.last_error,
        provider: row.provider,
        createdAt: iso(row.created_at),
        sentAt: iso(row.sent_at),
      }));
      res.json(pageResponse(data, req.valid.query, total));
    },
  });
}
