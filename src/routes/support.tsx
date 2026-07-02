import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { tickets } from "@/lib/mock";

export const Route = createFileRoute("/support")({
  head: () => ({ meta: [{ title: "Support — WorkspaceOS" }] }),
  component: Support,
});

function Support() {
  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader
        eyebrow="Support & Service Desk"
        title="Tickets"
        description="Tenant requests, internal escalations and SLA tracking across every branch."
        actions={<Button size="sm">New ticket</Button>}
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Open tickets" value="24" delta="-3 vs week" accent="success" />
        <StatCard label="Avg first response" value="14 min" accent="brand" />
        <StatCard label="SLA breaches (mo)" value="2" accent="warning" />
        <StatCard label="CSAT" value="4.8" />
      </div>

      <div className="card-soft divide-y">
        <div className="grid grid-cols-12 px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          <div className="col-span-2">Ticket</div>
          <div className="col-span-4">Subject</div>
          <div className="col-span-2">Tenant</div>
          <div className="col-span-1">Priority</div>
          <div className="col-span-2">SLA</div>
          <div className="col-span-1 text-right">Status</div>
        </div>
        {tickets.map((t) => (
          <div key={t.id} className="grid grid-cols-12 px-4 py-3.5 text-sm items-center hover:bg-muted/30 cursor-pointer">
            <div className="col-span-2 font-mono text-xs">{t.id}</div>
            <div className="col-span-4 font-medium">{t.subject}</div>
            <div className="col-span-2 text-muted-foreground">{t.tenant}</div>
            <div className="col-span-1">
              <Badge variant={t.priority === "High" ? "destructive" : "secondary"} className="text-[10px]">{t.priority}</Badge>
            </div>
            <div className="col-span-2 text-xs text-muted-foreground">{t.sla}</div>
            <div className="col-span-1 text-right">
              <Badge variant={t.status === "Resolved" ? "default" : "outline"} className="text-[10px]">{t.status}</Badge>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
