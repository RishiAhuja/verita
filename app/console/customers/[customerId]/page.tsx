"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { StatusText } from "@/components/ui/status-badge";
import { getOpsApiKey } from "@/lib/client/auth-storage";

type LineItem = {
  id: string;
  description: string;
  amount_display: string;
  amount_cents: number;
};

type Invoice = {
  id: string;
  total_amount_display: string;
  status: string;
  line_items?: LineItem[];
};

type CustomerDetail = {
  customer: { id: string; name: string; email: string };
  anomalies: Array<{ type: string; message: string; severity: string }>;
  invoices: Invoice[];
};

export default function OpsCustomerDetailPage() {
  const params = useParams<{ customerId: string }>();
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [amountCents, setAmountCents] = useState("2500");
  const [reason, setReason] = useState("Goodwill credit for outage");
  const [confirmCreditOpen, setConfirmCreditOpen] = useState(false);
  const [confirmOverrideOpen, setConfirmOverrideOpen] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [selectedLineItemId, setSelectedLineItemId] = useState("");
  const [overrideAmountCents, setOverrideAmountCents] = useState("0");
  const [overrideReason, setOverrideReason] = useState("Manual billing adjustment");

  async function loadDetail() {
    const opsKey = getOpsApiKey();
    if (!opsKey) return null;

    const response = await fetch(`/api/ops/customers/${params.customerId}`, {
      headers: { Authorization: `Bearer ${opsKey}` },
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.error?.message ?? "Failed to load customer");
    }
    return body as CustomerDetail;
  }

  useEffect(() => {
    const opsKey = getOpsApiKey();
    if (!opsKey) {
      setLoading(false);
      toast.error("Ops API key required", {
        description: "Save your ops key on the customers page first.",
      });
      return;
    }

    void loadDetail()
      .then((data) => {
        if (data) {
          setDetail(data);
          const firstInvoice = data.invoices[0];
          const firstLine = firstInvoice?.line_items?.[0];
          if (firstInvoice) {
            setSelectedInvoiceId(firstInvoice.id);
          }
          if (firstLine) {
            setSelectedLineItemId(firstLine.id);
            setOverrideAmountCents(String(firstLine.amount_cents));
          }
        }
      })
      .catch((loadError) => {
        toast.error("Failed to load customer", {
          description:
            loadError instanceof Error ? loadError.message : "Unknown error",
        });
      })
      .finally(() => setLoading(false));
  }, [params.customerId]);

  async function issueCredit() {
    const opsKey = getOpsApiKey();
    if (!opsKey) return;

    setIssuing(true);

    try {
      const response = await fetch(`/api/ops/customers/${params.customerId}/credits`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${opsKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount_cents: Number(amountCents),
          reason,
          idempotency_key: crypto.randomUUID(),
        }),
      });

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error?.message ?? "Failed to issue credit");
      }

      toast.success(body.created ? "Credit issued" : "Credit already applied", {
        description: `${body.credit.amount_display} — ${reason}`,
      });
      setConfirmCreditOpen(false);
      const refreshed = await loadDetail();
      if (refreshed) setDetail(refreshed);
    } catch (creditError) {
      toast.error("Could not issue credit", {
        description:
          creditError instanceof Error ? creditError.message : "Unknown error",
      });
    } finally {
      setIssuing(false);
    }
  }

  async function overrideLineItem() {
    const opsKey = getOpsApiKey();
    if (!opsKey || !selectedInvoiceId || !selectedLineItemId) return;

    setOverriding(true);

    try {
      const response = await fetch(
        `/api/ops/invoices/${selectedInvoiceId}/line-items/${selectedLineItemId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${opsKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            amount_cents: Number(overrideAmountCents),
            reason: overrideReason,
            idempotency_key: crypto.randomUUID(),
          }),
        },
      );

      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error?.message ?? "Failed to override line item");
      }

      toast.success("Line item updated", {
        description: body.line_item.amount_display,
      });
      setConfirmOverrideOpen(false);
      const refreshed = await loadDetail();
      if (refreshed) setDetail(refreshed);
    } catch (overrideError) {
      toast.error("Could not override line item", {
        description:
          overrideError instanceof Error ? overrideError.message : "Unknown error",
      });
    } finally {
      setOverriding(false);
    }
  }

  const amountDisplay = `$${(Number(amountCents || 0) / 100).toFixed(2)}`;
  const overrideDisplay = `$${(Number(overrideAmountCents || 0) / 100).toFixed(2)}`;

  const selectedInvoice = detail?.invoices.find((inv) => inv.id === selectedInvoiceId);
  const lineItems = selectedInvoice?.line_items ?? [];

  return (
    <PageShell section="console" title={detail?.customer.name ?? "Customer"}>
      <Link
        href="/console/customers"
        className="text-sm text-neutral-500 hover:text-neutral-900"
      >
        ← Back
      </Link>

      {loading ? (
        <Card>
          <CardBody className="flex items-center gap-3 py-8">
            <Spinner />
            <p className="text-sm text-neutral-500">Loading…</p>
          </CardBody>
        </Card>
      ) : null}

      {!loading && detail ? (
        <>
          <Card>
            <CardBody>
              <p className="text-sm text-neutral-500">{detail.customer.email}</p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Anomalies" />
            <CardBody>
              {detail.anomalies.length === 0 ? (
                <p className="text-sm text-neutral-500">None detected.</p>
              ) : (
                <ul className="space-y-3">
                  {detail.anomalies.map((signal) => (
                    <li key={signal.message} className="text-sm text-neutral-700">
                      {signal.message}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Issue credit" />
            <CardBody className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-sm text-neutral-600">Amount (cents)</label>
                  <input
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
                    value={amountCents}
                    onChange={(event) => setAmountCents(event.target.value)}
                  />
                  <p className="text-xs text-neutral-400">{amountDisplay}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-neutral-600">Reason</label>
                  <input
                    className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </div>
              </div>
              <Button onClick={() => setConfirmCreditOpen(true)}>Issue credit</Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Override line item" />
            <CardBody className="space-y-4">
              {detail.invoices.length === 0 ? (
                <p className="text-sm text-neutral-500">
                  No invoices yet. Run the invoice worker after seeding.
                </p>
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-sm text-neutral-600">Invoice</label>
                      <select
                        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                        value={selectedInvoiceId}
                        onChange={(event) => {
                          const invoiceId = event.target.value;
                          setSelectedInvoiceId(invoiceId);
                          const invoice = detail.invoices.find((inv) => inv.id === invoiceId);
                          const line = invoice?.line_items?.[0];
                          setSelectedLineItemId(line?.id ?? "");
                          setOverrideAmountCents(line ? String(line.amount_cents) : "0");
                        }}
                      >
                        {detail.invoices.map((invoice) => (
                          <option key={invoice.id} value={invoice.id}>
                            {invoice.total_amount_display} ({invoice.status.toLowerCase()})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm text-neutral-600">Line item</label>
                      <select
                        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
                        value={selectedLineItemId}
                        onChange={(event) => {
                          const lineItemId = event.target.value;
                          setSelectedLineItemId(lineItemId);
                          const line = lineItems.find((item) => item.id === lineItemId);
                          if (line) {
                            setOverrideAmountCents(String(line.amount_cents));
                          }
                        }}
                      >
                        {lineItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.description} ({item.amount_display})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1">
                      <label className="text-sm text-neutral-600">New amount (cents)</label>
                      <input
                        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
                        value={overrideAmountCents}
                        onChange={(event) => setOverrideAmountCents(event.target.value)}
                      />
                      <p className="text-xs text-neutral-400">{overrideDisplay}</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-sm text-neutral-600">Reason</label>
                      <input
                        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
                        value={overrideReason}
                        onChange={(event) => setOverrideReason(event.target.value)}
                      />
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={!selectedLineItemId}
                    onClick={() => setConfirmOverrideOpen(true)}
                  >
                    Override line item
                  </Button>
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Invoices" />
            <CardBody className="space-y-4">
              {detail.invoices.length === 0 ? (
                <p className="text-sm text-neutral-500">None yet.</p>
              ) : (
                detail.invoices.map((invoice) => (
                  <div key={invoice.id} className="border-t border-neutral-100 pt-3 first:border-t-0 first:pt-0">
                    <div className="flex items-center justify-between text-sm">
                      <StatusText value={invoice.status} />
                      <span className="font-medium tabular-nums">{invoice.total_amount_display}</span>
                    </div>
                    {invoice.line_items && invoice.line_items.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-sm text-neutral-600">
                        {invoice.line_items.map((item) => (
                          <li key={item.id} className="flex justify-between">
                            <span>{item.description}</span>
                            <span className="tabular-nums">{item.amount_display}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </>
      ) : null}

      {!loading && !detail ? <Skeleton className="h-48 w-full" /> : null}

      <ConfirmDialog
        open={confirmCreditOpen}
        title="Issue credit?"
        description={`Issue ${amountDisplay} to ${detail?.customer.name ?? "this customer"} for: ${reason}`}
        confirmLabel="Confirm"
        loading={issuing}
        onConfirm={() => void issueCredit()}
        onCancel={() => setConfirmCreditOpen(false)}
      />

      <ConfirmDialog
        open={confirmOverrideOpen}
        title="Override line item?"
        description={`Set line item amount to ${overrideDisplay} for: ${overrideReason}. This action is audited.`}
        confirmLabel="Confirm"
        loading={overriding}
        onConfirm={() => void overrideLineItem()}
        onCancel={() => setConfirmOverrideOpen(false)}
      />
    </PageShell>
  );
}
