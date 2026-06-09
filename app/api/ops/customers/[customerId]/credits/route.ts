import { authenticateOpsRequest } from "@/services/auth/ops-auth";
import { issueCredit } from "@/services/billing/credit-service";
import { toErrorResponse } from "@/lib/errors";
import { formatCents } from "@/lib/money";
import { z } from "zod";

const creditSchema = z.object({
  amount_cents: z.number().int().positive(),
  reason: z.string().min(3),
  idempotency_key: z.string().min(8),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ customerId: string }> },
) {
  try {
    const ops = authenticateOpsRequest(request.headers.get("authorization"));
    const { customerId } = await context.params;
    const body = creditSchema.parse(await request.json());

    const result = await issueCredit({
      customerId,
      amountCents: body.amount_cents,
      reason: body.reason,
      idempotencyKey: body.idempotency_key,
      actorId: ops.actorId,
    });

    return Response.json(
      {
        created: result.created,
        credit: {
          id: result.credit.id,
          amount_cents: result.credit.amountCents,
          amount_display: formatCents(result.credit.amountCents),
          reason: result.credit.reason,
          line_item_id: result.credit.lineItemId,
        },
      },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
