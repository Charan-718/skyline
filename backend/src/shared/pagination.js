export function parsePagination(query, defaults = { page: 1, pageSize: 20, maxPageSize: 100 }) {
  const page = Math.max(1, Number(query.page) || defaults.page);
  const rawSize = Number(query.pageSize) || defaults.pageSize;
  const pageSize = Math.min(defaults.maxPageSize, Math.max(1, rawSize));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

export function paginatedResponse(data, page, pageSize, total) {
  return { data, page, pageSize, total };
}
