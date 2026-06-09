import { authenticateCustomerApiKey } from "@/services/auth/api-key";
import { tenantScopeFor } from "@/services/auth/tenant";
import { serializeInvoice } from "@/services/billing/invoice-service";
import { toErrorResponse } from "@/lib/errors";

export async function GET(
  request: Request,
  context: { params: Promise<{ invoiceId: string }> },
) {
  try {
    const auth = await authenticateCustomerApiKey(
      request.headers.get("authorization"),
    );
    const tenant = tenantScopeFor(auth.customer);
    const { invoiceId } = await context.params;

    const invoice = await tenant.getInvoiceOrThrow(invoiceId);
    return Response.json(serializeInvoice(invoice));
  } catch (error) {
    return toErrorResponse(error);
  }
}
