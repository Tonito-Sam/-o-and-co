import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LifeBuoy, RefreshCw } from "lucide-react";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRole } from "@/lib/role-context";
import { getSupabaseClient } from "@/lib/supabase";
import { OrganizationSupportView } from "@/components/tenant/OrganizationViews";

export const Route = createFileRoute("/support")({
  head: () => ({ meta: [{ title: "Support — WorkspaceOS" }] }),
  component: Support,
});

type Ticket = {
  id: string;
  reference: string | null;
  branch_id: string | null;
  tenant_id: string | null;
  subject: string;
  priority: string;
  status: string;
  sla_due_at: string | null;
  created_at: string;
  branches: { name: string } | { name: string }[] | null;
};

function Support() {
  const { role } = useRole();
  if (role.id === "organization-admin" || role.id === "organization-member") {
    return <OrganizationSupportView />;
  }
  return <OperationsSupport />;
}

function OperationsSupport() {
  const { role } = useRole();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const branchScope = role.id === "branch-manager" ? (role.branchIds ?? []).join(",") : "all";

  const loadTickets = useCallback(async () => {
    const branchIds = branchScope === "all" ? null : branchScope ? branchScope.split(",") : [];
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Workspace support data is not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    let query = supabase
      .from("support_tickets")
      .select(
        "id,reference,branch_id,tenant_id,subject,priority,status,sla_due_at,created_at,branches(name)",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (branchIds)
      query = branchIds.length
        ? query.in("branch_id", branchIds)
        : query.eq("branch_id", "00000000-0000-0000-0000-000000000000");
    const { data, error: queryError } = await query;
    if (queryError) {
      setError(queryError.message);
      setTickets([]);
    } else {
      setError("");
      setTickets((data ?? []) as Ticket[]);
    }
    setLoading(false);
  }, [branchScope]);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const openTickets = useMemo(
    () => tickets.filter((ticket) => !["resolved", "closed"].includes(ticket.status)),
    [tickets],
  );
  const overdueTickets = openTickets.filter(
    (ticket) => ticket.sla_due_at && new Date(ticket.sla_due_at).getTime() < Date.now(),
  );
  const urgentTickets = openTickets.filter((ticket) =>
    ["urgent", "high"].includes(ticket.priority),
  );

  return (
    <div className="mx-auto max-w-350 space-y-5">
      <PageHeader
        eyebrow={
          role.id === "group-ceo" ? "Group Operations · Support" : "Branch Operations · Support"
        }
        title={role.id === "group-ceo" ? "Group support health" : "Support queue"}
        description={
          role.id === "group-ceo"
            ? "Live service requests and SLA risks across active branches."
            : "Live service requests and SLA risks for your assigned branches."
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadTickets()}
            disabled={loading}
            aria-label="Refresh support tickets"
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
          Support data unavailable: {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Open tickets"
          value={loading ? "—" : String(openTickets.length)}
          hint="Not resolved or closed"
          accent="brand"
        />
        <StatCard
          label="High priority"
          value={loading ? "—" : String(urgentTickets.length)}
          hint="High or urgent"
          accent={urgentTickets.length ? "warning" : "success"}
        />
        <StatCard
          label="Past SLA"
          value={loading ? "—" : String(overdueTickets.length)}
          hint="Open tickets past due"
          accent={overdueTickets.length ? "warning" : "success"}
        />
        <StatCard
          label="All tickets"
          value={loading ? "—" : String(tickets.length)}
          hint="Records returned"
        />
      </div>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="font-display text-base font-semibold">Live service queue</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Source: support ticket records. Response-time and satisfaction metrics are not reported
            without stored measurements.
          </p>
        </div>
        {loading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading support tickets…</p>
        ) : tickets.length === 0 ? (
          <div className="grid justify-items-center gap-2 p-10 text-center">
            <LifeBuoy className="size-7 text-muted-foreground/60" />
            <p className="text-sm font-medium">No support tickets found</p>
            <p className="text-xs text-muted-foreground">
              There are no ticket records in the current scope.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  {role.id === "group-ceo" ? (
                    <th className="px-4 py-3 font-medium">Branch</th>
                  ) : null}
                  <th className="px-4 py-3 font-medium">Subject</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">SLA due</th>
                  <th className="px-4 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tickets.map((ticket) => {
                  const branch = Array.isArray(ticket.branches)
                    ? ticket.branches[0]
                    : ticket.branches;
                  const pastSla =
                    ticket.sla_due_at &&
                    new Date(ticket.sla_due_at).getTime() < Date.now() &&
                    !["resolved", "closed"].includes(ticket.status);
                  return (
                    <tr key={ticket.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono text-xs">
                        {ticket.reference ?? ticket.id.slice(0, 8)}
                      </td>
                      {role.id === "group-ceo" ? (
                        <td className="px-4 py-3">{branch?.name ?? "Unassigned"}</td>
                      ) : null}
                      <td className="px-4 py-3 font-medium">{ticket.subject}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            ["urgent", "high"].includes(ticket.priority)
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {ticket.priority}
                        </Badge>
                      </td>
                      <td
                        className={`px-4 py-3 text-xs ${pastSla ? "font-medium text-destructive" : "text-muted-foreground"}`}
                      >
                        {ticket.sla_due_at
                          ? new Date(ticket.sla_due_at).toLocaleString()
                          : "Not set"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Badge
                          variant={
                            ["resolved", "closed"].includes(ticket.status) ? "default" : "outline"
                          }
                        >
                          {ticket.status.replaceAll("_", " ")}
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
    </div>
  );
}
