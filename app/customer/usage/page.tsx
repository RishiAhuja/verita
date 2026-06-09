"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ApiKeyForm } from "@/components/api-key-form";
import { PageShell } from "@/components/page-shell";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  getCustomerApiKey,
  setCustomerApiKey,
} from "@/lib/client/auth-storage";

type UsageRow = {
  hour_start: string;
  total_units: number;
  endpoint: string;
};

export default function CustomerUsagePage() {
  const [apiKey, setApiKey] = useState("");
  const [rows, setRows] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const key = getCustomerApiKey();
    setApiKey(key);
    if (key) {
      void loadUsage(key);
    } else {
      setInitialized(true);
    }
  }, []);

  async function loadUsage(key: string) {
    setLoading(true);

    try {
      const response = await fetch("/api/v1/usage?pageSize=100", {
        headers: { Authorization: `Bearer ${key}` },
      });
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error?.message ?? "Failed to load usage");
      }

      setRows(body.items ?? []);
    } catch (loadError) {
      toast.error("Failed to load usage", {
        description:
          loadError instanceof Error ? loadError.message : "Unknown error",
      });
    } finally {
      setLoading(false);
      setInitialized(true);
    }
  }

  const chartData = rows
    .slice()
    .reverse()
    .map((row) => ({
      hour: new Date(row.hour_start).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
      }),
      units: row.total_units,
    }));

  return (
    <PageShell
      section="customer"
      title="Usage"
      description="Current-period usage from aggregated hourly windows."
    >
      <ApiKeyForm
        label="Customer API key"
        initialValue={apiKey}
        placeholder="vrt_live_..."
        onSave={async (value) => {
          setCustomerApiKey(value);
          setApiKey(value);
          await loadUsage(value);
        }}
      />

      {loading ? (
        <div className="space-y-4">
          <Card>
            <CardBody className="flex items-center gap-3 py-8">
              <Spinner />
              <p className="text-sm text-neutral-500">Loading usage data…</p>
            </CardBody>
          </Card>
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : null}

      {!loading && initialized && rows.length === 0 ? (
        <EmptyState
          title="No usage yet"
          description="Save your API key above, then run the aggregation worker if you recently ingested events."
        />
      ) : null}

      {!loading && rows.length > 0 ? (
        <>
          <Card>
            <CardHeader title="Usage over time" />
            <CardBody className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} width={40} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "0.5rem",
                      border: "1px solid #e5e5e5",
                      boxShadow: "none",
                    }}
                  />
                  <Bar dataKey="units" fill="#525252" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Breakdown" />
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-neutral-50 text-neutral-500">
                  <tr>
                    <th className="px-5 py-3 font-medium">Hour</th>
                    <th className="px-5 py-3 font-medium">Endpoint</th>
                    <th className="px-5 py-3 font-medium text-right">Units</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={`${row.hour_start}-${row.endpoint}`}
                      className="border-t border-neutral-100 transition-colors hover:bg-neutral-50/80"
                    >
                      <td className="px-5 py-3 text-neutral-700">
                        {new Date(row.hour_start).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-neutral-600">
                        {row.endpoint}
                      </td>
                      <td className="px-5 py-3 text-right font-medium tabular-nums">
                        {row.total_units}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </PageShell>
  );
}
