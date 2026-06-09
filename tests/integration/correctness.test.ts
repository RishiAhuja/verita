import { createHmac, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@verita/database";
import { ingestUsageEvents } from "@/services/metering/event-ingestion";
import { tenantScopeFor } from "@/services/auth/tenant";
import {
  processPaymentWebhook,
  verifyWebhookSignature,
} from "@/services/webhooks/payment-webhook";
import { AppError } from "@/lib/errors";
import "dotenv/config";

const hasDatabase = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDatabase)("integration correctness", () => {
  let customerAId: string;
  let customerBId: string;
  let apiKeyAId: string;
  let invoiceBId: string;

  beforeAll(async () => {
    process.env.WEBHOOK_SIGNING_SECRET ??= "dev-webhook-secret-change-me";

    const customers = await prisma.customer.findMany({
      orderBy: { createdAt: "asc" },
      take: 2,
      include: { apiKeys: true, invoices: true },
    });

    if (customers.length < 2) {
      throw new Error("Run pnpm db:seed before integration tests");
    }

    customerAId = customers[0].id;
    customerBId = customers[1].id;
    apiKeyAId = customers[0].apiKeys[0]?.id ?? "";
    invoiceBId = customers[1].invoices[0]?.id ?? "";

    if (!apiKeyAId || !invoiceBId) {
      throw new Error("Seed data incomplete — run db:seed, worker:aggregate, worker:invoice");
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("ignores duplicate request_id on ingestion", async () => {
    const requestId = `integration-${randomUUID()}`;

    const first = await ingestUsageEvents({
      customerId: customerAId,
      events: [
        {
          request_id: requestId,
          api_key_id: apiKeyAId,
          endpoint: "/extract",
          units: 7,
          timestamp: new Date().toISOString(),
        },
      ],
    });

    const second = await ingestUsageEvents({
      customerId: customerAId,
      events: [
        {
          request_id: requestId,
          api_key_id: apiKeyAId,
          endpoint: "/extract",
          units: 7,
          timestamp: new Date().toISOString(),
        },
      ],
    });

    expect(first.accepted).toBe(1);
    expect(first.duplicates).toBe(0);
    expect(second.accepted).toBe(0);
    expect(second.duplicates).toBe(1);
  });

  it("blocks cross-tenant invoice access", async () => {
    const tenantA = tenantScopeFor({ id: customerAId } as { id: string });

    await expect(tenantA.getInvoiceOrThrow(invoiceBId)).rejects.toBeInstanceOf(AppError);
  });

  it("dedupes payment webhook replays", async () => {
    const invoice = await prisma.invoice.findFirst({
      where: { customerId: customerAId, status: "ISSUED" },
    });

    if (!invoice) {
      throw new Error("No issued invoice for customer A — run worker:invoice");
    }

    const payload = {
      event_id: `integration-pay-${randomUUID()}`,
      invoice_id: invoice.id,
      status: "paid" as const,
    };

    const rawBody = JSON.stringify(payload);
    const signature = createHmac("sha256", process.env.WEBHOOK_SIGNING_SECRET!)
      .update(rawBody)
      .digest("hex");

    verifyWebhookSignature({
      rawBody,
      signature: `sha256=${signature}`,
    });

    const first = await processPaymentWebhook(payload);
    const second = await processPaymentWebhook(payload);

    expect(first.replayed).toBe(false);
    expect(first.invoice.status).toBe("PAID");
    expect(second.replayed).toBe(true);
  });

  it("rejects invalid webhook signatures", () => {
    expect(() =>
      verifyWebhookSignature({
        rawBody: '{"event_id":"x"}',
        signature: "sha256=deadbeef",
      }),
    ).toThrow(AppError);
  });
});
