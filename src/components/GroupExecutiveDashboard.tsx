import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RoleDef } from "@/lib/mock";
import { loadLiveFinanceSnapshot, type LiveFinanceBranch } from "@/lib/finance-data";
import { getSupabaseClient } from "@/lib/supabase";

type BranchRecord = {
  id: string;
  name: string;
  capacity: number | null;
};

type TenantRecord = { branch_id: string; status: string; desks: number | null };
type InventoryRecord = { branch_id: string; status: string };
type TicketRecord = {
  branch_id: string | null;
  status: string;
  priority: string;
  sla_due_at: string | null;
};
type BookingRecord = { branch_id: string; status: string; starts_at: string };

type ExecutiveBranch = LiveFinanceBranch & {
  capacity: number;
  active_tenants: number;
  occupied_desks: number;
  spaces_total: number;
  spaces_available: number;
  open_tickets: number;
  pending_bookings: number;
};

type Portfolio = {
  recurring: number;
  collected: number;
  receivables: number;
  overdue: number;
  activeTenants: number;
  tenantHealth: { active: number; ended: number };
  openTickets: number;
  urgentTickets: number;
  pendingBookings: number;
  branches: ExecutiveBranch[];
};

const money = (amount: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(amount);

function buildPortfolio(
  financeBranches: LiveFinanceBranch[],
  branches: BranchRecord[],
  tenants: TenantRecord[],
  offices: InventoryRecord[],
  desks: InventoryRecord[],
  tickets: TicketRecord[],
  bookings: BookingRecord[],
  finance: {
    monthly_recurring: number;
    collected_this_month: number;
    open_receivables: number;
    overdue_receivables: number;
  },
): Portfolio {
  const financeByBranch = new Map(financeBranches.map((branch) => [branch.id, branch]));
  const liveBranches = branches.map((branch) => {
    const financial = financeByBranch.get(branch.id);
    const branchTenants = tenants.filter((tenant) => tenant.branch_id === branch.id);
    const branchOffices = offices.filter(
      (office) => office.branch_id === branch.id && office.status !== "inactive",
    );
    const branchDesks = desks.filter(
      (desk) => desk.branch_id === branch.id && desk.status !== "inactive",
    );
    const branchTickets = tickets.filter(
      (ticket) => ticket.branch_id === branch.id && !["resolved", "closed"].includes(ticket.status),
    );
    const branchBookings = bookings.filter(
      (booking) =>
        booking.branch_id === branch.id && ["requested", "confirmed"].includes(booking.status),
    );
    return {
      id: branch.id,
      name: branch.name,
      tenant_records: financial?.tenant_records ?? 0,
      monthly_recurring: financial?.monthly_recurring ?? 0,
      collected_this_month: financial?.collected_this_month ?? 0,
      open_receivables: financial?.open_receivables ?? 0,
      overdue_receivables: financial?.overdue_receivables ?? 0,
      capacity: branch.capacity ?? 0,
      active_tenants: branchTenants.filter((tenant) => tenant.status === "active").length,
      occupied_desks: branchTenants
        .filter((tenant) => tenant.status === "active")
        .reduce((sum, tenant) => sum + (tenant.desks ?? 0), 0),
      spaces_total: branchOffices.length + branchDesks.length,
      spaces_available: [...branchOffices, ...branchDesks].filter(
        (space) => space.status === "available",
      ).length,
      open_tickets: branchTickets.length,
      pending_bookings: branchBookings.length,
    };
  });
  const openTickets = tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status));
  const activeTenants = tenants.filter((tenant) => tenant.status === "active").length;

  return {
    recurring: finance.monthly_recurring,
    collected: finance.collected_this_month,
    receivables: finance.open_receivables,
    overdue: finance.overdue_receivables,
    activeTenants,
    tenantHealth: {
      active: activeTenants,
      ended: tenants.filter((tenant) => tenant.status === "ended").length,
    },
    openTickets: openTickets.length,
    urgentTickets: openTickets.filter((ticket) => ["urgent", "high"].includes(ticket.priority))
      .length,
    pendingBookings: bookings.filter((booking) => booking.status === "requested").length,
    branches: liveBranches,
  };
}

export function GroupExecutiveDashboard({ role }: { role: RoleDef }) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPortfolio = useCallback(async () => {
    setLoading(true);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Workspace data is not configured.");
      setPortfolio(null);
      setLoading(false);
      return;
    }
    try {
      const [
        finance,
        branchResult,
        tenantResult,
        officeResult,
        deskResult,
        ticketResult,
        bookingResult,
      ] = await Promise.all([
        loadLiveFinanceSnapshot(),
        supabase.from("branches").select("id,name,capacity").eq("status", "live").order("name"),
        supabase.from("tenants").select("branch_id,status,desks"),
        supabase.from("branch_offices").select("branch_id,status").neq("status", "inactive"),
        supabase.from("branch_desks").select("branch_id,status").neq("status", "inactive"),
        supabase.from("support_tickets").select("branch_id,status,priority,sla_due_at").limit(1000),
        supabase.from("branch_resource_bookings").select("branch_id,status,starts_at").limit(1000),
      ]);
      const failed = [
        branchResult,
        tenantResult,
        officeResult,
        deskResult,
        ticketResult,
        bookingResult,
      ].find((result) => result.error);
      if (failed?.error) throw new Error(failed.error.message);
      setPortfolio(
        buildPortfolio(
          finance.branches,
          (branchResult.data ?? []) as BranchRecord[],
          (tenantResult.data ?? []) as TenantRecord[],
          (officeResult.data ?? []) as InventoryRecord[],
          (deskResult.data ?? []) as InventoryRecord[],
          (ticketResult.data ?? []) as TicketRecord[],
          (bookingResult.data ?? []) as BookingRecord[],
          finance.totals,
        ),
      );
      setError("");
    } catch (cause) {
      setPortfolio(null);
      setError(cause instanceof Error ? cause.message : "Could not load group health data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPortfolio();
  }, [loadPortfolio]);

  return (
    <div className="mx-auto max-w-350 space-y-6">
      <PageHeader
        eyebrow="Group Executive · Portfolio health"
        title="Group overview"
        description="A live view of branch performance, tenant health, facilities, bookings, support, and cash across the group."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadPortfolio()}
            disabled={loading}
            aria-label="Refresh group overview"
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
          Group overview unavailable: {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Live branches"
          value={loading ? "—" : String(portfolio?.branches.length ?? 0)}
          hint="Active locations"
          accent="brand"
        />
        <StatCard
          label="Active tenant accounts"
          value={loading ? "—" : String(portfolio?.tenantHealth.active ?? 0)}
          hint={`${portfolio?.tenantHealth.ended ?? 0} ended records`}
        />
        <StatCard
          label="Monthly recurring"
          value={loading ? "—" : money(portfolio?.recurring ?? 0)}
          hint="Tenant lease records"
          accent="brand"
        />
        <StatCard
          label="Collected this month"
          value={loading ? "—" : money(portfolio?.collected ?? 0)}
          hint="Paid invoices"
          accent="success"
        />
        <StatCard
          label="Open receivables"
          value={loading ? "—" : money(portfolio?.receivables ?? 0)}
          hint={`${money(portfolio?.overdue ?? 0)} overdue`}
          accent={(portfolio?.overdue ?? 0) > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Spaces available"
          value={
            loading
              ? "—"
              : `${portfolio?.branches.reduce((sum, branch) => sum + branch.spaces_available, 0) ?? 0} / ${portfolio?.branches.reduce((sum, branch) => sum + branch.spaces_total, 0) ?? 0}`
          }
          hint="Offices and desks"
        />
        <StatCard
          label="Open support tickets"
          value={loading ? "—" : String(portfolio?.openTickets ?? 0)}
          hint={`${portfolio?.urgentTickets ?? 0} high priority`}
          accent={(portfolio?.urgentTickets ?? 0) > 0 ? "warning" : undefined}
        />
        <StatCard
          label="Pending resource bookings"
          value={loading ? "—" : String(portfolio?.pendingBookings ?? 0)}
          hint="Awaiting branch action"
        />
      </div>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="font-display text-base font-semibold">Branch health</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Compare tenant base, facility capacity, financial health, and operational workload.
          </p>
        </div>
        {loading ? (
          <div className="p-5 text-sm text-muted-foreground">Loading branch data…</div>
        ) : !portfolio?.branches.length ? (
          <div className="p-5 text-sm text-muted-foreground">No live branch data is available.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 text-right font-medium">Tenants</th>
                  <th className="px-4 py-3 text-right font-medium">Desk occupancy</th>
                  <th className="px-4 py-3 text-right font-medium">Monthly recurring</th>
                  <th className="px-4 py-3 text-right font-medium">Collected</th>
                  <th className="px-4 py-3 text-right font-medium">Overdue</th>
                  <th className="px-4 py-3 text-right font-medium">Bookings</th>
                  <th className="px-4 py-3 text-right font-medium">Open tickets</th>
                  <th className="px-4 py-3 text-right font-medium">Health signals</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {portfolio.branches.map((branch) => {
                  const signals = [
                    branch.overdue_receivables > 0,
                    branch.open_tickets > 0,
                    branch.spaces_total > 0 && branch.spaces_available === 0,
                  ].filter(Boolean).length;
                  return (
                    <tr key={branch.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">{branch.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {branch.active_tenants} active
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {branch.occupied_desks}/{branch.capacity}
                        {branch.capacity > 0
                          ? ` · ${Math.round((branch.occupied_desks / branch.capacity) * 100)}%`
                          : ""}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {money(branch.monthly_recurring)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {money(branch.collected_this_month)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {money(branch.overdue_receivables)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {branch.pending_bookings}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{branch.open_tickets}</td>
                      <td className="px-4 py-3 text-right">
                        <Badge variant={signals > 0 ? "outline" : "secondary"}>
                          {signals > 0 ? `${signals} to review` : "On track"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        Health indicators reflect configured records only. Lease renewal, customer satisfaction, and
        operating-cost data are not connected, so they are not inferred here.
      </p>
      <span className="sr-only">{role.title}</span>
    </div>
  );
}
