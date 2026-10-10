import { z } from 'zod';

// HLD §8: page is 1-based, pageSize default 20, max 100; response { data, page, pageSize, total }.
export const paginationQuery = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const toOffset = ({ page, pageSize }) => (page - 1) * pageSize;

export const pageResponse = (data, { page, pageSize }, total) => ({ data, page, pageSize, total });
