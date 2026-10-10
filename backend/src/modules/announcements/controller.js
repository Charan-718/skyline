export function createAnnouncementController({ announcementService }) {
  return {
    async create(req, res) {
      const ann = await announcementService.create({ userId: req.userId }, req.params.clubId, req.body);
      res.status(201).json({ data: ann });
    },

    async publish(req, res) {
      const result = await announcementService.publish({ userId: req.userId }, req.params.id);
      res.json({ data: result });
    },

    async list(req, res) {
      const items = await announcementService.list(req.query);
      res.json({ data: items });
    },

    async get(req, res) {
      const ann = await announcementService.get(req.params.id);
      res.json({ data: ann });
    },
  };
}
