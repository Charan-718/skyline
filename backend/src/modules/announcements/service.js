import { AppError, assertFound } from '../../shared/errors.js';
import { withTransaction } from '../../db/transaction.js';
import { todayIST } from '../../shared/clock.js';
import { parsePagination, paginatedResponse } from '../../shared/pagination.js';

export function createAnnouncementService({
  announcementRepository,
  membershipRepository,
  eventRepository,
  authRepository,
  notificationService,
  authz,
}) {
  return {
    async create(actor, clubId, dto) {
      await authz.requireClubHead(actor.userId, clubId);
      if (dto.eventId) {
        const ev = await eventRepository.findById(dto.eventId);
        if (!ev || ev.clubId !== clubId) {
          throw new AppError('EVENT_NOT_IN_CLUB', 422, 'Event not in club');
        }
      }
      return announcementRepository.insert(
        {
          club_id: clubId,
          event_id: dto.eventId ?? null,
          title: dto.title,
          body: dto.body,
          category: dto.category,
          audience: dto.audience,
          send_email: dto.sendEmail ?? true,
          status: 'DRAFT',
          created_by: actor.userId,
        },
        announcementRepository.db,
      );
    },

    async publish(actor, announcementId) {
      return withTransaction(async (trx) => {
        const ann = await announcementRepository.publish(announcementId, actor.userId, trx);
        if (!ann) throw new AppError('CONFLICT_STATE', 409, 'Not draft');

        await authz.requireClubHead(actor.userId, ann.clubId);

        let recipients = new Set();
        if (ann.sendEmail) {
          const members = await membershipRepository.listActiveMemberUserIds(ann.clubId, todayIST(), trx);
          members.forEach((id) => recipients.add(id));
          if (ann.eventId) {
            const holders = await eventRepository.listTicketHolderUserIds(ann.eventId, trx);
            holders.forEach((id) => recipients.add(id));
          }
        }

        let queued = 0;
        for (const userId of recipients) {
          const user = await authRepository.findUserById(userId, trx);
          if (user?.email) {
            await notificationService.enqueue(trx, {
              clubId: ann.clubId,
              recipientUserId: userId,
              channel: 'EMAIL',
              template: 'ANNOUNCEMENT',
              announcementId: ann.id,
              destination: user.email,
              dedupeKey: `announcement:${ann.id}:${userId}:EMAIL`,
              payload: { title: ann.title, body: ann.body },
            });
            queued += 1;
          }
        }

        return { publishedAt: ann.publishedAt, recipientsQueued: queued };
      });
    },

    async list(query) {
      const { page, pageSize, offset } = parsePagination(query, { page: 1, pageSize: 20, maxPageSize: 100 });
      const { rows, total } = await announcementRepository.listPublished({
        clubId: query.clubId,
        category: query.category,
        offset,
        limit: pageSize,
      });
      return paginatedResponse(rows, page, pageSize, total);
    },

    async get(id) {
      const ann = await announcementRepository.findById(id);
      assertFound(ann, 'Not found');
      return ann;
    },
  };
}
