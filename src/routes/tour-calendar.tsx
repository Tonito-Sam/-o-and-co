import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { BrandLogo } from "@/components/BrandLogo";
import { toast } from "sonner";
import { ArrowRight, CalendarDays, Clock3, MapPin, Sparkles } from "lucide-react";

export const Route = createFileRoute("/tour-calendar")({
  head: () => ({ meta: [{ title: "Tour calendar — Office & Co WorkspaceOS" }] }),
  component: TourCalendar,
});

const branchOptions = [
  { id: "bryanston", name: "Bryanston", city: "Sandton", slots: ["09:00", "11:30", "15:00"] },
  { id: "rosebank", name: "Rosebank", city: "Johannesburg", slots: ["10:00", "13:00", "16:30"] },
  { id: "kyalami", name: "Kyalami", city: "Midrand", slots: ["08:30", "12:00", "14:30"] },
  { id: "union", name: "Union Station", city: "CBD", slots: ["09:30", "12:30", "17:00"] },
] as const;

function TourCalendar() {
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));
  const [selectedBranch, setSelectedBranch] = useState<(typeof branchOptions)[number]["id"]>("bryanston");
  const [selectedSlot, setSelectedSlot] = useState("09:00");

  const branch = useMemo(() => branchOptions.find((item) => item.id === selectedBranch) ?? branchOptions[0], [selectedBranch]);

  const availableSlots = useMemo(() => {
    const match = branchOptions.find((item) => item.id === selectedBranch);
    return match?.slots ?? [];
  }, [selectedBranch, branch]);

  const confirmSelection = () => {
    if (!selectedDate) {
      toast.error("Please choose a visit date.");
      return;
    }

    toast.success(`Tour request saved for ${branch.name} on ${selectedDate.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })} at ${selectedSlot}. Our sales team will confirm shortly.`);
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(117,152,242,0.16),transparent_32%),linear-gradient(130deg,#f7f8fc_0%,#eef3ff_100%)]">
      <header className="border-b border-white/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/welcome" className="flex items-center gap-2.5">
            <div className="grid size-10 place-items-center rounded-xl bg-primary"><BrandLogo className="size-6 object-contain" /></div>
            <div className="leading-tight">
              <div className="font-display text-sm font-semibold">Office &amp; Co</div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">Tour booking</div>
            </div>
          </Link>
          <Button asChild variant="ghost" size="sm" className="gap-1.5">
            <Link to="/welcome">Back to home <ArrowRight className="size-3.5" /></Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[28px] border border-white/70 bg-background/90 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.25)] backdrop-blur-md">
          <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="bg-linear-to-br from-primary via-brand to-sky-600 p-6 text-primary-foreground sm:p-8 lg:p-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em]">
                <Sparkles className="size-3.5" /> Guided viewing request
              </div>
              <h1 className="mt-5 font-display text-3xl font-semibold leading-tight sm:text-4xl">
                A better way to book your tour.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-7 text-white/85 sm:text-base">
                Pick your preferred branch, date and time here. Our sales team will confirm your visit and support the tour from first contact.
              </p>
              <div className="mt-6 grid gap-2 text-sm text-white/90 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/15 bg-white/10 p-3">
                  <div className="font-semibold">Sales assisted</div>
                  <div className="text-xs text-white/70">A team member confirms the visit.</div>
                </div>
                <div className="rounded-2xl border border-white/15 bg-white/10 p-3">
                  <div className="font-semibold">Fast options</div>
                  <div className="text-xs text-white/70">Dates and slots updated live.</div>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-6 md:p-8">
              <div className="space-y-6">
                <div className="card-soft p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-brand">
                      <CalendarDays className="size-4" /> Pick a date
                    </div>
                    <div className="text-xs text-muted-foreground">Available from tomorrow</div>
                  </div>
                  <div className="mt-4 rounded-3xl border border-border bg-background/70 p-3 shadow-sm">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      fromDate={today}
                      className="mx-auto"
                    />
                  </div>
                  <div className="mt-4 text-sm text-muted-foreground">
                    Selected date: <span className="font-medium text-foreground">{selectedDate ? selectedDate.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "Choose a date"}</span>
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="card-soft p-5">
                    <div className="flex items-center justify-between gap-2 text-sm font-medium text-brand">
                      <div className="flex items-center gap-2"><MapPin className="size-4" /> Branch availability</div>
                      <span className="text-xs text-muted-foreground">Tap to switch</span>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {branchOptions.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setSelectedBranch(item.id);
                            setSelectedSlot(item.slots[0]);
                          }}
                          className={`w-full rounded-2xl border px-3 py-3 text-left text-sm transition ${selectedBranch === item.id ? "border-brand bg-brand/10 text-foreground shadow-sm" : "border-border bg-background hover:border-brand/40"}`}
                        >
                          <div className="font-semibold">{item.name}</div>
                          <div className="mt-1 text-[11px] text-muted-foreground">{item.city}</div>
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 text-sm text-muted-foreground">{branch.city} · guided tour with sales support</div>
                  </div>

                  <div className="card-soft p-5">
                    <div className="flex items-center justify-between gap-2 text-sm font-medium text-brand">
                      <div className="flex items-center gap-2"><Clock3 className="size-4" /> Available time slots</div>
                      <span className="text-xs text-muted-foreground">Select one</span>
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      {availableSlots.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`rounded-2xl border px-3 py-3 text-sm text-left transition ${selectedSlot === slot ? "border-brand bg-brand/10 text-foreground shadow-sm" : "border-border bg-background hover:border-brand/30"}`}
                        >
                          <div className="font-medium">{slot}</div>
                          <Badge variant="outline" className="mt-2 text-[10px]">{selectedSlot === slot ? "Selected" : "Open"}</Badge>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="card-soft p-5">
                  <div className="flex items-center gap-2 text-sm font-medium text-brand">
                    <Sparkles className="size-4" /> What happens next
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">Confirm your visit and our sales team will contact you to finalise the tour details and prepare your branch welcome.</p>
                  <Button className="mt-4 w-full" onClick={confirmSelection}>Confirm tour date</Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
