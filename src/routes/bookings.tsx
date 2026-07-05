import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { branches } from "@/lib/mock";
import { CalendarDays, Clock3, MapPin, Sparkles } from "lucide-react";

export const Route = createFileRoute("/bookings")({
  head: () => ({ meta: [{ title: "Bookings — WorkspaceOS" }] }),
  component: Bookings,
});

const slots = Array.from({ length: 10 }, (_, i) => `${8 + i}:00`);
const sample = [
  { branch: "Bryanston", room: "Atlas Boardroom", tenant: "Tundra Capital", start: 1, span: 2, kind: "Boardroom" },
  { branch: "Bryanston", room: "Karoo MR", tenant: "Northwind Legal", start: 2, span: 1, kind: "Meeting" },
  { branch: "Rosebank", room: "Podcast Studio B", tenant: "Mosaic Studio", start: 4, span: 2, kind: "Podcast" },
  { branch: "Bryanston", room: "The Loft", tenant: "Helix Ventures", start: 6, span: 3, kind: "Event" },
  { branch: "Kyalami", room: "Hot Desk Bank", tenant: "Ember & Co.", start: 0, span: 4, kind: "Desk" },
  { branch: "Kyalami", room: "Cedar Training Rm", tenant: "Quanta Labs", start: 5, span: 2, kind: "Training" },
];

function Bookings() {
  const tourSlots = [
    { branch: "Bryanston", day: "Tue, 8 Jul", time: "09:00", note: "Private office tour" },
    { branch: "Rosebank", day: "Wed, 9 Jul", time: "11:30", note: "Hot desk + community tour" },
    { branch: "Kyalami", day: "Thu, 10 Jul", time: "14:00", note: "Boardroom and lounge tour" },
    { branch: "Union Station", day: "Fri, 11 Jul", time: "16:00", note: "Event venue walkthrough" },
  ];

  return (
    <div className="mx-auto max-w-375">
      <PageHeader
        eyebrow="Cross-Branch Bookings"
        title="Today’s schedule"
        description="A tenant in Bryanston can book a room in Cape Town in two clicks. Here’s every booking, everywhere, right now."
        actions={
          <>
            <Button variant="outline" size="sm">Calendar</Button>
            <Button size="sm">New booking</Button>
          </>
        }
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Bookings today" value="324" delta="▲ 18 vs avg" accent="brand" />
        <StatCard label="Cross-branch" value="47" hint="14% of all" />
        <StatCard label="Peak utilization" value="11am" hint="84% rooms in use" />
        <StatCard label="Waiting lists" value="6" accent="warning" />
      </div>

      <div className="card-soft p-5 mb-6 border-brand/20 bg-brand/5">
        <div className="flex items-center gap-2 text-sm font-medium text-brand">
          <Sparkles className="size-4" /> Guided viewing request
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Your tour request is being managed with sales support. Choose a date and time below, and our team will confirm the best available viewing slot for your preferred branch.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6">
        {tourSlots.map((slot) => (
          <div key={`${slot.branch}-${slot.day}`} className="card-soft p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{slot.branch}</div>
                <div className="text-sm text-muted-foreground">{slot.note}</div>
              </div>
              <Badge variant="outline" className="text-[10px]">Sales assisted</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><CalendarDays className="size-4" />{slot.day}</span>
              <span className="flex items-center gap-1.5"><Clock3 className="size-4" />{slot.time}</span>
              <span className="flex items-center gap-1.5"><MapPin className="size-4" />{slot.branch}</span>
            </div>
            <Button asChild size="sm" className="mt-4"><Link to="/tour-calendar">Choose this slot</Link></Button>
          </div>
        ))}
      </div>

      <div className="card-soft overflow-hidden">
        <div className="grid grid-cols-[180px_1fr] border-b bg-muted/30">
          <div className="px-4 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Branch / Room</div>
          <div className="grid grid-cols-10">
            {slots.map((s) => (
              <div key={s} className="px-2 py-2.5 text-[11px] text-muted-foreground border-l">{s}</div>
            ))}
          </div>
        </div>
        {branches.slice(0, 6).map((b) => {
          const rooms = sample.filter(s => s.branch === b.name);
          if (rooms.length === 0) return (
            <div key={b.id} className="grid grid-cols-[180px_1fr] border-b">
              <div className="px-4 py-4">
                <div className="text-sm font-medium">{b.name}</div>
                <div className="text-[11px] text-muted-foreground">No bookings</div>
              </div>
              <div className="grid grid-cols-10">
                {slots.map((s) => <div key={s} className="border-l h-12" />)}
              </div>
            </div>
          );
          return rooms.map((r, idx) => (
            <div key={`${b.id}-${idx}`} className="grid grid-cols-[180px_1fr] border-b">
              <div className="px-4 py-3">
                <div className="text-sm font-medium">{idx === 0 ? b.name : ""}</div>
                <div className="text-[11px] text-muted-foreground">{r.room}</div>
              </div>
              <div className="grid grid-cols-10 relative h-12">
                {slots.map((s, i) => <div key={s} className="border-l h-full" data-i={i} />)}
                <div
                  className="absolute top-1.5 bottom-1.5 rounded-md bg-brand/15 border border-brand/40 px-2 flex items-center text-[11px] text-foreground/85"
                  style={{ left: `${(r.start / 10) * 100}%`, width: `${(r.span / 10) * 100}%` }}
                >
                  <span className="truncate font-medium">{r.tenant}</span>
                  <Badge variant="outline" className="ml-auto text-[9px] bg-card">{r.kind}</Badge>
                </div>
              </div>
            </div>
          ));
        })}
      </div>
    </div>
  );
}
