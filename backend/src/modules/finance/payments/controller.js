export function createPaymentController({ paymentService }) {
  return {
    async getPayment(req, res) {
      const payment = await paymentService.getPayment(req.userId, req.params.paymentId);
      res.json({ data: payment });
    },

    async simulate(req, res) {
      const { payment, result } = await paymentService.simulate(req.userId, req.params.paymentId, req.body.outcome);
      res.json({
        data: {
          ...payment,
          result: result ?? undefined,
        },
      });
    },

    async listMine(req, res) {
      const body = await paymentService.listMine(req.userId, req.query);
      res.json(body);
    },
  };
}
