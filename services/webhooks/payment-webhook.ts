import { createHmac, timingSafeEqual } from "node:crypto";
import { InvoiceStatus, prisma } from "@verita/database";
import { getServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { z } from "zod";

export const paymentWebhookSchema = z.object({
  event_id: z.string().min(1),
  invoice_id: z.string().uuid(),
  status: z.literal("paid"),
});

export function verifyWebhookSignature(params: {
  rawBody: string;
  signature: string | null;
}) {
  if (!params.signature) {
    throw new AppError("Missing webhook signature", 401, "UNAUTHORIZED");
  }

  const expected = createHmac("sha256", getServerEnv().WEBHOOK_SIGNING_SECRET)
    .update(params.rawBody)
    .digest("hex");

  const provided = params.signature.replace(/^sha256=/, "");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    throw new AppError("Invalid webhook signature", 401, "UNAUTHORIZED");
  }
}

export async function processPaymentWebhook(payload: z.infer<typeof paymentWebhookSchema>) {
  const existing = await prisma.webhookEvent.findUnique({
    where: { providerEventId: payload.event_id },
  });

  if (existing) {
    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: existing.invoiceId },
    });
    return { invoice, replayed: true };
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: payload.invoice_id },
  });

  if (!invoice) {
    throw new AppError("Invoice not found", 404, "NOT_FOUND");
  }

  if (invoice.status === InvoiceStatus.PAID) {
    await prisma.webhookEvent.create({
      data: {
        providerEventId: payload.event_id,
        invoiceId: invoice.id,
        payload,
      },
    });
    return { invoice, replayed: true };
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.webhookEvent.create({
      data: {
        providerEventId: payload.event_id,
        invoiceId: invoice.id,
        payload,
      },
    });

    return tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.PAID,
        paidAt: new Date(),
      },
    });
  });

  return { invoice: updated, replayed: false };
}
