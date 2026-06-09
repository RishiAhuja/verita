import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function getPagination(query: {
  page: number;
  pageSize: number;
}) {
  const skip = (query.page - 1) * query.pageSize;
  return {
    skip,
    take: query.pageSize,
  };
}

export function buildPaginatedResponse<T>(params: {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}) {
  return {
    items: params.items,
    pagination: {
      page: params.page,
      pageSize: params.pageSize,
      total: params.total,
      totalPages: Math.ceil(params.total / params.pageSize),
    },
  };
}
