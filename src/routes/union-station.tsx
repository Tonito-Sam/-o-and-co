import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { unionStationRequests, unionStationVenue, formatZAR, type UnionStationStatus, type UnionStationRequest } from "@/lib/mock";
import { Landmark, MapPin, Users, Sparkles, AlertCircle, CalendarHeart } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase";

export const Route = createFileRoute("/union-station")({
  head: () => ({ meta: [{ title: "Union Station � Corporate Events � WorkspaceOS" }] }),
  component: UnionStation,
});

const STATUS_TONE: Record<UnionStationStatus, string> = {
  Draft: "bg-muted text-foreground/70",
  Submitted: "bg-info/15 text-info border-info/20",
  "In Review": "bg-warning/15 text-warning border-warning/30",
  Quoted: "bg-brand/15 text-brand border-brand/30",
  Confirmed: "bg-success/15 text-success border-success/30",
  Invoiced: "bg-primary/15 text-primary border-primary/30",
  Completed: "bg-muted text-muted-foreground",
  Declined: "bg-destructive/15 text-destructive border-destructive/30",
};

function pricing(layout: string, attendees: number, hours: number, catering: keyof typeof unionStationVenue.cateringPerHead, av: string[], afterHours: boolean) {
  const base = unionStationVenue.baseRatePerHour * Math.max(1, hours);
  const cater = unionStationVenue.cateringPerHead[catering] * attendees;
  const avTotal = av.reduce((s, a) => s + (unionStationVenue.avRates[a] ?? 0), 0);
  const sub = base + cater + avTotal;
  return Math.round(sub * (afterHours ? 1 + unionStationVenue.afterHoursSurchargePct : 1));
}

function UnionStation() {
  const [requests, setRequests] = useState<UnionStationRequest[]>([]);
  const [tab, setTab] = useState("request");

  const [form, setForm] = useState({
    client: "", contact: "", email: "", eventType: "Conference",
    date: "", start: "09:00", end: "17:00", attendees: 120,
    layout: "Theatre" as UnionStationRequest["layout"],
    catering: "Lunch" as UnionStationRequest["catering"],
    av: ["Pro AV + Streaming"] as string[],
    notes: "",
  });

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void supabase.rpc("get_public_union_station_calendar", { p_from: new Date().toISOString().slice(0, 10) })
      .then(({ data, error }) => {
        if (error) {
          console.error("Union Station calendar load failed:", error.message);
          return;
        }
        const rows = (data ?? []) as Array<{
          reference: string;
          event_type: string;
          event_date: string;
          starts_time: string;
          ends_time: string;
          attendees: number;
          layout: string;
          status: string;
        }>;
        setRequests(rows.map((row) => ({
          id: row.reference,
          client: "Booked event",
          contact: "",
          email: "",
          eventType: row.event_type,
          date: row.event_date,
          start: row.starts_time.slice(0, 5),
          end: row.ends_time.slice(0, 5),
          attendees: row.attendees,
          layout: row.layout as UnionStationRequest["layout"],
          catering: "None",
          av: [],
          status: row.status === "invoiced" ? "Invoiced" : row.status === "completed" ? "Completed" : "Confirmed",
          estimate: 0,
          depositPct: 30,
          contractSent: false,
          contractSigned: false,
          submittedBy: "Events team",
          submittedAt: row.event_date,
        })));
      });
  }, []);

  const hours = useMemo(() => {
    const [sh, sm] = form.start.split(":").map(Number);
    const [eh, em] = form.end.split(":").map(Number);
    return Math.max(1, (eh + em / 60) - (sh + sm / 60));
  }, [form.start, form.end]);

  const afterHours = useMemo(
    () => Number(form.end.split(":")[0]) >= 19 || Number(form.start.split(":")[0]) < 7,
    [form.start, form.end],
  );

  const estimate = useMemo(
    () => pricing(form.layout, form.attendees, hours, form.catering, form.av, afterHours),
    [form, hours, afterHours],
  );

  const conflicts = useMemo(
    () => requests.filter(r => r.date === form.date && ["Confirmed", "Quoted", "In Review"].includes(r.status)),
    [requests, form.date],
  );

  const submit = async () => {
    if (!form.client || !form.date || !form.contact) {
      toast.error("Please complete client, contact and date.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Union Station requests are temporarily unavailable.");
      return;
    }
    const { data, error } = await supabase.rpc("submit_public_union_station_request", {
      p_client_company: form.client.trim(),
      p_contact_name: form.contact.trim(),
      p_contact_email: form.email.trim(),
      p_contact_phone: null,
      p_event_type: form.eventType,
      p_event_date: form.date,
      p_starts_time: form.start,
      p_ends_time: form.end,
      p_attendees: form.attendees,
      p_layout: form.layout,
      p_catering: form.catering,
      p_av_addons: form.av,
      p_notes: form.notes.trim() || null,
      p_estimate_zar: estimate,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    const result = data as { id: string; reference: string };
    setRequests((prev) => [{
      id: result.reference,
      client: form.client,
      contact: form.contact,
      email: form.email,
      eventType: form.eventType,
      date: form.date,
      start: form.start,
      end: form.end,
      attendees: form.attendees,
      layout: form.layout,
      catering: form.catering,
      av: form.av,
      notes: form.notes,
      status: "Submitted",
      estimate,
      depositPct: 30,
      contractSent: false,
      contractSigned: false,
      submittedBy: "You",
      submittedAt: new Date().toISOString().slice(0, 10),
    }, ...prev]);

    toast.success(`Request ${result.reference} submitted. The Kyalami events team has been notified.`);
    setTab("calendar");
  };

  return (
    <div className="mx-auto max-w-350">
      <PageHeader
        eyebrow="Union Station � Bookings for visitors & tenants"
        title="Book your event or meeting"
        description="Visitors and tenants can request a quote, review what is already booked, and see upcoming Union Station events before submitting a request."
        actions={
          <>
            <Button variant="outline" size="sm">Download brochure</Button>
            <Button size="sm" className="gap-1.5" onClick={() => setTab("request")}><CalendarHeart className="size-4" />Get a quote</Button>
          </>
        }
      />

      <div className="card-soft p-6 mb-6 relative overflow-hidden">
        <div className="absolute inset-0 surface-grid opacity-50 pointer-events-none" />
        <div className="relative grid md:grid-cols-[1.4fr_1fr] gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <Landmark className="size-3.5" /> Heritage building � Johannesburg CBD
            </div>
            <h2 className="font-display text-xl font-semibold mb-1.5">Four halls. One unforgettable address.</h2>
            <p className="text-sm text-foreground/80 max-w-xl">
              From a 24-seat boardroom to a 450-capacity gala dinner � Union Station is built for the most demanding corporate events: investor briefings, year-end galas, leadership summits and product launches.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 max-w-md">
              {unionStationVenue.halls.map(h => (
                <div key={h} className="text-xs flex items-center gap-2 rounded-md border bg-card px-2.5 py-2">
                  <MapPin className="size-3 text-brand" />{h}
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border bg-card p-4">
              <div className="text-[11px] text-muted-foreground">Max capacity</div>
              <div className="font-display text-2xl font-semibold mt-1">{unionStationVenue.capacity}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1"><Users className="size-3" /> Banquet / theatre</div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="text-[11px] text-muted-foreground">Base venue rate</div>
              <div className="font-display text-2xl font-semibold mt-1">{formatZAR(unionStationVenue.baseRatePerHour)}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">per hour, exc. catering & AV</div>
            </div>
          </div>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="request">Get a quote</TabsTrigger>
          <TabsTrigger value="calendar">Availability calendar</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming events</TabsTrigger>
        </TabsList>

        <TabsContent value="request" className="space-y-4">
          <div className="grid lg:grid-cols-[1fr_360px] gap-4">
            <div className="card-soft p-6 space-y-5">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label>Client / Company</Label>
                  <Input value={form.client} onChange={e => setForm({ ...form, client: e.target.value })} placeholder="e.g. Investec Private Bank" /></div>
                <div className="space-y-1.5"><Label>Event type</Label>
                  <Select value={form.eventType} onValueChange={v => setForm({ ...form, eventType: v })}>
                    <SelectTrigger /><SelectContent>
                      {["Conference", "Gala Dinner", "Product Launch", "Investor Briefing", "Leadership Offsite", "Workshop", "Awards Evening"].map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select></div>
                <div className="space-y-1.5"><Label>Primary contact</Label>
                  <Input value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} placeholder="Full name" /></div>
                <div className="space-y-1.5"><Label>Email</Label>
                  <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="name@company.com" /></div>
                <div className="space-y-1.5"><Label>Date</Label>
                  <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5"><Label>Start</Label><Input type="time" value={form.start} onChange={e => setForm({ ...form, start: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>End</Label><Input type="time" value={form.end} onChange={e => setForm({ ...form, end: e.target.value })} /></div>
                </div>
                <div className="space-y-1.5"><Label>Expected attendees</Label>
                  <Input type="number" min={1} max={unionStationVenue.capacity} value={form.attendees} onChange={e => setForm({ ...form, attendees: Number(e.target.value) })} /></div>
                <div className="space-y-1.5"><Label>Layout</Label>
                  <Select value={form.layout} onValueChange={v => setForm({ ...form, layout: v as UnionStationRequest["layout"] })}>
                    <SelectTrigger /><SelectContent>
                      {(["Theatre", "Banquet", "Cabaret", "Classroom", "Expo"] as const).map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select></div>
                <div className="space-y-1.5"><Label>Catering</Label>
                  <Select value={form.catering} onValueChange={v => setForm({ ...form, catering: v as UnionStationRequest["catering"] })}>
                    <SelectTrigger /><SelectContent>
                      {(Object.keys(unionStationVenue.cateringPerHead) as (keyof typeof unionStationVenue.cateringPerHead)[]).map(c => <SelectItem key={c} value={c}>{c} {unionStationVenue.cateringPerHead[c] > 0 && `� ${formatZAR(unionStationVenue.cateringPerHead[c])}/head`}</SelectItem>)}
                    </SelectContent>
                  </Select></div>
              </div>

              <div className="space-y-2">
                <Label>AV & production add-ons</Label>
                <div className="grid sm:grid-cols-2 gap-2">
                  {Object.entries(unionStationVenue.avRates).map(([k, v]) => (
                    <label key={k} className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 cursor-pointer hover:bg-muted/30">
                      <Checkbox checked={form.av.includes(k)} onCheckedChange={(c) => setForm({ ...form, av: c ? [...form.av, k] : form.av.filter(a => a !== k) })} />
                      <span className="text-sm flex-1">{k}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{formatZAR(v)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Notes for the events team</Label>
                <Textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Special requirements, dietary considerations, VIPs�" />
              </div>

              <div className="rounded-md border border-brand/20 bg-brand/10 p-3 text-sm text-foreground/80">
                <div className="font-medium text-brand">Fast quote request</div>
                <div className="mt-1 text-xs text-foreground/70">Complete the form and submit your request. The events team will review availability and respond with a tailored quote.</div>
              </div>

              {conflicts.length > 0 && (
                <div className="flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs">
                  <AlertCircle className="size-4 text-warning shrink-0 mt-px" />
                  <div>
                    <div className="font-medium text-warning">Possible conflict on {form.date}</div>
                    <div className="text-foreground/80">{conflicts.map(c => `${c.client} (${c.status})`).join(" � ")}</div>
                  </div>
                </div>
              )}
            </div>

            <aside className="card-soft p-6 h-fit sticky top-20">
              <div className="text-[11px] uppercase tracking-wider text-brand font-medium mb-2">Live quote</div>
              <div className="font-display text-3xl font-semibold tabular-nums">{formatZAR(estimate)}</div>
              <div className="text-xs text-muted-foreground mt-1">Estimate � exc. VAT</div>
              <div className="mt-5 space-y-2 text-sm border-t pt-4">
                <Row label={`Venue � ${hours.toFixed(1)}h`} value={formatZAR(unionStationVenue.baseRatePerHour * hours)} />
                <Row label={`Catering � ${form.catering} � ${form.attendees}`} value={formatZAR(unionStationVenue.cateringPerHead[form.catering] * form.attendees)} />
                <Row label={`AV (${form.av.length})`} value={formatZAR(form.av.reduce((s, a) => s + (unionStationVenue.avRates[a] ?? 0), 0))} />
                {afterHours && <Row label={`After-hours surcharge`} value={`+${Math.round(unionStationVenue.afterHoursSurchargePct * 100)}%`} highlight />}
              </div>
              <Button className="w-full mt-5 gap-1.5" onClick={submit}><Sparkles className="size-4" />Get a quote</Button>
              <div className="text-[11px] text-muted-foreground mt-3 text-center">Your request is shared with the events team for a prompt response and quote.</div>
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="calendar">
          <div className="card-soft p-5">
            <div className="text-sm font-medium mb-3">Dates already booked</div>
            <div className="space-y-2">
              {requests.filter(r => ["Confirmed", "In Review", "Quoted", "Submitted"].includes(r.status)).map(r => (
                <div key={r.id} className="grid grid-cols-[100px_1fr_auto] gap-3 items-center rounded-md border bg-card p-3">
                  <div className="text-center">
                    <div className="text-[10px] uppercase text-muted-foreground">{r.date.slice(5, 7) === "07" ? "Jul" : r.date.slice(5, 7) === "08" ? "Aug" : "Sep"}</div>
                    <div className="font-display text-xl font-semibold">{r.date.slice(8)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">{r.client} � {r.eventType}</div>
                    <div className="text-[11px] text-muted-foreground">{r.start}�{r.end} � {r.attendees} guests � {r.layout}</div>
                  </div>
                  <Badge variant="outline" className={STATUS_TONE[r.status]}>{r.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="upcoming">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="card-soft p-5">
              <div className="text-sm font-medium mb-3">Upcoming event calendar</div>
              <div className="space-y-2">
                {requests.filter(r => r.status === "Confirmed" || r.status === "Invoiced").map(r => (
                  <div key={r.id} className="rounded-md border bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">{r.client}</div>
                      <Badge variant="outline" className={STATUS_TONE[r.status]}>{r.status}</Badge>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{r.date} � {r.start}�{r.end} � {r.attendees} guests</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card-soft p-5">
              <div className="text-sm font-medium mb-3">What to know before you book</div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="rounded-md border bg-card p-3">Quotes are usually returned within 4 working hours.</div>
                <div className="rounded-md border bg-card p-3">The venue supports conferences, galas, launches and boardroom sessions.</div>
                <div className="rounded-md border bg-card p-3">AV, catering and after-hours support can be added to your request.</div>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? "text-warning font-medium tabular-nums" : "tabular-nums"}>{value}</span>
    </div>
  );
}
