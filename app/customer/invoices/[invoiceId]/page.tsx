"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { StatusText } from "@/components/ui/status-badge";
import { getCustomerApiKey } from "@/lib/client/auth-storage";

type LineItem = {
  id: string;
  description: string;
  amount_display: string;
  quantity_units: number | null;
};

type Invoice = {
  id: string;
  status: string;
  total_amount_display: string;
  period_start: string;
  period_end: string;
  line_items?: LineItem[];
};

export default function CustomerInvoiceDetailPage() {
  const params = useParams<{ invoiceId: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const apiKey = getCustomerApiKey();
    if (!apiKey) {
      setLoading(false);
      toast.error("API key required", {
        description: "Save your customer API key on the invoices page first.",
      });
      return;
    }

    void fetch(`/api/v1/invoices/${params.invoiceId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error?.message ?? "Failed to load invoice");
        }
        setInvoice(body);
      })
      .catch((loadError) => {
        toast.error("Failed to load invoice", {
          description:
            loadError instanceof Error ? loadError.message : "Unknown error",
        });
      })
      .finally(() => setLoading(false));
  }, [params.invoiceId]);

  return (
    <PageShell section="customer" title="Invoice detail">
      <Link
        href="/customer/invoices"
        className="inline-flex text-sm font-medium text-neutral-500 transition-colors hover:text-neutral-900"
      >
        ← Back to invoices
      </Link>

      {loading ? (
        <Card>
          <CardBody className="flex items-center gap-3 py-10">
            <Spinner />
            <p className="text-sm text-neutral-500">Loading invoice…</p>
          </CardBody>
        </Card>
      ) : null}

      {!loading && invoice ? (
        <Card>
          <CardHeader
            title="Billing period"
            description={`${new Date(invoice.period_start).toLocaleDateString()} – ${new Date(invoice.period_end).toLocaleDateString()}`}
            action={<StatusText value={invoice.status} />}
          />
          <CardBody className="space-y-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                Total due
              </p>
              <p className="mt-1 text-2xl font-medium tabular-nums">
                {invoice.total_amount_display}
              </p>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium text-neutral-900">Line items</h3>
              {invoice.line_items?.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-4 border-t border-neutral-100 pt-3 first:border-t-0 first:pt-0"
                >
                  <div>
                    <p className="text-sm font-medium text-neutral-900">{item.description}</p>
                    {item.quantity_units ? (
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {item.quantity_units.toLocaleString()} units
                      </p>
                    ) : null}
                  </div>
                  <p className="text-sm font-semibold tabular-nums">{item.amount_display}</p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {!loading && !invoice ? <Skeleton className="h-64 w-full" /> : null}
    </PageShell>
  );
}
