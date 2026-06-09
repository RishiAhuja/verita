import {
  InvoiceStatus,
  JobName,
  LineItemType,
  prisma,
} from "@verita/database";
import { endOfMonth, startOfMonth, subMonths } from "date-fns";
import { calculateTieredAmountCents, formatCents } from "@/lib/money";

const LOCK_TTL_MS = 10 * 60 * 1000;

export async function runInvoiceGeneration(params?: {
  workerId?: string;
  periodStart?: Date;
  periodEnd?: Date;
}) {
  const workerId = params?.workerId ?? `worker-${process.pid}`;
  const now = new Date();
  const periodStart = params?.periodStart ?? startOfMonth(subMonths(now, 1));
  const periodEnd = params?.periodEnd ?? endOfMonth(subMonths(now, 1));

  const job = await prisma.jobState.findUnique({
    where: { jobName: JobName.INVOICE_GENERATOR },
  });

  if (
    job?.lockedAt &&
    job.lockedBy &&
    now.getTime() - job.lockedAt.getTime() < LOCK_TTL_MS
  ) {
    return { skipped: true, reason: "lock_held" as const };
  }

  await prisma.jobState.upsert({
    where: { jobName: JobName.INVOICE_GENERATOR },
    create: {
      jobName: JobName.INVOICE_GENERATOR,
      watermark: periodStart,
      lockedAt: now,
      lockedBy: workerId,
    },
    update: {
      lockedAt: now,
      lockedBy: workerId,
    },
  });

  try {
    const customers = await prisma.customer.findMany({
      where: { status: "ACTIVE" },
      include: {
        pricePlan: { include: { tiers: { orderBy: { tierOrder: "asc" } } } },
      },
    });

    let invoicesCreated = 0;

    for (const customer of customers) {
      const existing = await prisma.invoice.findUnique({
        where: {
          customerId_periodStart_periodEnd: {
            customerId: customer.id,
            periodStart,
            periodEnd,
          },
        },
      });

      if (existing) {
        continue;
      }

      const windows = await prisma.usageWindow.findMany({
        where: {
          customerId: customer.id,
          hourStart: {
            gte: periodStart,
            lte: periodEnd,
          },
        },
      });

      const totalUnits = windows.reduce((sum, row) => sum + row.totalUnits, 0);
      const tierLines = calculateTieredAmountCents(
        totalUnits,
        customer.pricePlan.tiers,
      );

      const usageAmountCents = tierLines.reduce(
        (sum, line) => sum + line.amountCents,
        0,
      );

      await prisma.invoice.create({
        data: {
          customerId: customer.id,
          periodStart,
          periodEnd,
          status: InvoiceStatus.ISSUED,
          totalAmountCents: usageAmountCents,
          issuedAt: now,
          lineItems: {
            create: tierLines.map((line) => ({
              type: LineItemType.USAGE_TIER,
              description: `Tier ${line.tierOrder + 1}: ${line.quantityUnits} units`,
              quantityUnits: line.quantityUnits,
              unitPriceMicroCents: line.unitPriceMicroCents,
              amountCents: line.amountCents,
              tierOrder: line.tierOrder,
            })),
          },
        },
      });

      invoicesCreated += 1;
    }

    await prisma.jobState.update({
      where: { jobName: JobName.INVOICE_GENERATOR },
      data: {
        watermark: periodEnd,
        lockedAt: null,
        lockedBy: null,
      },
    });

    return {
      skipped: false,
      invoicesCreated,
      periodStart,
      periodEnd,
    };
  } catch (error) {
    await prisma.jobState.update({
      where: { jobName: JobName.INVOICE_GENERATOR },
      data: {
        lockedAt: null,
        lockedBy: null,
      },
    });
    throw error;
  }
}

export function serializeInvoice(invoice: {
  id: string;
  customerId: string;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  totalAmountCents: number;
  issuedAt: Date | null;
  paidAt: Date | null;
  lineItems?: Array<{
    id: string;
    type: string;
    description: string;
    quantityUnits: number | null;
    unitPriceMicroCents: number | null;
    amountCents: number;
    tierOrder: number | null;
  }>;
}) {
  return {
    id: invoice.id,
    customer_id: invoice.customerId,
    period_start: invoice.periodStart.toISOString(),
    period_end: invoice.periodEnd.toISOString(),
    status: invoice.status,
    total_amount_cents: invoice.totalAmountCents,
    total_amount_display: formatCents(invoice.totalAmountCents),
    issued_at: invoice.issuedAt?.toISOString() ?? null,
    paid_at: invoice.paidAt?.toISOString() ?? null,
    line_items: invoice.lineItems?.map((item) => ({
      id: item.id,
      type: item.type,
      description: item.description,
      quantity_units: item.quantityUnits,
      unit_price_micro_cents: item.unitPriceMicroCents,
      amount_cents: item.amountCents,
      amount_display: formatCents(item.amountCents),
      tier_order: item.tierOrder,
    })),
  };
}
