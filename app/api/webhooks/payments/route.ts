import {
  paymentWebhookSchema,
  processPaymentWebhook,
  verifyWebhookSignature,
} from "@/services/webhooks/payment-webhook";
import { serializeInvoice } from "@/services/billing/invoice-service";
import { toErrorResponse } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    verifyWebhookSignature({
      rawBody,
      signature: request.headers.get("x-webhook-signature"),
    });

    const payload = paymentWebhookSchema.parse(JSON.parse(rawBody));
    const result = await processPaymentWebhook(payload);

    return Response.json({
      replayed: result.replayed,
      invoice: serializeInvoice(result.invoice),
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
