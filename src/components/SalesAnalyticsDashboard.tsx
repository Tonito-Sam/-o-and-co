import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertCircle, LoaderCircle } from "lucide-react";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSupabaseClient } from "@/lib/supabase";

type LeadRow = {
  id: string;
  sales_stage: string | null;
  stage: string | null;
  source: string | null;
  value_zar: number | null;
  branch_id: string | null;
  created_at: string;
};

type LeadActivityRow = {
  id: string;
  lead_id: string;
  to_stage: string;
  created_at: string;
};

type BranchRow = { id: string; name: string; status: string };
type QueryError = { message: string };

const stages = [
  "New Lead",
  "Contacted",
  "Qualified",
  "Tour Scheduled",
  "Proposal Sent",
  "Negotiation",
  "Contract Sent",
  "Contract Signed",
  "Onboarding",
  "Active Tenant",
  "Lost",
];

const legacyStages: Record<string, string> = {
  new_lead: "New Lead",
  contacted: "Contacted",
  qualified: "Qualified",
  tour_scheduled: "Tour Scheduled",
  proposal_sent: "Proposal Sent",
  negotiation: "Negotiation",
  won: "Active Tenant",
  lost: "Lost",
};

const currency = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  maximumFractionDigits: 0,
});

async function fetchAllPages<T>(
  loadPage: (
    from: number,
    to: number,
  ) => PromiseLike<{
    data: T[] | null;
    error: QueryError | null;
  }>,
) {
  const rows: T[] = [];
  const pageSize = 1000;

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await loadPage(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function getStage(lead: LeadRow) {
  if (lead.sales_stage && stages.includes(lead.sales_stage)) return lead.sales_stage;
  return legacyStages[lead.stage?.toLowerCase() ?? ""] ?? "New Lead";
}

function monthKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function SalesAnalyticsDashboard() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [activities, setActivities] = useState<LeadActivityRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [monthsShown, setMonthsShown] = useState("12");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Analytics data is unavailable because Supabase is not configured.");
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError("");

    void Promise.all([
      fetchAllPages<LeadRow>((from, to) =>
        supabase
          .from("leads")
          .select("id,sales_stage,stage,source,value_zar,branch_id,created_at")
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      fetchAllPages<LeadActivityRow>((from, to) =>
        supabase
          .from("lead_activities")
          .select("id,lead_id,to_stage,created_at")
          .in("to_stage", ["Active Tenant", "won"])
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(from, to),
      ),
      fetchAllPages<BranchRow>((from, to) =>
        supabase
          .from("branches")
          .select("id,name,status")
          .order("name", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      ),
    ])
      .then(([leadRows, activityRows, branchRows]) => {
        if (!active) return;
        setLeads(leadRows);
        setActivities(activityRows);
        setBranches(branchRows);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Could not load CRM analytics.");
        setLeads([]);
        setActivities([]);
        setBranches([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const stageRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of leads) {
      const stage = getStage(lead);
      counts.set(stage, (counts.get(stage) ?? 0) + 1);
    }
    return stages.map((stage) => ({ stage, leads: counts.get(stage) ?? 0 }));
  }, [leads]);

  const sourceRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of leads) {
      const source = lead.source?.trim() || "Unspecified";
      counts.set(source, (counts.get(source) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([source, leads]) => ({ source, leads }))
      .sort((a, b) => b.leads - a.leads || a.source.localeCompare(b.source));
  }, [leads]);

  const branchRows = useMemo(() => {
    const branchNames = new Map(branches.map((branch) => [branch.id, branch]));
    const grouped = new Map<
      string,
      {
        id: string;
        name: string;
        status: string;
        total: number;
        open: number;
        won: number;
        pipeline: number;
      }
    >();

    for (const lead of leads) {
      const branch = lead.branch_id ? branchNames.get(lead.branch_id) : undefined;
      const id = branch?.id ?? "unassigned";
      const current = grouped.get(id) ?? {
        id,
        name: branch?.name ?? "Unassigned",
        status: branch?.status ?? "unknown",
        total: 0,
        open: 0,
        won: 0,
        pipeline: 0,
      };
      const stage = getStage(lead);
      current.total += 1;
      if (stage === "Active Tenant") current.won += 1;
      else if (stage !== "Lost") {
        current.open += 1;
        current.pipeline += lead.value_zar ?? 0;
      }
      grouped.set(id, current);
    }

    return [...grouped.values()].sort(
      (a, b) => b.pipeline - a.pipeline || b.total - a.total || a.name.localeCompare(b.name),
    );
  }, [branches, leads]);

  const flowRows = useMemo(() => {
    const numberOfMonths = Number(monthsShown);
    const now = new Date();
    const months = Array.from({ length: numberOfMonths }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - numberOfMonths + index + 1, 1);
      return {
        key: monthKey(date),
        month: new Intl.DateTimeFormat("en", { month: "short", year: "2-digit" }).format(date),
        created: 0,
        converted: 0,
      };
    });
    const byMonth = new Map(months.map((month) => [month.key, month]));

    for (const lead of leads) {
      const month = byMonth.get(monthKey(lead.created_at));
      if (month) month.created += 1;
    }
    for (const activity of activities) {
      const month = byMonth.get(monthKey(activity.created_at));
      if (month) month.converted += 1;
    }

    return months;
  }, [activities, leads, monthsShown]);

  const openLeads = leads.filter((lead) => !["Active Tenant", "Lost"].includes(getStage(lead)));
  const wonLeads = leads.filter((lead) => getStage(lead) === "Active Tenant").length;
  const lostLeads = leads.filter((lead) => getStage(lead) === "Lost").length;
  const decidedLeads = wonLeads + lostLeads;
  const winRate = decidedLeads > 0 ? `${Math.round((wonLeads / decidedLeads) * 100)}%` : "—";
  const pipelineValue = openLeads.reduce((total, lead) => total + (lead.value_zar ?? 0), 0);

  return (
    <div className="mx-auto max-w-350 space-y-6">
      <PageHeader
        eyebrow="Sales & CRM analytics"
        title="Pipeline and conversion"
        description="Live reporting from CRM leads, stage changes, and their assigned branches."
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">History</span>
            <Select value={monthsShown} onValueChange={setMonthsShown}>
              <SelectTrigger className="w-36" aria-label="Lead history period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 months</SelectItem>
                <SelectItem value="6">6 months</SelectItem>
                <SelectItem value="12">12 months</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>CRM analytics could not load: {error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Open leads"
          value={loading ? "—" : String(openLeads.length)}
          hint="Not won or lost"
          accent="brand"
        />
        <StatCard
          label="Open pipeline"
          value={loading ? "—" : currency.format(pipelineValue)}
          hint="Current open lead values"
        />
        <StatCard
          label="Converted tenants"
          value={loading ? "—" : String(wonLeads)}
          hint="Current CRM stage: Active Tenant"
          accent="success"
        />
        <StatCard
          label="Win rate"
          value={loading ? "—" : winRate}
          hint={`${wonLeads} won · ${lostLeads} lost`}
          accent="success"
        />
      </div>

      <section className="rounded-lg border bg-card p-4 sm:p-5">
        <div className="mb-4">
          <h2 className="font-display text-base font-semibold">
            Lead flow · last {monthsShown} months
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Created leads and recorded transitions to Active Tenant, grouped by calendar month.
          </p>
        </div>
        {loading ? (
          <div className="grid h-64 place-items-center text-sm text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" />
          </div>
        ) : leads.length === 0 ? (
          <div className="grid h-48 place-items-center text-sm text-muted-foreground">
            No CRM lead records are available for this account.
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flowRows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="created" name="Leads created" fill="#0f766e" radius={[4, 4, 0, 0]} />
                <Bar
                  dataKey="converted"
                  name="Converted to tenant"
                  fill="#ea580c"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-lg border bg-card p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold">Current pipeline by stage</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Counts reflect each lead's persisted CRM stage.
            </p>
          </div>
          {loading ? (
            <div className="grid h-64 place-items-center text-sm text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" />
            </div>
          ) : leads.length === 0 ? (
            <div className="grid h-48 place-items-center text-sm text-muted-foreground">
              No stage data yet.
            </div>
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={stageRows}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 12, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="stage" width={112} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="leads" name="Leads" fill="#1d4ed8" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="rounded-lg border bg-card p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="font-display text-base font-semibold">Lead sources</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Source values recorded on CRM lead entries.
            </p>
          </div>
          {loading ? (
            <div className="grid h-64 place-items-center text-sm text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" />
            </div>
          ) : sourceRows.length === 0 ? (
            <div className="grid h-48 place-items-center text-sm text-muted-foreground">
              No source data yet.
            </div>
          ) : (
            <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
              {sourceRows.map((source) => (
                <div key={source.source}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{source.source}</span>
                    <span className="tabular-nums text-muted-foreground">{source.leads}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-sm bg-muted">
                    <div
                      className="h-full bg-brand"
                      style={{ width: `${(source.leads / leads.length) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="font-display text-base font-semibold">Branch pipeline</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Open lead value and outcomes from records assigned to each branch.
          </p>
        </div>
        {loading ? (
          <div className="grid h-36 place-items-center text-sm text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" />
          </div>
        ) : branchRows.length === 0 ? (
          <div className="grid h-36 place-items-center text-sm text-muted-foreground">
            No branch pipeline records yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 text-right font-medium">Leads</th>
                  <th className="px-4 py-3 text-right font-medium">Open</th>
                  <th className="px-4 py-3 text-right font-medium">Won</th>
                  <th className="px-4 py-3 text-right font-medium">Open value</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {branchRows.map((branch) => (
                  <tr key={branch.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <span className="font-medium">{branch.name}</span>
                      {branch.status !== "live" && (
                        <Badge variant="outline" className="ml-2 capitalize">
                          {branch.status}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{branch.total}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{branch.open}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{branch.won}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {currency.format(branch.pipeline)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
