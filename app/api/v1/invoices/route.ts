import { authenticateCustomerApiKey } from "@/services/auth/api-key";
import { tenantScopeFor } from "@/services/auth/tenant";
import { serializeInvoice } from "@/services/billing/invoice-service";
import { toErrorResponse } from "@/lib/errors";
import { buildPaginatedResponse, getPagination, paginationSchema } from "@/lib/pagination";
import { InvoiceStatus } from "@verita/database";
import { z } from "zod";

const invoiceQuerySchema = paginationSchema.extend({
  status: z.nativeEnum(InvoiceStatus).optional(),
});

export async function GET(request: Request) {
  try {
    const auth = await authenticateCustomerApiKey(
      request.headers.get("authorization"),
    );
    const tenant = tenantScopeFor(auth.customer);

    const { searchParams } = new URL(request.url);
    const query = invoiceQuerySchema.parse(Object.fromEntries(searchParams));
    const pagination = getPagination(query);

    const { items, total } = await tenant.listInvoices({
      ...pagination,
      status: query.status,
    });

    return Response.json(
      buildPaginatedResponse({
        items: items.map(serializeInvoice),
        total,
        page: query.page,
        pageSize: query.pageSize,
      }),
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
