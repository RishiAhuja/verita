import { authenticateOpsRequest } from "@/services/auth/ops-auth";
import { toErrorResponse } from "@/lib/errors";
import { buildPaginatedResponse, getPagination, paginationSchema } from "@/lib/pagination";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  try {
    authenticateOpsRequest(request.headers.get("authorization"));

    const { searchParams } = new URL(request.url);
    const query = paginationSchema.parse(Object.fromEntries(searchParams));
    const pagination = getPagination(query);

    const [items, total] = await Promise.all([
      prisma.customer.findMany({
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.take,
        include: {
          _count: {
            select: {
              usageEvents: true,
              invoices: true,
            },
          },
        },
      }),
      prisma.customer.count(),
    ]);

    return Response.json(
      buildPaginatedResponse({
        items: items.map((customer) => ({
          id: customer.id,
          name: customer.name,
          email: customer.email,
          status: customer.status,
          usage_event_count: customer._count.usageEvents,
          invoice_count: customer._count.invoices,
          created_at: customer.createdAt.toISOString(),
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
