export function createEventController({ eventService }) {
  return {
    async list(req, res) {
      const page = await eventService.listEvents(req.query);
      res.json(page);
    },

    async clubEvents(req, res) {
      const rows = await eventService.listClubEvents(req.userId ?? null, req.params.clubId, req.query);
      res.json({ data: rows });
    },

    async get(req, res) {
      const event = await eventService.getEvent(req.params.eventId, req.userId ?? null);
      res.json({ data: event });
    },

    async quote(req, res) {
      const quote = await eventService.quote({ userId: req.userId }, req.params.eventId);
      res.json({ data: quote });
    },

    async book(req, res) {
      const result = await eventService.book(
        { userId: req.userId },
        req.params.eventId,
        req.body.expectedFinalPricePaise,
      );
      res.status(201).json({ data: result });
    },

    async checkIn(req, res) {
      const result = await eventService.checkIn(
        { userId: req.userId },
        req.params.eventId,
        req.body.qrPayload,
      );
      res.status(201).json({ data: result });
    },

    async create(req, res) {
      const event = await eventService.createEvent({ userId: req.userId }, req.params.clubId, req.body);
      res.status(201).json({ data: event });
    },

    async update(req, res) {
      const event = await eventService.updateEvent({ userId: req.userId }, req.params.eventId, req.body);
      res.json({ data: event });
    },

    async publish(req, res) {
      const event = await eventService.publish({ userId: req.userId }, req.params.eventId);
      res.json({ data: event });
    },

    async cancel(req, res) {
      const result = await eventService.cancelEvent(
        { userId: req.userId },
        req.params.eventId,
        req.body.reason,
      );
      res.json({ data: result });
    },

    async complete(req, res) {
      const event = await eventService.completeEvent({ userId: req.userId }, req.params.eventId);
      res.json({ data: event });
    },

    async organizers(req, res) {
      const rows = await eventService.listOrganizers({ userId: req.userId }, req.params.eventId);
      res.json({ data: rows });
    },

    async setOrganizers(req, res) {
      const rows = await eventService.setOrganizers(
        { userId: req.userId },
        req.params.eventId,
        req.body.userIds,
      );
      res.json({ data: rows });
    },

    async staff(req, res) {
      const payload = await eventService.listStaff({ userId: req.userId }, req.params.eventId);
      res.json({ data: payload });
    },

    async addStaff(req, res) {
      const row = await eventService.addStaff(
        { userId: req.userId },
        req.params.eventId,
        req.body.userId,
      );
      res.status(201).json({ data: row });
    },

    async removeStaff(req, res) {
      await eventService.removeStaff({ userId: req.userId }, req.params.eventId, req.params.userId);
      res.status(204).send();
    },

    async bookings(req, res) {
      const page = await eventService.listBookings({ userId: req.userId }, req.params.eventId, req.query);
      res.json(page);
    },

    async myTickets(req, res) {
      const rows = await eventService.listMyTickets(req.userId);
      res.json({ data: rows });
    },

    async myTicket(req, res) {
      const row = await eventService.getMyTicket(req.userId, req.params.ticketId);
      res.json({ data: row });
    },

    async checkIns(req, res) {
      const stats = await eventService.listCheckIns({ userId: req.userId }, req.params.eventId);
      res.json({ data: stats });
    },
  };
}
