"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ApiKeyForm } from "@/components/api-key-form";
import { PageShell } from "@/components/page-shell";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { StatusText } from "@/components/ui/status-badge";
import {
  getCustomerApiKey,
  setCustomerApiKey,
} from "@/lib/client/auth-storage";

type Invoice = {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  total_amount_display: string;
};

export default function CustomerInvoicesPage() {
  const [apiKey, setApiKey] = useState("");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const key = getCustomerApiKey();
    setApiKey(key);
    if (key) {
      void loadInvoices(key);
    } else {
      setInitialized(true);
    }
  }, []);

  async function loadInvoices(key: string) {
    setLoading(true);

    try {
      const response = await fetch("/api/v1/invoices", {
        headers: { Authorization: `Bearer ${key}` },
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error?.message ?? "Failed to load invoices");
      }

      setInvoices(body.items ?? []);
    } catch (loadError) {
      toast.error("Failed to load invoices", {
        description:
          loadError instanceof Error ? loadError.message : "Unknown error",
      });
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }

  return (
    <PageShell
      section="customer"
      title="Invoices"
      description="Monthly invoices for your account."
    >
      <ApiKeyForm
        label="Customer API key"
        initialValue={apiKey}
        placeholder="vrt_live_..."
        onSave={async (value) => {
          setCustomerApiKey(value);
          setApiKey(value);
          await loadInvoices(value);
        }}
      />

      {loading ? (
        <div className="space-y-3">
          <Card>
            <CardBody className="flex items-center gap-3 py-6">
              <Spinner />
              <p className="text-sm text-neutral-500">Loading invoices…</p>
            </CardBody>
          </Card>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : null}

      {!loading && initialized && invoices.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Run the invoice worker after aggregating usage to generate monthly bills."
        />
      ) : null}

      {!loading && invoices.length > 0 ? (
        <div className="space-y-3">
          {invoices.map((invoice) => (
            <Link key={invoice.id} href={`/customer/invoices/${invoice.id}`} className="block">
              <Card className="hover:border-neutral-300">
                <CardBody className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-neutral-900">
                      {new Date(invoice.period_start).toLocaleDateString()} –{" "}
                      {new Date(invoice.period_end).toLocaleDateString()}
                    </p>
                    <StatusText value={invoice.status} className="mt-1" />
                  </div>
                  <p className="text-sm font-medium tabular-nums text-neutral-900">
                    {invoice.total_amount_display}
                  </p>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      ) : null}
    </PageShell>
  );
}
