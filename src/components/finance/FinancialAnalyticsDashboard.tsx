import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RoleDef } from "@/lib/mock";
import { loadLiveFinanceSnapshot, type LiveFinanceSnapshot } from "@/lib/finance-data";

const formatZAR = (amount: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(amount);

export function FinancialAnalyticsDashboard({ role }: { role: RoleDef }) {
  const [snapshot, setSnapshot] = useState<LiveFinanceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      setSnapshot(await loadLiveFinanceSnapshot());
      setError("");
    } catch (cause) {
      setSnapshot(null);
      setError(cause instanceof Error ? cause.message : "Could not load financial analytics.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  return (
    <div className="mx-auto max-w-350 space-y-6">
      <PageHeader
        eyebrow={`${role.title} · Analytics`}
        title="Financial analytics"
        description="Explore invoice collections over time and compare recurring revenue, collections, and receivables by branch."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadOverview()}
            disabled={loading}
            aria-label="Refresh financial analytics"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        }
      />

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          Financial analytics unavailable: {error}
        </p>
      ) : null}

      <section className="rounded-lg border bg-card p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold">Collections and receivables</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Monthly invoice values for the last 12 months.
            </p>
          </div>
          <Badge variant="outline">Live invoice data</Badge>
        </div>
        <div className="h-72">
          {loading ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              Loading financial activity…
            </div>
          ) : !snapshot || snapshot.monthly.length === 0 ? (
            <div className="grid h-full place-items-center text-sm text-muted-foreground">
              No monthly invoice activity is available.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={snapshot.monthly}>
                <defs>
                  <linearGradient id="analyticsCollected" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#0f766e" stopOpacity={0.28} />
                    <stop offset="100%" stopColor="#0f766e" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value: number) => `R${Math.round(value / 1000)}k`}
                />
                <Tooltip formatter={(value) => formatZAR(Number(value ?? 0))} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="collected"
                  name="Collected"
                  stroke="#0f766e"
                  fill="url(#analyticsCollected)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="outstanding"
                  name="Outstanding"
                  stroke="#d97706"
                  fill="transparent"
                  strokeDasharray="5 4"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold">Branch comparison</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Recurring lease values, current-month collections, and open balances.
            </p>
          </div>
          <Badge variant="outline">{snapshot?.branches.length ?? 0} branches</Badge>
        </div>
        {loading ? (
          <div className="grid h-72 place-items-center text-sm text-muted-foreground">
            Loading branch data…
          </div>
        ) : !snapshot || snapshot.branches.length === 0 ? (
          <div className="grid h-48 place-items-center text-sm text-muted-foreground">
            No branch financial data is available.
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={snapshot.branches} margin={{ left: 8, right: 12, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value: number) => `R${Math.round(value / 1000)}k`}
                />
                <Tooltip formatter={(value) => formatZAR(Number(value ?? 0))} />
                <Legend />
                <Bar
                  dataKey="monthly_recurring"
                  name="Monthly recurring"
                  fill="#0f766e"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="collected_this_month"
                  name="Collected this month"
                  fill="#2563eb"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="open_receivables"
                  name="Open receivables"
                  fill="#d97706"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="font-display text-base font-semibold">Receivables detail</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Outstanding and overdue invoice totals by branch.
          </p>
        </div>
        {snapshot?.branches.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 text-right font-medium">Tenant records</th>
                  <th className="px-4 py-3 text-right font-medium">Open</th>
                  <th className="px-4 py-3 text-right font-medium">Overdue</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {snapshot.branches.map((branch) => (
                  <tr key={branch.id}>
                    <td className="px-4 py-3 font-medium">{branch.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{branch.tenant_records}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatZAR(branch.open_receivables)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatZAR(branch.overdue_receivables)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">No receivables detail is available.</p>
        )}
      </section>
      <p className="text-xs text-muted-foreground">
        Analytics use invoice and tenant lease records. Forecasts, operating costs, café, and
        marketplace revenue are not included because they are not yet represented in this financial
        data service.
      </p>
    </div>
  );
}
