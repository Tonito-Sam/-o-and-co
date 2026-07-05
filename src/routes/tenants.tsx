import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { tenants, formatZAR } from "@/lib/mock";
import { Plus, Search, Building2 } from "lucide-react";

export const Route = createFileRoute("/tenants")({
  head: () => ({ meta: [{ title: "Tenants — WorkspaceOS" }] }),
  component: Tenants,
});

function Tenants() {
  const totalMrr = tenants.reduce((s, t) => s + t.mrr, 0);
  return (
    <div className="mx-auto max-w-350">
      <PageHeader
        eyebrow="Tenant Company Management"
        title="Companies"
        description="The companies who call Office & Co home — with their teams, plans and account health."
        actions={<Button size="sm" className="gap-1.5"><Plus className="size-4" />Add company</Button>}
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Active companies" value={String(tenants.length * 57)} hint="Across 6 branches" />
        <StatCard label="Total team members" value="1,284" delta="+23 this month" accent="brand" />
        <StatCard label="Group MRR" value={formatZAR(totalMrr * 12)} accent="success" />
        <StatCard label="At-risk accounts" value="3" delta="AI prediction" accent="warning" />
      </div>

      <div className="card-soft">
        <div className="flex items-center gap-2 p-4 border-b">
          <div className="relative flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search companies…" className="pl-9 h-9 bg-muted/40 border-transparent" />
          </div>
          <Button variant="outline" size="sm">All branches</Button>
          <Button variant="outline" size="sm">All plans</Button>
        </div>
        <div className="divide-y">
          <div className="grid grid-cols-12 gap-3 px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            <div className="col-span-4">Company</div>
            <div className="col-span-3">Plan</div>
            <div className="col-span-2">Branch</div>
            <div className="col-span-1">Members</div>
            <div className="col-span-1 text-right">MRR</div>
            <div className="col-span-1 text-right">Health</div>
          </div>
          {tenants.map((t) => (
            <div key={t.id} className="grid grid-cols-12 gap-3 px-4 py-3.5 items-center hover:bg-muted/30 transition-colors cursor-pointer">
              <div className="col-span-4 flex items-center gap-2.5">
                <div className="grid size-9 place-items-center rounded-md bg-brand-soft text-brand"><Building2 className="size-4" /></div>
                <div className="leading-tight">
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground">{t.id} · since {t.since}</div>
                </div>
              </div>
              <div className="col-span-3 text-sm text-foreground/80">{t.plan}</div>
              <div className="col-span-2 text-sm">{t.branch}</div>
              <div className="col-span-1 text-sm tabular-nums">{t.members}</div>
              <div className="col-span-1 text-sm tabular-nums text-right">{formatZAR(t.mrr)}</div>
              <div className="col-span-1 text-right">
                <Badge
                  variant={t.health === "At Risk" ? "destructive" : t.health === "Excellent" ? "default" : "secondary"}
                  className="text-[10px]"
                >{t.health}</Badge>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
