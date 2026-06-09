import { authenticateOpsRequest } from "@/services/auth/ops-auth";
import { overrideInvoiceLineItem } from "@/services/ops/line-item-override";
import { toErrorResponse } from "@/lib/errors";
import { formatCents } from "@/lib/money";
import { z } from "zod";

const overrideSchema = z.object({
  amount_cents: z.number().int(),
  description: z.string().min(1).optional(),
  reason: z.string().min(3),
  idempotency_key: z.string().min(8),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ invoiceId: string; lineItemId: string }> },
) {
  try {
    const ops = authenticateOpsRequest(request.headers.get("authorization"));
    const { invoiceId, lineItemId } = await context.params;
    const body = overrideSchema.parse(await request.json());

    const result = await overrideInvoiceLineItem({
      invoiceId,
      lineItemId,
      amountCents: body.amount_cents,
      description: body.description,
      reason: body.reason,
      idempotencyKey: body.idempotency_key,
      actorId: ops.actorId,
    });

    return Response.json(
      {
        created: result.created,
        line_item: {
          id: result.lineItem.id,
          amount_cents: result.lineItem.amountCents,
          amount_display: formatCents(result.lineItem.amountCents),
          description: result.lineItem.description,
          type: result.lineItem.type,
        },
      },
      { status: result.created ? 200 : 200 },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
