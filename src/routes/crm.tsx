import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { leads, stages, formatZAR } from "@/lib/mock";
import { Filter, Plus, Sparkles } from "lucide-react";

export const Route = createFileRoute("/crm")({
  head: () => ({ meta: [{ title: "CRM & Sales — WorkspaceOS" }] }),
  component: CRM,
});

function CRM() {
  const byStage = stages.map((s) => ({ stage: s, items: leads.filter(l => l.stage === s) }));
  const totalPipe = leads.reduce((s, l) => s + l.value, 0);
  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        eyebrow="CRM & Sales Automation"
        title="Pipeline"
        description="Every enquiry, tour and proposal across all branches — with AI-scored qualification."
        actions={
          <>
            <Button variant="outline" size="sm" className="gap-1.5"><Filter className="size-4" />Filter</Button>
            <Button variant="outline" size="sm" className="gap-1.5"><Sparkles className="size-4" />AI follow-ups</Button>
            <Button size="sm" className="gap-1.5"><Plus className="size-4" />New lead</Button>
          </>
        }
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Open pipeline" value={formatZAR(totalPipe)} hint={`${leads.length} deals`} />
        <StatCard label="Win rate (30d)" value="34%" delta="▲ 4pts" accent="success" />
        <StatCard label="Avg cycle" value="18 days" hint="Tour → Won" />
        <StatCard label="Tours this week" value="27" delta="+6 vs last" accent="brand" />
      </div>

      <div className="overflow-x-auto">
        <div className="flex gap-3 min-w-max pb-4">
          {byStage.map((col) => (
            <div key={col.stage} className="w-72 shrink-0 rounded-xl bg-muted/40 p-3">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-foreground/70">{col.stage}</div>
                <Badge variant="outline" className="text-[10px]">{col.items.length}</Badge>
              </div>
              <div className="space-y-2">
                {col.items.length === 0 && <div className="text-[11px] text-muted-foreground italic p-2">No deals</div>}
                {col.items.map((l) => (
                  <div key={l.id} className="card-soft p-3 cursor-pointer hover:shadow-elevated transition-shadow">
                    <div className="flex items-start justify-between mb-1">
                      <div className="text-sm font-medium">{l.company}</div>
                      <Badge variant="secondary" className="text-[10px]">{l.score}</Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{l.contact} · {l.source}</div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="text-xs tabular-nums">{l.value ? formatZAR(l.value) : "—"}</div>
                      <div className="text-[10px] text-muted-foreground">{l.branch}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
