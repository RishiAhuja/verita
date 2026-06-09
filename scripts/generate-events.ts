import { randomUUID } from "node:crypto";
import { createHmac } from "node:crypto";
import "dotenv/config";

const API_BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

async function main() {
  const apiKey = process.env.SEED_CUSTOMER_API_KEY;
  const apiKeyId = process.env.SEED_API_KEY_ID;

  if (!apiKey || !apiKeyId) {
    throw new Error(
      "Set SEED_CUSTOMER_API_KEY and SEED_API_KEY_ID from db:seed output",
    );
  }

  const payload = {
    events: [
      {
        request_id: randomUUID(),
        api_key_id: apiKeyId,
        endpoint: "/extract",
        units: 12,
        timestamp: new Date().toISOString(),
      },
      {
        request_id: randomUUID(),
        api_key_id: apiKeyId,
        endpoint: "/search",
        units: 5,
        timestamp: new Date().toISOString(),
      },
    ],
  };

  const response = await fetch(`${API_BASE}/api/v1/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json();
  console.log("Ingestion response:", response.status, body);

  if (process.env.DEMO_WEBHOOK === "true") {
    const invoiceId = process.env.DEMO_INVOICE_ID;
    if (!invoiceId) {
      throw new Error("Set DEMO_INVOICE_ID to test webhook replay");
    }

    const webhookPayload = JSON.stringify({
      event_id: randomUUID(),
      invoice_id: invoiceId,
      status: "paid",
    });

    const signature = createHmac(
      "sha256",
      process.env.WEBHOOK_SIGNING_SECRET ?? "dev-webhook-secret-change-me",
    )
      .update(webhookPayload)
      .digest("hex");

    const webhookResponse = await fetch(`${API_BASE}/api/webhooks/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-signature": `sha256=${signature}`,
      },
      body: webhookPayload,
    });

    console.log(
      "Webhook response:",
      webhookResponse.status,
      await webhookResponse.json(),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
