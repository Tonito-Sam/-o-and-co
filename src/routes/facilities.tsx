import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { spaces } from "@/lib/mock";
import { DoorOpen, Plus } from "lucide-react";

export const Route = createFileRoute("/facilities")({
  head: () => ({ meta: [{ title: "Facilities — WorkspaceOS" }] }),
  component: Facilities,
});

const typeColor: Record<string, string> = {
  Boardroom: "bg-brand-soft text-brand",
  "Meeting Room": "bg-accent text-accent-foreground",
  "Podcast Studio": "bg-warning/20 text-warning",
  "Event Space": "bg-info/10 text-info",
  "Hot Desks": "bg-muted text-foreground/70",
  "Training Room": "bg-success/15 text-success",
};

function Facilities() {
  return (
    <div className="mx-auto max-w-350">
      <PageHeader
        eyebrow="Smart Facility Management"
        title="Spaces"
        description="Every boardroom, studio, desk and event space — live availability across the group."
        actions={<Button size="sm" className="gap-1.5"><Plus className="size-4" />Register space</Button>}
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total spaces" value="412" hint="Across 6 branches" />
        <StatCard label="In use now" value="187" delta="45% utilization" accent="brand" />
        <StatCard label="Booked next 2h" value="64" />
        <StatCard label="Avg utilization (wk)" value="72%" delta="▲ 5pts" accent="success" />
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {spaces.map((s) => (
          <div key={s.id} className="card-soft p-5 hover:shadow-elevated transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className={`grid size-10 place-items-center rounded-lg ${typeColor[s.type] ?? "bg-muted"}`}>
                <DoorOpen className="size-5" />
              </div>
              <Badge variant={s.status === "Available" ? "default" : s.status === "In Use" ? "destructive" : "secondary"} className="text-[10px]">
                {s.status}{s.until !== "—" && ` · until ${s.until}`}
              </Badge>
            </div>
            <div className="font-display text-lg font-semibold">{s.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.type} · capacity {s.capacity}</div>
            <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{s.branch} · Floor {s.floor}</span>
              <Button variant="ghost" size="sm" className="h-7 text-xs">Book</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
