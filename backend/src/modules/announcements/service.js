import { AppError, assertFound } from '../../shared/errors.js';
import { withTransaction } from '../../db/transaction.js';
import { todayIST } from '../../shared/clock.js';
import { parsePagination, paginatedResponse } from '../../shared/pagination.js';

function buildDeliveryCountsMap(rows) {
  const map = {};
  for (const d of rows) {
    const id = d.announcement_id ?? d.announcementId;
    if (!map[id]) map[id] = { total: 0 };
    map[id][d.status] = (map[id][d.status] || 0) + 1;
    map[id].total += 1;
  }
  return map;
}

export function createAnnouncementService({
  announcementRepository,
  membershipRepository,
  eventRepository,
  authRepository,
  notificationService,
  authz,
}) {
  const db = announcementRepository.db;

  async function deliveryCountsFor(ids) {
    if (!ids.length) return {};
    const rows = await db('notification_deliveries').whereIn('announcement_id', ids).select('announcement_id', 'status');
    return buildDeliveryCountsMap(rows);
  }

  function withDeliveryCounts(ann, countsById) {
    return { ...ann, deliveryCounts: countsById[ann.id] || { total: 0 } };
  }

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

    async listForClub(actor, clubId, query) {
      if (actor?.userId) {
        await authz.requireClubHead(actor.userId, clubId);
      }
      let rows = await announcementRepository.listForClub(clubId);
      if (query.status) rows = rows.filter((a) => a.status === query.status);
      const countsById = await deliveryCountsFor(rows.map((a) => a.id));
      return rows.map((a) => withDeliveryCounts(a, countsById));
    },

    async updateDraft(actor, id, dto) {
      const ann = await announcementRepository.findById(id);
      assertFound(ann, 'Not found');
      await authz.requireClubHead(actor.userId, ann.clubId);
      if (ann.status !== 'DRAFT') {
        throw new AppError('ANNOUNCEMENT_IMMUTABLE', 409, 'Published announcements cannot be edited');
      }
      const patch = {};
      if (dto.title != null) patch.title = dto.title;
      if (dto.body != null) patch.body = dto.body;
      if (dto.category != null) patch.category = dto.category;
      if (dto.audience != null) patch.audience = dto.audience;
      if (dto.sendEmail != null) patch.send_email = dto.sendEmail;
      if (dto.eventId !== undefined) patch.event_id = dto.eventId;
      const updated = await announcementRepository.updateDraft(id, patch, announcementRepository.db);
      if (!updated) throw new AppError('ANNOUNCEMENT_IMMUTABLE', 409, 'Cannot update');
      return updated;
    },

    async removeDraft(actor, id) {
      const ann = await announcementRepository.findById(id);
      assertFound(ann, 'Not found');
      await authz.requireClubHead(actor.userId, ann.clubId);
      if (ann.status !== 'DRAFT') {
        throw new AppError('ANNOUNCEMENT_IMMUTABLE', 409, 'Published announcements cannot be deleted');
      }
      await announcementRepository.deleteDraft(id);
    },

    async listDeliveries(actor, id, query) {
      const ann = await announcementRepository.findById(id);
      assertFound(ann, 'Not found');
      await authz.requireClubHead(actor.userId, ann.clubId);
      let q = announcementRepository.db('notification_deliveries as d')
        .leftJoin('users as u', 'u.id', 'd.recipient_user_id')
        .where('d.announcement_id', id);
      if (query.status) q = q.andWhere('d.status', query.status);
      const all = await announcementRepository.db('notification_deliveries').where({ announcement_id: id });
      const counts = all.reduce((acc, d) => ({ ...acc, [d.status]: (acc[d.status] || 0) + 1 }), {});
      const rows = await q
        .orderBy('d.created_at', 'desc')
        .select('d.*', 'u.full_name as recipient_name');
      return {
        total: all.length,
        counts,
        rows: rows.map((r) => ({
          id: r.id,
          recipientName: r.recipient_name,
          channel: r.channel,
          status: r.status,
          attempts: r.attempts,
          lastError: r.last_error,
          createdAt: r.created_at,
        })),
      };
    },
  };
}
