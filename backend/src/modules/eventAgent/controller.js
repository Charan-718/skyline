export function createEventAgentController({ eventAgentService }) {
  return Object.freeze({
    status(_req, res) {
      res.json({ data: { available: eventAgentService.available() } });
    },
    async createTurn(req, res) {
      res.json({ data: await eventAgentService.createTurn({ userId: req.userId }, req.params.clubId, req.body) });
    },
    async editTurn(req, res) {
      res.json({ data: await eventAgentService.editTurn({ userId: req.userId }, req.params.eventId, req.body) });
    },
  });
}
