import { prisma } from "@verita/database";
import { formatCents } from "@/lib/money";
import { AppError } from "@/lib/errors";

export async function overrideInvoiceLineItem(params: {
  invoiceId: string;
  lineItemId: string;
  amountCents: number;
  description?: string;
  reason: string;
  idempotencyKey: string;
  actorId: string;
}) {
  const existingAudit = await prisma.auditLog.findUnique({
    where: { idempotencyKey: params.idempotencyKey },
  });

  if (existingAudit) {
    const lineItem = await prisma.invoiceLineItem.findUniqueOrThrow({
      where: { id: params.lineItemId },
    });
    return { lineItem, created: false };
  }

  const result = await prisma.$transaction(async (tx) => {
    const lineItem = await tx.invoiceLineItem.findUnique({
      where: { id: params.lineItemId },
      include: { invoice: true },
    });

    if (!lineItem || lineItem.invoiceId !== params.invoiceId) {
      throw new AppError("Line item not found", 404, "NOT_FOUND");
    }

    if (lineItem.invoice.status === "PAID") {
      throw new AppError("Cannot override paid invoice line item", 409, "CONFLICT");
    }

    const beforeValue = {
      amount_cents: lineItem.amountCents,
      description: lineItem.description,
    };

    const updated = await tx.invoiceLineItem.update({
      where: { id: lineItem.id },
      data: {
        amountCents: params.amountCents,
        type: "ADJUSTMENT",
        ...(params.description ? { description: params.description } : {}),
      },
    });

    const delta = params.amountCents - lineItem.amountCents;

    await tx.invoice.update({
      where: { id: lineItem.invoiceId },
      data: {
        totalAmountCents: { increment: delta },
      },
    });

    await tx.auditLog.create({
      data: {
        action: "LINE_ITEM_OVERRIDE",
        actorId: params.actorId,
        entityType: "invoice_line_item",
        entityId: lineItem.id,
        reason: params.reason,
        beforeValue,
        afterValue: {
          amount_cents: updated.amountCents,
          amount_display: formatCents(updated.amountCents),
          description: updated.description,
        },
        idempotencyKey: params.idempotencyKey,
      },
    });

    return updated;
  });

  return { lineItem: result, created: true };
}
