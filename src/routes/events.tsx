import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { events } from "@/lib/mock";
import { CalendarHeart, MapPin, Plus } from "lucide-react";

export const Route = createFileRoute("/events")({
  head: () => ({ meta: [{ title: "Events — WorkspaceOS" }] }),
  component: Events,
});

function Events() {
  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader
        eyebrow="Events & Networking"
        title="Upcoming events"
        description="Internal mixers, branch launches, public workshops and national summits."
        actions={<Button size="sm" className="gap-1.5"><Plus className="size-4" />Create event</Button>}
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Upcoming" value={String(events.length * 4)} hint="Next 30 days" />
        <StatCard label="RSVPs (week)" value="612" delta="+98" accent="brand" />
        <StatCard label="Avg attendance" value="84%" accent="success" />
        <StatCard label="NPS (last event)" value="72" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {events.map((e) => (
          <div key={e.id} className="card-soft overflow-hidden">
            <div className="h-32 bg-gradient-to-br from-brand/30 via-brand-soft to-accent flex items-end p-4">
              <Badge variant="secondary" className="bg-card/90 text-[10px]">{e.kind}</Badge>
            </div>
            <div className="p-5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-display font-semibold leading-tight">{e.title}</h3>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                    <span className="flex items-center gap-1"><CalendarHeart className="size-3" /> {e.date}</span>
                    <span className="flex items-center gap-1"><MapPin className="size-3" /> {e.branch}</span>
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                  <span>RSVPs</span><span>{e.rsvp} / {e.capacity}</span>
                </div>
                <Progress value={(e.rsvp / e.capacity) * 100} className="h-1.5" />
              </div>
              <div className="mt-4 flex gap-2">
                <Button size="sm" variant="outline" className="flex-1">Manage</Button>
                <Button size="sm" className="flex-1">Check-in</Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
