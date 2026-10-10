export function createReportingController({ reporting }) {
  return Object.freeze({
    async financeReport(req, res) {
      res.json({ data: await reporting.financeReport(req.valid.params.clubId, req.valid.query) });
    },
  });
}
