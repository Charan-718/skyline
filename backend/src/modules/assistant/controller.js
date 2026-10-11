export function createAssistantController({ assistantService }) {
  return Object.freeze({
    async config(req, res) {
      res.json({ data: await assistantService.config(req.params.eventId, req.userId ?? null) });
    },
    async ask(req, res) {
      res.json({ data: await assistantService.ask(req.params.eventId, req.userId ?? null, req.body) });
    },
  });
}
