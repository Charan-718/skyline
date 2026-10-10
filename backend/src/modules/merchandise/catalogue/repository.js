// product_categories / products / product_variants data access (LLD §3.1 M7). Club-scoped.

export async function insertCategory(conn, row) {
  const [c] = await conn('product_categories').insert(row).returning('*');
  return c;
}
export const listCategories = (conn, clubId) => conn('product_categories').where({ club_id: clubId }).orderBy('name');
export const findCategory = (conn, id, clubId) => conn('product_categories').where({ id, club_id: clubId }).first();

export async function insertProduct(conn, row) {
  const [p] = await conn('products').insert(row).returning('*');
  return p;
}
export const findProduct = (conn, id) => conn('products').where({ id }).first();
export async function updateProduct(conn, id, changes, { expectedStatus } = {}) {
  const q = conn('products').where({ id });
  if (expectedStatus) q.where({ status: expectedStatus });
  const [p] = await q.update(changes).returning('*');
  return p ?? null;
}
export function listProducts(conn, clubId, { statuses, categoryId }) {
  const q = conn('products').where({ club_id: clubId });
  if (statuses) q.whereIn('status', statuses);
  if (categoryId) q.where({ category_id: categoryId });
  return q.orderBy([{ column: 'name' }, { column: 'id' }]);
}

export async function insertVariant(conn, row) {
  const [v] = await conn('product_variants').insert(row).returning('*');
  return v;
}
export const findVariant = (conn, id) => conn('product_variants').where({ id }).first();
export const findVariantForUpdate = (trx, id) => trx('product_variants').where({ id }).forUpdate().first();
export async function updateVariant(conn, id, changes) {
  const [v] = await conn('product_variants').where({ id }).update(changes).returning('*');
  return v;
}
export function variantsOfProducts(conn, productIds) {
  if (!productIds.length) return Promise.resolve([]);
  return conn('product_variants').whereIn('product_id', productIds).orderBy([{ column: 'product_id' }, { column: 'size_label' }]);
}
/** Variants with their product, restricted to one club. */
export function variantsWithProducts(conn, clubId, variantIds) {
  return conn('product_variants as v')
    .join('products as p', 'p.id', 'v.product_id')
    .where('v.club_id', clubId)
    .whereIn('v.id', variantIds)
    .select('v.*', conn.raw('row_to_json(p.*) AS product'));
}
