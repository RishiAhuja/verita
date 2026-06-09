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
import { getOpsApiKey, setOpsApiKey } from "@/lib/client/auth-storage";

type Customer = {
  id: string;
  name: string;
  email: string;
  usage_event_count: number;
  invoice_count: number;
};

export default function OpsCustomersPage() {
  const [opsKey, setOpsKey] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const key = getOpsApiKey();
    setOpsKey(key);
    if (key) {
      void loadCustomers(key);
    } else {
      setInitialized(true);
    }
  }, []);

  async function loadCustomers(key: string) {
    setLoading(true);

    try {
      const response = await fetch("/api/ops/customers", {
        headers: { Authorization: `Bearer ${key}` },
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error?.message ?? "Failed to load customers");
      }

      setCustomers(body.items ?? []);
    } catch (loadError) {
      toast.error("Failed to load customers", {
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
      section="console"
      title="Customers"
      description="Internal customer list with usage and invoice counts."
    >
      <ApiKeyForm
        label="Ops API key"
        initialValue={opsKey}
        placeholder="dev-ops-key-change-me"
        onSave={async (value) => {
          setOpsApiKey(value);
          setOpsKey(value);
          await loadCustomers(value);
        }}
      />

      {loading ? (
        <div className="space-y-3">
          <Card>
            <CardBody className="flex items-center gap-3 py-6">
              <Spinner />
              <p className="text-sm text-neutral-500">Loading customers…</p>
            </CardBody>
          </Card>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : null}

      {!loading && initialized && customers.length === 0 ? (
        <EmptyState
          title="No customers loaded"
          description="Save your ops API key above to load the customer directory."
        />
      ) : null}

      {!loading && customers.length > 0 ? (
        <div className="space-y-3">
          {customers.map((customer) => (
            <Link
              key={customer.id}
              href={`/console/customers/${customer.id}`}
              className="block"
            >
              <Card className="hover:border-neutral-300">
                <CardBody className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-neutral-900">{customer.name}</p>
                    <p className="text-sm text-neutral-500">{customer.email}</p>
                  </div>
                  <div className="text-right text-sm text-neutral-500">
                    <p className="tabular-nums">
                      <span className="font-medium text-neutral-900">
                        {customer.usage_event_count}
                      </span>{" "}
                      events
                    </p>
                    <p className="tabular-nums">
                      <span className="font-medium text-neutral-900">
                        {customer.invoice_count}
                      </span>{" "}
                      invoices
                    </p>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      ) : null}
    </PageShell>
  );
}
