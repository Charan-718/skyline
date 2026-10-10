import { appError, isAppError } from '../../../shared/errors.js';
import { record as auditRecord } from '../../../shared/audit.js';
import { canTransitionProduct, isOrderable, offerProblems, pricingView } from '../domain/productRules.js';
import { available } from '../domain/stockRules.js';
import * as stockRepo from '../stock/repository.js';
import * as repository from './repository.js';

// Catalogue: categories, products, size variants, offers, status (LLD §2.8, §4.7; T-60).

export function createCatalogueService({ db, withTransaction, clock, access, pricing, memberships, stock, config }) {
  const invalid = (fields) => appError('VALIDATION_FAILED', { fields });

  async function loadProductAsHead(actor, productId) {
    const product = await repository.findProduct(db, productId);
    if (!product) throw appError('NOT_FOUND');
    await access.requireRole(actor, product.club_id, ['CLUB_HEAD']);
    return product;
  }

  async function assertCategory(conn, categoryId, clubId) {
    if (!(await repository.findCategory(conn, categoryId, clubId))) throw invalid([{ path: 'categoryId', message: 'unknown category for this club' }]);
  }

  /** Caller-specific unit price (LLD §4.7 "display price, if signed in"). */
  async function displayPrice(actor, product) {
    if (!actor) return undefined;
    const benefits = await memberships.getActiveBenefits(actor.userId, product.club_id, clock.todayIST());
    try {
      const q = await pricing.quoteMerchItem(pricingView(product), benefits, clock.now(), { mode: config.pricingCombinationMode });
      return { listPricePaise: q.listPricePaise, discountPaise: q.discountPaise, finalPricePaise: q.finalPricePaise, priceRule: q.priceRule };
    } catch (err) {
      if (isAppError(err) && err.code === 'MEMBERS_ONLY_PRODUCT') return null;
      throw err;
    }
  }

  async function withVariants(actor, products, { includeStock }) {
    const variants = await repository.variantsOfProducts(db, products.map((p) => p.id));
    return Promise.all(
      products.map(async (p) => ({
        product: p,
        variants: variants
          .filter((v) => v.product_id === p.id)
          .map((v) => ({ variant: v, available: available(v), orderable: isOrderable(p, v) && available(v) > 0 })),
        includeStock,
        displayPrice: await displayPrice(actor, p),
      })),
    );
  }

  async function listCategories(clubId) {
    return repository.listCategories(db, clubId);
  }

  async function createCategory(actor, clubId, { name }) {
    return repository.insertCategory(db, { club_id: clubId, name });
  }

  /** PUBLIC: ACTIVE products. CH with ?all=true: every status, with stock figures. */
  async function listProducts(actor, clubId, { all, categoryId }) {
    if (all) await access.requireRole(actor, clubId, ['CLUB_HEAD']);
    const products = await repository.listProducts(db, clubId, { statuses: all ? null : ['ACTIVE'], categoryId });
    return withVariants(actor, products, { includeStock: Boolean(all) });
  }

  async function getProduct(actor, productId) {
    const product = await repository.findProduct(db, productId);
    if (!product) throw appError('NOT_FOUND');
    let isHead = false;
    if (actor) isHead = (await access.standing(actor.userId, product.club_id)).roles.has('CLUB_HEAD');
    if (product.status !== 'ACTIVE' && !isHead) throw appError('NOT_FOUND');
    return (await withVariants(actor, [product], { includeStock: isHead }))[0];
  }

  async function insertVariant(trx, product, actor, { sizeLabel, initialStock, lowStockThreshold }) {
    const variant = await repository.insertVariant(trx, {
      product_id: product.id,
      club_id: product.club_id,
      size_label: sizeLabel,
      stock_on_hand: initialStock,
      low_stock_threshold: lowStockThreshold ?? config.defaultLowStockThreshold,
    });
    if (initialStock > 0) {
      await stockRepo.insertMovement(trx, { variant_id: variant.id, club_id: product.club_id, type: 'RESTOCK', quantity: initialStock, reason: 'Initial stock', actor_user_id: actor.userId });
    }
    return variant;
  }

  /** POST /clubs/:clubId/products (CH): DRAFT product + variants + RESTOCK movements; audited. */
  async function createProduct(actor, clubId, dto, { requestId } = {}) {
    const problems = offerProblems(dto);
    const sizes = dto.variants.map((v) => v.sizeLabel.toUpperCase());
    if (new Set(sizes).size !== sizes.length) problems.push({ path: 'variants', message: 'size labels must be unique' });
    if (problems.length) throw invalid(problems);
    return withTransaction(async (trx) => {
      await assertCategory(trx, dto.categoryId, clubId);
      const product = await repository.insertProduct(trx, {
        club_id: clubId,
        category_id: dto.categoryId,
        name: dto.name,
        description: dto.description,
        price_paise: dto.pricePaise,
        member_discount_eligible: dto.memberDiscountEligible,
        available_to_non_members: dto.availableToNonMembers,
        offer_price_paise: dto.offerPricePaise ?? null,
        offer_starts_at: dto.offerStartsAt ?? null,
        offer_ends_at: dto.offerEndsAt ?? null,
        status: 'DRAFT',
        created_by: actor.userId,
      });
      for (const v of dto.variants) await insertVariant(trx, product, actor, v);
      await auditRecord(trx, { actorUserId: actor.userId, clubId, action: 'PRODUCT_CREATED', entityType: 'product', entityId: product.id, metadata: { name: dto.name, pricePaise: dto.pricePaise }, requestId });
      return product;
    });
  }

  const FIELD_COLUMNS = {
    categoryId: 'category_id',
    name: 'name',
    description: 'description',
    pricePaise: 'price_paise',
    memberDiscountEligible: 'member_discount_eligible',
    availableToNonMembers: 'available_to_non_members',
    offerPricePaise: 'offer_price_paise',
    offerStartsAt: 'offer_starts_at',
    offerEndsAt: 'offer_ends_at',
  };

  /** PATCH /products/:id (CH; no stock fields). Price changes are audited with before/after. */
  async function updateProduct(actor, productId, patch, { requestId } = {}) {
    const product = await loadProductAsHead(actor, productId);
    if (product.status === 'ARCHIVED') throw appError('CONFLICT_STATE', { currentStatus: product.status });
    const merged = {
      pricePaise: patch.pricePaise ?? product.price_paise,
      offerPricePaise: patch.offerPricePaise !== undefined ? patch.offerPricePaise : product.offer_price_paise,
      offerStartsAt: patch.offerStartsAt !== undefined ? patch.offerStartsAt : product.offer_starts_at,
      offerEndsAt: patch.offerEndsAt !== undefined ? patch.offerEndsAt : product.offer_ends_at,
    };
    const problems = offerProblems(merged);
    if (problems.length) throw invalid(problems);
    const changes = {};
    for (const [k, col] of Object.entries(FIELD_COLUMNS)) if (patch[k] !== undefined) changes[col] = patch[k];
    return withTransaction(async (trx) => {
      if (patch.categoryId) await assertCategory(trx, patch.categoryId, product.club_id);
      const updated = await repository.updateProduct(trx, productId, changes);
      const priceChanged = ['price_paise', 'offer_price_paise', 'offer_starts_at', 'offer_ends_at'].some((c) => c in changes);
      await auditRecord(trx, {
        actorUserId: actor.userId,
        clubId: product.club_id,
        action: 'PRODUCT_UPDATED',
        entityType: 'product',
        entityId: productId,
        metadata: priceChanged
          ? { fields: Object.keys(patch), before: { pricePaise: product.price_paise, offerPricePaise: product.offer_price_paise }, after: { pricePaise: updated.price_paise, offerPricePaise: updated.offer_price_paise } }
          : { fields: Object.keys(patch) },
        requestId,
      });
      return updated;
    });
  }

  /** POST /products/:id/status (CH; OQ-20 transitions). */
  async function setStatus(actor, productId, status, { requestId } = {}) {
    const product = await loadProductAsHead(actor, productId);
    if (!canTransitionProduct(product.status, status)) throw appError('CONFLICT_STATE', { currentStatus: product.status });
    return withTransaction(async (trx) => {
      const updated = await repository.updateProduct(trx, productId, { status }, { expectedStatus: product.status });
      if (!updated) throw appError('CONFLICT_STATE', { currentStatus: (await repository.findProduct(trx, productId)).status });
      await auditRecord(trx, { actorUserId: actor.userId, clubId: product.club_id, action: 'PRODUCT_STATUS_CHANGED', entityType: 'product', entityId: productId, metadata: { from: product.status, to: status }, requestId });
      return updated;
    });
  }

  async function addVariant(actor, productId, dto, { requestId } = {}) {
    const product = await loadProductAsHead(actor, productId);
    if (product.status === 'ARCHIVED') throw appError('CONFLICT_STATE', { currentStatus: product.status });
    return withTransaction(async (trx) => {
      const variant = await insertVariant(trx, product, actor, dto);
      await auditRecord(trx, { actorUserId: actor.userId, clubId: product.club_id, action: 'PRODUCT_VARIANT_ADDED', entityType: 'product_variant', entityId: variant.id, metadata: dto, requestId });
      return variant;
    });
  }

  /** PATCH /variants/:id (CH): threshold / active flag; re-evaluates low stock. */
  async function updateVariant(actor, variantId, patch, { requestId } = {}) {
    const variant = await repository.findVariant(db, variantId);
    if (!variant) throw appError('NOT_FOUND');
    await access.requireRole(actor, variant.club_id, ['CLUB_HEAD']);
    const changes = {};
    if (patch.lowStockThreshold !== undefined) changes.low_stock_threshold = patch.lowStockThreshold;
    if (patch.isActive !== undefined) changes.is_active = patch.isActive;
    return withTransaction(async (trx) => {
      const updated = await repository.updateVariant(trx, variantId, changes);
      await stock.evaluate(trx, variantId);
      await auditRecord(trx, { actorUserId: actor.userId, clubId: variant.club_id, action: 'PRODUCT_VARIANT_UPDATED', entityType: 'product_variant', entityId: variantId, metadata: patch, requestId });
      return updated;
    });
  }

  return Object.freeze({ listCategories, createCategory, listProducts, getProduct, createProduct, updateProduct, setStatus, addVariant, updateVariant });
}
