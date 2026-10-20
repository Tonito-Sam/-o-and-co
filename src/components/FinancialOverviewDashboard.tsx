import { useEffect, useState } from "react";
import { AlertTriangle, Building2, CircleDollarSign, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { getSupabaseClient } from "@/lib/supabase";
import { formatZAR, type RoleDef } from "@/lib/mock";

type FinancialBranch = {
  id: string;
  name: string;
  capacity: number;
  active_tenants: number;
  occupied_desks: number;
  desk_occupancy_percent: number;
  monthly_recurring: number;
  collected_this_month: number;
  open_receivables: number;
  overdue_receivables: number;
  open_leads: number;
  pipeline_value: number;
  pending_bookings: number;
  risk_score: number;
};

type FinancialOverview = {
  scope: "group" | "branch";
  totals: {
    monthly_recurring: number;
    collected_this_month: number;
    open_receivables: number;
    overdue_receivables: number;
    active_tenants: number;
    open_leads: number;
    pipeline_value: number;
    pending_bookings: number;
  };
  branches: FinancialBranch[];
  monthly: { month: string; collected: number; outstanding: number }[];
};

export function FinancialOverviewDashboard({ role }: { role: RoleDef }) {
  const [overview, setOverview] = useState<FinancialOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isGroupView = overview?.scope === "group";

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Financial data is not configured.");
      setLoading(false);
      return;
    }
    void supabase.rpc("get_financial_overview").then(({ data, error: queryError }) => {
      if (!active) return;
      if (queryError) setError(queryError.message);
      else setOverview(data as FinancialOverview);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const title = role.id === "branch-manager" ? "Branch financial health" : "Group financial overview";
  const description = role.id === "branch-manager"
    ? `Revenue, pipeline, receivables, and booking risks for ${role.branchNames?.join(" and ") || role.branch || "your assigned branches"}.`
    : "Branch growth, cash collected, receivables, sales potential, and operating requests across the group.";
  const totals = overview?.totals;

  return (
    <div className="mx-auto max-w-350 space-y-6">
      <PageHeader eyebrow={role.title} title={title} description={description} />
      {error && (
        <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Financial overview unavailable: {error}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Monthly recurring revenue" value={loading ? "—" : formatZAR(totals?.monthly_recurring ?? 0)} hint="Active leases" accent="brand" />
        <StatCard label="Collected this month" value={loading ? "—" : formatZAR(totals?.collected_this_month ?? 0)} hint="Paid invoices" accent="success" />
        <StatCard label="Open receivables" value={loading ? "—" : formatZAR(totals?.open_receivables ?? 0)} hint={`${formatZAR(totals?.overdue_receivables ?? 0)} overdue`} accent={(totals?.overdue_receivables ?? 0) > 0 ? "warning" : "success"} />
        <StatCard label="Qualified pipeline" value={loading ? "—" : formatZAR(totals?.pipeline_value ?? 0)} hint={`${totals?.open_leads ?? 0} open opportunities`} accent="brand" />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(16rem,0.8fr)]">
        <section className="rounded-lg border bg-card p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold">Cash collected · 12 months</h2>
              <p className="mt-1 text-xs text-muted-foreground">Paid invoices only; outstanding is shown separately.</p>
            </div>
            <Badge variant="outline">{isGroupView ? "All live branches" : "Assigned branches"}</Badge>
          </div>
          <div className="h-64">
            {loading ? (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">Loading financial activity…</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={overview?.monthly ?? []}>
                  <defs>
                    <linearGradient id="cashCollected" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#0f766e" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#0f766e" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(value: number) => `R${Math.round(value / 1000)}k`} />
                  <Tooltip formatter={(value) => formatZAR(Number(value ?? 0))} />
                  <Area type="monotone" dataKey="collected" name="Collected" stroke="#0f766e" fill="url(#cashCollected)" strokeWidth={2} />
                  <Area type="monotone" dataKey="outstanding" name="Outstanding" stroke="#d97706" fill="transparent" strokeDasharray="5 4" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="rounded-lg border bg-card p-4 sm:p-5">
          <h2 className="font-display text-base font-semibold">Attention queue</h2>
          <p className="mt-1 text-xs text-muted-foreground">Items that need a decision or follow-up.</p>
          <div className="mt-4 divide-y">
            <div className="flex items-center justify-between gap-3 py-3">
              <span className="flex items-center gap-2 text-sm"><AlertTriangle className="size-4 text-warning" />Overdue receivables</span>
              <strong className="text-sm tabular-nums">{loading ? "—" : formatZAR(totals?.overdue_receivables ?? 0)}</strong>
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <span className="flex items-center gap-2 text-sm"><Building2 className="size-4 text-brand" />Active lease accounts</span>
              <strong className="text-sm tabular-nums">{loading ? "—" : totals?.active_tenants ?? 0}</strong>
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <span className="flex items-center gap-2 text-sm"><CircleDollarSign className="size-4 text-brand" />Pipeline potential</span>
              <strong className="text-sm tabular-nums">{loading ? "—" : formatZAR(totals?.pipeline_value ?? 0)}</strong>
            </div>
            <div className="flex items-center justify-between gap-3 py-3">
              <span className="flex items-center gap-2 text-sm"><TrendingUp className="size-4 text-brand" />Pending bookings</span>
              <strong className="text-sm tabular-nums">{loading ? "—" : totals?.pending_bookings ?? 0}</strong>
            </div>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="font-display text-base font-semibold">Branch performance and risks</h2>
              <p className="mt-1 text-xs text-muted-foreground">Desk occupancy compares leased desks with configured branch capacity; overdue risk compares past-due receivables with monthly recurring revenue.</p>
        </div>
        {loading ? (
          <div className="p-5 text-sm text-muted-foreground">Loading branch performance…</div>
        ) : (overview?.branches.length ?? 0) === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">No live branches are assigned to this account.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 text-right font-medium">Tenants</th>
                  <th className="px-4 py-3 text-right font-medium">Desk occupancy</th>
                  <th className="px-4 py-3 text-right font-medium">Monthly recurring</th>
                  <th className="px-4 py-3 text-right font-medium">Collected</th>
                  <th className="px-4 py-3 text-right font-medium">Overdue</th>
                  <th className="px-4 py-3 text-right font-medium">Pipeline</th>
                  <th className="px-4 py-3 text-right font-medium">Bookings</th>
                  <th className="px-4 py-3 text-right font-medium">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {overview?.branches.map((branch) => (
                  <tr key={branch.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{branch.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{branch.active_tenants}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{branch.desk_occupancy_percent}% · {branch.occupied_desks}/{branch.capacity}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatZAR(branch.monthly_recurring)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatZAR(branch.collected_this_month)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatZAR(branch.overdue_receivables)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatZAR(branch.pipeline_value)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{branch.pending_bookings}</td>
                    <td className="px-4 py-3 text-right">
                      <Badge variant={branch.risk_score >= 30 ? "destructive" : branch.risk_score >= 10 ? "outline" : "secondary"}>
                        {branch.risk_score}%
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="text-xs text-muted-foreground">
        Revenue and receivables come from invoices and active lease records. Cost and expense-ledger data is not connected yet, so this view does not calculate profit or operating leakage.
      </p>
    </div>
  );
}
