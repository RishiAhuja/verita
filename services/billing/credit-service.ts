import { LineItemType, prisma } from "@verita/database";
import { formatCents } from "@/lib/money";
import { AppError } from "@/lib/errors";

export async function issueCredit(params: {
  customerId: string;
  amountCents: number;
  reason: string;
  idempotencyKey: string;
  actorId: string;
}) {
  if (params.amountCents <= 0) {
    throw new AppError("Credit amount must be positive", 400, "INVALID_AMOUNT");
  }

  const existing = await prisma.credit.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
    include: { lineItem: true },
  });

  if (existing) {
    return { credit: existing, created: false };
  }

  const customer = await prisma.customer.findUnique({
    where: { id: params.customerId },
  });

  if (!customer) {
    throw new AppError("Customer not found", 404, "NOT_FOUND");
  }

  const result = await prisma.$transaction(async (tx) => {
    const openInvoice = await tx.invoice.findFirst({
      where: {
        customerId: params.customerId,
        status: { in: ["DRAFT", "ISSUED"] },
      },
      orderBy: { periodStart: "desc" },
    });

    const credit = await tx.credit.create({
      data: {
        customerId: params.customerId,
        amountCents: params.amountCents,
        reason: params.reason,
        idempotencyKey: params.idempotencyKey,
        actorId: params.actorId,
      },
    });

    let lineItemId: string | null = null;

    if (openInvoice) {
      const lineItem = await tx.invoiceLineItem.create({
        data: {
          invoiceId: openInvoice.id,
          type: LineItemType.CREDIT,
          description: `Credit: ${params.reason}`,
          amountCents: -params.amountCents,
        },
      });

      lineItemId = lineItem.id;

      await tx.invoice.update({
        where: { id: openInvoice.id },
        data: {
          totalAmountCents: {
            decrement: params.amountCents,
          },
        },
      });

      await tx.credit.update({
        where: { id: credit.id },
        data: { lineItemId: lineItem.id },
      });
    }

    await tx.auditLog.create({
      data: {
        action: "CREDIT_ISSUED",
        actorId: params.actorId,
        entityType: "credit",
        entityId: credit.id,
        reason: params.reason,
        beforeValue: { amount_cents: 0 },
        afterValue: {
          amount_cents: params.amountCents,
          amount_display: formatCents(params.amountCents),
          line_item_id: lineItemId,
        },
        idempotencyKey: params.idempotencyKey,
      },
    });

    return tx.credit.findUniqueOrThrow({
      where: { id: credit.id },
      include: { lineItem: true },
    });
  });

  return { credit: result, created: true };
}
