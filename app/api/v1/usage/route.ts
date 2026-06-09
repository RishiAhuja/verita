import { authenticateCustomerApiKey } from "@/services/auth/api-key";
import { tenantScopeFor } from "@/services/auth/tenant";
import { toErrorResponse } from "@/lib/errors";
import { buildPaginatedResponse, getPagination, paginationSchema } from "@/lib/pagination";
import { z } from "zod";

const usageQuerySchema = paginationSchema.extend({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  api_key_id: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  try {
    const auth = await authenticateCustomerApiKey(
      request.headers.get("authorization"),
    );
    const tenant = tenantScopeFor(auth.customer);

    const { searchParams } = new URL(request.url);
    const query = usageQuerySchema.parse(Object.fromEntries(searchParams));
    const pagination = getPagination(query);

    const { items, total } = await tenant.listUsage({
      ...pagination,
      from: query.from,
      to: query.to,
      apiKeyId: query.api_key_id,
    });

    return Response.json(
      buildPaginatedResponse({
        items: items.map((row) => ({
          customer_id: row.customerId,
          api_key_id: row.apiKeyId,
          endpoint: row.endpoint,
          hour_start: row.hourStart.toISOString(),
          total_units: row.totalUnits,
          event_count: row.eventCount,
        })),
        total,
        page: query.page,
        pageSize: query.pageSize,
      }),
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
