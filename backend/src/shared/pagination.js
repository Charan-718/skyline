import { z } from 'zod';

export const paginationQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const toOffset = ({ page, pageSize }) => (page - 1) * pageSize;

export const pageResponse = (data, { page, pageSize }, total) => ({ data, page, pageSize, total });

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
