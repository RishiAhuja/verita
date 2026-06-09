import { authenticateOpsRequest } from "@/services/auth/ops-auth";
import { getCustomerAnomalies } from "@/services/ops/anomaly-service";
import { serializeInvoice } from "@/services/billing/invoice-service";
import { toErrorResponse, AppError } from "@/lib/errors";
import { prisma } from "@/lib/db";

export async function GET(
  request: Request,
  context: { params: Promise<{ customerId: string }> },
) {
  try {
    authenticateOpsRequest(request.headers.get("authorization"));
    const { customerId } = await context.params;

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        apiKeys: {
          where: { revokedAt: null },
          select: {
            id: true,
            prefix: true,
            lastFour: true,
            name: true,
            createdAt: true,
          },
        },
        invoices: {
          orderBy: { periodStart: "desc" },
          take: 12,
          include: { lineItems: true },
        },
        usageWindows: {
          orderBy: { hourStart: "desc" },
          take: 48,
        },
      },
    });

    if (!customer) {
      throw new AppError("Customer not found", 404, "NOT_FOUND");
    }

    const anomalies = await getCustomerAnomalies(customerId);

    return Response.json({
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        status: customer.status,
        created_at: customer.createdAt.toISOString(),
      },
      api_keys: customer.apiKeys.map((key) => ({
        id: key.id,
        prefix: key.prefix,
        last_four: key.lastFour,
        name: key.name,
        created_at: key.createdAt.toISOString(),
      })),
      usage_windows: customer.usageWindows.map((row) => ({
        api_key_id: row.apiKeyId,
        endpoint: row.endpoint,
        hour_start: row.hourStart.toISOString(),
        total_units: row.totalUnits,
        event_count: row.eventCount,
      })),
      invoices: customer.invoices.map(serializeInvoice),
      anomalies,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
