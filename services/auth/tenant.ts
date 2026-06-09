import type { Customer, Prisma } from "@verita/database";
import { prisma } from "@verita/database";
import { AppError } from "@/lib/errors";

export class TenantScope {
  constructor(readonly customerId: string) {}

  where<T extends { customerId?: string }>(extra?: T) {
    return {
      customerId: this.customerId,
      ...extra,
    };
  }

  async getInvoiceOrThrow(invoiceId: string) {
    const invoice = await prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        customerId: this.customerId,
      },
      include: { lineItems: { orderBy: { createdAt: "asc" } } },
    });

    if (!invoice) {
      throw new AppError("Invoice not found", 404, "NOT_FOUND");
    }

    return invoice;
  }

  async listInvoices(params: {
    skip: number;
    take: number;
    status?: Prisma.EnumInvoiceStatusFilter["equals"];
  }) {
    const where = {
      customerId: this.customerId,
      ...(params.status ? { status: params.status } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { periodStart: "desc" },
        skip: params.skip,
        take: params.take,
      }),
      prisma.invoice.count({ where }),
    ]);

    return { items, total };
  }

  async listUsage(params: {
    skip: number;
    take: number;
    from?: Date;
    to?: Date;
    apiKeyId?: string;
  }) {
    const where = {
      customerId: this.customerId,
      ...(params.apiKeyId ? { apiKeyId: params.apiKeyId } : {}),
      ...(params.from || params.to
        ? {
            hourStart: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.usageWindow.findMany({
        where,
        orderBy: { hourStart: "desc" },
        skip: params.skip,
        take: params.take,
      }),
      prisma.usageWindow.count({ where }),
    ]);

    return { items, total };
  }
}

export function tenantScopeFor(customer: Customer) {
  return new TenantScope(customer.id);
}
