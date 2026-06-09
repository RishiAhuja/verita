import { authenticateCustomerApiKey } from "@/services/auth/api-key";
import { tenantScopeFor } from "@/services/auth/tenant";
import {
  ingestEventsSchema,
  ingestUsageEvents,
} from "@/services/metering/event-ingestion";
import { toErrorResponse } from "@/lib/errors";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const auth = await authenticateCustomerApiKey(
      request.headers.get("authorization"),
    );
    const body = ingestEventsSchema.parse(await request.json());

    for (const event of body.events) {
      const apiKey = await prisma.apiKey.findFirst({
        where: {
          id: event.api_key_id,
          customerId: auth.customer.id,
          revokedAt: null,
        },
      });

      if (!apiKey) {
        return Response.json(
          {
            error: {
              code: "INVALID_API_KEY_ID",
              message: `API key ${event.api_key_id} does not belong to this customer`,
            },
          },
          { status: 400 },
        );
      }
    }

    const tenant = tenantScopeFor(auth.customer);
    const result = await ingestUsageEvents({
      customerId: tenant.customerId,
      events: body.events,
    });

    return Response.json(result, { status: 202 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
