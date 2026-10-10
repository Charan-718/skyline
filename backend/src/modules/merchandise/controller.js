import { pageResponse } from '../../shared/pagination.js';
import * as dto from './dto.js';

export function createMerchandiseController({ catalogue, stock, orders }) {
  const meta = (req) => ({ requestId: req.id });

  async function orderList(req, res, { rows, total }, { showPickupCode, withBuyer }) {
    const d = await orders.describe(rows);
    res.json(
      pageResponse(
        rows.map((o) => dto.toOrderDto(o, { items: d.items(o.id), payment: d.payment(o.id), showPickupCode, buyer: withBuyer ? d.buyer(o.user_id) : undefined })),
        req.valid.query,
        total,
      ),
    );
  }

  return Object.freeze({
    listCategories: async (req, res) => res.json({ data: (await catalogue.listCategories(req.valid.params.clubId)).map(dto.toCategoryDto) }),
    createCategory: async (req, res) => res.status(201).json({ data: dto.toCategoryDto(await catalogue.createCategory(req.actor, req.valid.params.clubId, req.valid.body)) }),
    listProducts: async (req, res) => res.json({ data: (await catalogue.listProducts(req.actor ?? null, req.valid.params.clubId, req.valid.query)).map(dto.toProductDto) }),
    getProduct: async (req, res) => res.json({ data: dto.toProductDto(await catalogue.getProduct(req.actor ?? null, req.valid.params.productId)) }),
    createProduct: async (req, res) => {
      const p = await catalogue.createProduct(req.actor, req.valid.params.clubId, req.valid.body, meta(req));
      res.status(201).json({ data: dto.toProductDto(await catalogue.getProduct(req.actor, p.id)) });
    },
    updateProduct: async (req, res) => {
      await catalogue.updateProduct(req.actor, req.valid.params.productId, req.valid.body, meta(req));
      res.json({ data: dto.toProductDto(await catalogue.getProduct(req.actor, req.valid.params.productId)) });
    },
    setStatus: async (req, res) => {
      await catalogue.setStatus(req.actor, req.valid.params.productId, req.valid.body.status, meta(req));
      res.json({ data: dto.toProductDto(await catalogue.getProduct(req.actor, req.valid.params.productId)) });
    },
    addVariant: async (req, res) => res.status(201).json({ data: dto.toVariantDto(await catalogue.addVariant(req.actor, req.valid.params.productId, req.valid.body, meta(req))) }),
    updateVariant: async (req, res) => res.json({ data: dto.toVariantDto(await catalogue.updateVariant(req.actor, req.valid.params.variantId, req.valid.body, meta(req))) }),
    adjustStock: async (req, res) => res.json({ data: dto.toVariantDto(await stock.adjust(req.actor, req.valid.params.variantId, req.valid.body, meta(req))) }),
    inventory: async (req, res) => res.json({ data: (await stock.inventory(req.valid.params.clubId)).map(dto.toInventoryDto) }),
    alerts: async (req, res) => res.json({ data: (await stock.alerts(req.valid.params.clubId, req.valid.query)).map(dto.toAlertDto) }),
    quote: async (req, res) => res.json({ data: await orders.quote(req.actor, req.valid.params.clubId, req.valid.query.items) }),
    placeOrder: async (req, res) => {
      const { order, payment } = await orders.place(req.actor, req.valid.params.clubId, req.valid.body);
      const d = await orders.describe([order]);
      res.status(201).json({ data: { order: dto.toOrderDto(order, { items: d.items(order.id), payment, showPickupCode: true }), payment: { id: payment.id, status: payment.status, amountPaise: payment.amount_paise, reference: payment.reference, isSimulated: payment.is_simulated } } });
    },
    cancelOrder: async (req, res) => {
      const order = await orders.cancel(req.actor, req.valid.params.orderId);
      const d = await orders.describe([order]);
      res.json({ data: dto.toOrderDto(order, { items: d.items(order.id), payment: d.payment(order.id), showPickupCode: true }) });
    },
    myOrders: (req, res) => orders.listMine(req.actor, req.valid.query).then((page) => orderList(req, res, page, { showPickupCode: true, withBuyer: false })),
    myOrder: async (req, res) => {
      const order = await orders.getMine(req.actor, req.valid.params.orderId);
      const d = await orders.describe([order], { withPayments: true });
      res.json({ data: dto.toOrderDto(order, { items: d.items(order.id), payment: d.payment(order.id), showPickupCode: true, history: d.history }) });
    },
    clubOrders: (req, res) => orders.listForClub(req.valid.params.clubId, req.valid.query).then((page) => orderList(req, res, page, { showPickupCode: false, withBuyer: true })),
    pickup: async (req, res) => {
      const order = await orders.pickup(req.actor, req.valid.params.clubId, req.valid.body.pickupCode, meta(req));
      const d = await orders.describe([order]);
      res.json({ data: dto.toOrderDto(order, { items: d.items(order.id), buyer: d.buyer(order.user_id) }) });
    },
  });
}
