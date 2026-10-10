import { todayIST, addDaysToDate } from '../../shared/clock.js';

// renewal-reminders (LLD §7): every ACTIVE membership whose expires_on is exactly `daysBefore` days
// from today (default 7, IST) and that has not already been renewed gets one EMAIL reminder.
//   autopay_enabled = true  -> "AutoPay will renew your membership on <date>" (nothing to do)
//   autopay_enabled = false -> "your membership expires in 7 days — renew"
// The job runs daily, so each membership is picked up on exactly one day.
// Queued through Group 2's outbox (notification_deliveries); the dispatcher sends them.
//   - dedupe key = membership + expiry date + channel, so re-running never double-sends;
//     `resend: true` (demo only) adds a nonce to send the same reminders again.
//   - a member without an email gets a SKIPPED row (NO_CONTACT).
export const DEFAULT_DAYS_BEFORE = 7;

export function createRenewalRemindersJob({ notifications, appBaseUrl }) {
  return {
    name: 'renewal-reminders',
    async execute(trx, { daysBefore = DEFAULT_DAYS_BEFORE, resend = false } = {}) {
      const today = todayIST();
      const rows = await trx.raw(
        `
        SELECT m.id AS membership_id, m.club_id, m.user_id, m.autopay_enabled,
               to_char(m.expires_on, 'YYYY-MM-DD') AS expires_on,
               c.name AS club_name,
               COALESCE(t.plan_name, p.name, 'Membership') AS plan_name
        FROM memberships m
        JOIN clubs c ON c.id = m.club_id
        LEFT JOIN membership_plans p ON p.id = m.current_plan_id
        LEFT JOIN membership_terms t
          ON t.membership_id = m.id AND t.status = 'PAID' AND t.ends_on = m.expires_on
        WHERE m.status = 'ACTIVE'
          AND m.expires_on = ?
          AND NOT EXISTS (
            SELECT 1 FROM membership_terms r
            WHERE r.membership_id = m.id AND r.status = 'PAID' AND r.starts_on > m.expires_on
          )
        ORDER BY m.expires_on, m.id
        `,
        [addDaysToDate(today, daysBefore)],
      );

      const nonce = resend ? `:r${Date.now()}` : '';
      const items = rows.rows.map((r) => ({
        clubId: r.club_id,
        recipientUserId: r.user_id,
        channel: 'EMAIL',
        template: 'RENEWAL_REMINDER_7D',
        dedupeKey: `renewal-reminder:${r.membership_id}:${r.expires_on}:EMAIL${nonce}`,
        payload: {
          clubName: r.club_name,
          planName: r.plan_name,
          expiresOn: r.expires_on,
          renewUrl: `${appBaseUrl}/me/memberships/${r.membership_id}`,
          autopayEnabled: r.autopay_enabled,
          daysLeft: daysBefore,
        },
      }));
      const result = await notifications.enqueue(trx, items);
      const autopay = rows.rows.filter((r) => r.autopay_enabled).length;
      return { daysBefore, candidates: rows.rows.length, autopay, manual: rows.rows.length - autopay, ...result };
    },
  };
}
