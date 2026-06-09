import { randomUUID } from "node:crypto";
import {
  endOfMonth,
  startOfMonth,
  subDays,
  subHours,
  subMonths,
} from "date-fns";
import { CustomerStatus } from "../generated/prisma";
import { prisma } from "../src/index";

async function hashApiKey(plaintext: string) {
  const bcrypt = await import("bcryptjs");
  return bcrypt.hash(plaintext, 10);
}

function makeApiKey(prefixLabel: string) {
  const secret = randomUUID().replace(/-/g, "");
  const plaintext = `vrt_live_${secret}`;
  return {
    plaintext,
    prefix: plaintext.slice(0, 12),
    lastFour: plaintext.slice(-4),
    name: prefixLabel,
  };
}

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.credit.deleteMany();
  await prisma.invoiceLineItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.usageWindow.deleteMany();
  await prisma.usageEvent.deleteMany();
  await prisma.apiKey.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.priceTier.deleteMany();
  await prisma.pricePlan.deleteMany();
  await prisma.jobState.deleteMany();

  const now = new Date();
  const billingPeriodStart = startOfMonth(subMonths(now, 1));
  const billingPeriodEnd = endOfMonth(subMonths(now, 1));

  const pricePlan = await prisma.pricePlan.create({
    data: {
      name: "Standard Tiered",
      description: "First 10k free, next 90k at $0.001, beyond at $0.0005",
      tiers: {
        create: [
          {
            tierOrder: 0,
            upToUnits: 10_000,
            unitPriceMicroCents: 0,
          },
          {
            tierOrder: 1,
            upToUnits: 100_000,
            unitPriceMicroCents: 1_000,
          },
          {
            tierOrder: 2,
            upToUnits: null,
            unitPriceMicroCents: 500,
          },
        ],
      },
    },
    include: { tiers: true },
  });

  const customers = [
    { name: "Acme Corp", email: "billing@acme.example" },
    { name: "Globex Labs", email: "finance@globex.example" },
    { name: "Anomaly Industries", email: "ops@anomaly.example" },
  ];

  const seededKeys: Array<{
    customer: string;
    apiKeyId: string;
    apiKey: string;
  }> = [];

  for (const [index, customerSeed] of customers.entries()) {
    const customer = await prisma.customer.create({
      data: {
        name: customerSeed.name,
        email: customerSeed.email,
        status: CustomerStatus.ACTIVE,
        pricePlanId: pricePlan.id,
      },
    });

    const keyMaterial = makeApiKey(`${customerSeed.name} primary`);
    const apiKey = await prisma.apiKey.create({
      data: {
        customerId: customer.id,
        keyHash: await hashApiKey(keyMaterial.plaintext),
        prefix: keyMaterial.prefix,
        lastFour: keyMaterial.lastFour,
        name: keyMaterial.name,
      },
    });

    seededKeys.push({
      customer: customer.name,
      apiKeyId: apiKey.id,
      apiKey: keyMaterial.plaintext,
    });

    const events = [];

    // Billable usage in the previous calendar month (matches invoice worker period)
    for (let day = 0; day < 20; day += 1) {
      const eventCount = index === 2 ? 12 : 8;
      const unitsPerEvent = index === 2 ? 500 : 12;

      for (let i = 0; i < eventCount; i += 1) {
        const occurredAt = subHours(subDays(billingPeriodEnd, day), i % 12);
        events.push({
          requestId: randomUUID(),
          customerId: customer.id,
          apiKeyId: apiKey.id,
          endpoint: i % 3 === 0 ? "/extract" : "/search",
          units: unitsPerEvent,
          occurredAt,
        });
      }
    }

    // Anomaly Industries: recent spike for ops anomaly signal (last 24h)
    if (index === 2) {
      for (let i = 0; i < 120; i += 1) {
        events.push({
          requestId: randomUUID(),
          customerId: customer.id,
          apiKeyId: apiKey.id,
          endpoint: "/extract",
          units: 500,
          occurredAt: subHours(now, i % 12),
        });
      }
    }

    const duplicate = events[0];
    events.push({ ...duplicate });

    await prisma.usageEvent.createMany({
      data: events,
      skipDuplicates: true,
    });
  }

  console.log("Seed complete.");
  console.log(
    `Billing period for usage events: ${billingPeriodStart.toISOString()} → ${billingPeriodEnd.toISOString()}`,
  );
  console.log("Price plan:", pricePlan.name);
  console.log("After seed, run: pnpm worker:aggregate && pnpm worker:invoice");
  console.log("Seeded API keys (save these for local testing):");
  for (const key of seededKeys) {
    console.log(`- ${key.customer}: ${key.apiKey} (api_key_id=${key.apiKeyId})`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
