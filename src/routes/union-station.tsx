import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { unionStationRequests, unionStationVenue, formatZAR, formatInt, eventAccessCodes, type UnionStationStatus, type UnionStationRequest } from "@/lib/mock";
import { Landmark, MapPin, Users, Sparkles, AlertCircle, FileSignature, CalendarHeart, CheckCircle2, X, QrCode, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/union-station")({
  head: () => ({ meta: [{ title: "Union Station — Corporate Events — WorkspaceOS" }] }),
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

const STATUS_FLOW: UnionStationStatus[] = ["Draft", "Submitted", "In Review", "Quoted", "Confirmed", "Invoiced", "Completed"];

function pricing(layout: string, attendees: number, hours: number, catering: keyof typeof unionStationVenue.cateringPerHead, av: string[], afterHours: boolean) {
  const base = unionStationVenue.baseRatePerHour * Math.max(1, hours);
  const cater = unionStationVenue.cateringPerHead[catering] * attendees;
  const avTotal = av.reduce((s, a) => s + (unionStationVenue.avRates[a] ?? 0), 0);
  const sub = base + cater + avTotal;
  return Math.round(sub * (afterHours ? 1 + unionStationVenue.afterHoursSurchargePct : 1));
}

function UnionStation() {
  const [requests, setRequests] = useState<UnionStationRequest[]>(unionStationRequests);
  const [tab, setTab] = useState("request");

  // Form state
  const [form, setForm] = useState({
    client: "", contact: "", email: "", eventType: "Conference",
    date: "", start: "09:00", end: "17:00", attendees: 120,
    layout: "Theatre" as UnionStationRequest["layout"],
    catering: "Lunch" as UnionStationRequest["catering"],
    av: ["Pro AV + Streaming"] as string[],
    notes: "",
  });

  const hours = useMemo(() => {
    const [sh, sm] = form.start.split(":").map(Number);
    const [eh, em] = form.end.split(":").map(Number);
    return Math.max(1, (eh + em / 60) - (sh + sm / 60));
  }, [form.start, form.end]);

  const afterHours = useMemo(() => Number(form.end.split(":")[0]) >= 19 || Number(form.start.split(":")[0]) < 7, [form.start, form.end]);
  const estimate = useMemo(() => pricing(form.layout, form.attendees, hours, form.catering, form.av, afterHours), [form, hours, afterHours]);

  const conflicts = useMemo(
    () => requests.filter(r => r.date === form.date && ["Confirmed", "Quoted", "In Review"].includes(r.status)),
    [requests, form.date],
  );

  const submit = () => {
    if (!form.client || !form.date || !form.contact) {
      toast.error("Please complete client, contact and date.");
      return;
    }
    const id = `US-2026-${String(36 + requests.length).padStart(3, "0")}`;
    setRequests(prev => [{
      id, client: form.client, contact: form.contact, email: form.email,
      eventType: form.eventType, date: form.date, start: form.start, end: form.end,
      attendees: form.attendees, layout: form.layout, catering: form.catering, av: form.av,
      notes: form.notes, status: "Submitted", estimate, depositPct: 30,
      contractSent: false, contractSigned: false, submittedBy: "You", submittedAt: new Date().toISOString().slice(0, 10),
    }, ...prev]);
    toast.success(`Request ${id} submitted — events team notified.`);
    setTab("approvals");
  };

  const updateStatus = (id: string, status: UnionStationStatus) => {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    toast.success(`${id} → ${status}`);
  };

  const stats = useMemo(() => {
    const confirmed = requests.filter(r => r.status === "Confirmed" || r.status === "Invoiced").length;
    const pipeline = requests.filter(r => ["Submitted", "In Review", "Quoted"].includes(r.status))
      .reduce((s, r) => s + r.estimate, 0);
    const guests = requests.filter(r => r.status === "Confirmed").reduce((s, r) => s + r.attendees, 0);
    return { confirmed, pending: requests.length - confirmed, pipeline, guests };
  }, [requests]);

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        eyebrow="Union Station · Corporate Event Venue"
        title="Premier corporate events — Johannesburg"
        description="Africa's most-booked corporate venue. Submit a request, get a live quote, and route through approvals — all in one place."
        actions={
          <>
            <Button variant="outline" size="sm">Download brochure</Button>
            <Button size="sm" className="gap-1.5" onClick={() => setTab("request")}><CalendarHeart className="size-4" />New request</Button>
          </>
        }
      />

      {/* Venue hero */}
      <div className="card-soft p-6 mb-6 relative overflow-hidden">
        <div className="absolute inset-0 surface-grid opacity-50 pointer-events-none" />
        <div className="relative grid md:grid-cols-[1.4fr_1fr] gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <Landmark className="size-3.5" /> Heritage building · Johannesburg CBD
            </div>
            <h2 className="font-display text-xl font-semibold mb-1.5">Four halls. One unforgettable address.</h2>
            <p className="text-sm text-foreground/80 max-w-xl">
              From a 24-seat boardroom to a 450-capacity gala dinner — Union Station is built for the most demanding corporate events: investor briefings, year-end galas, leadership summits and product launches.
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Confirmed events" value={String(stats.confirmed)} accent="success" />
        <StatCard label="In pipeline" value={String(stats.pending)} accent="brand" hint="awaiting approval" />
        <StatCard label="Pipeline value" value={formatZAR(stats.pipeline)} accent="brand" />
        <StatCard label="Confirmed guests" value={formatInt(stats.guests)} hint="next 90 days" />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="request">New request</TabsTrigger>
          <TabsTrigger value="approvals">Approvals queue</TabsTrigger>
          <TabsTrigger value="checkin">Event check-in</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>

        {/* ─── Request form ─── */}
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
                      {(Object.keys(unionStationVenue.cateringPerHead) as (keyof typeof unionStationVenue.cateringPerHead)[]).map(c => <SelectItem key={c} value={c}>{c} {unionStationVenue.cateringPerHead[c] > 0 && `· ${formatZAR(unionStationVenue.cateringPerHead[c])}/head`}</SelectItem>)}
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
                <Textarea rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Special requirements, dietary considerations, VIPs…" />
              </div>

              {conflicts.length > 0 && (
                <div className="flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs">
                  <AlertCircle className="size-4 text-warning shrink-0 mt-px" />
                  <div>
                    <div className="font-medium text-warning">Possible conflict on {form.date}</div>
                    <div className="text-foreground/80">{conflicts.map(c => `${c.client} (${c.status})`).join(" · ")}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Live quote */}
            <aside className="card-soft p-6 h-fit sticky top-20">
              <div className="text-[11px] uppercase tracking-wider text-brand font-medium mb-2">Live quote</div>
              <div className="font-display text-3xl font-semibold tabular-nums">{formatZAR(estimate)}</div>
              <div className="text-xs text-muted-foreground mt-1">Estimate · exc. VAT</div>
              <div className="mt-5 space-y-2 text-sm border-t pt-4">
                <Row label={`Venue · ${hours.toFixed(1)}h`} value={formatZAR(unionStationVenue.baseRatePerHour * hours)} />
                <Row label={`Catering · ${form.catering} × ${form.attendees}`} value={formatZAR(unionStationVenue.cateringPerHead[form.catering] * form.attendees)} />
                <Row label={`AV (${form.av.length})`} value={formatZAR(form.av.reduce((s, a) => s + (unionStationVenue.avRates[a] ?? 0), 0))} />
                {afterHours && <Row label={`After-hours surcharge`} value={`+${Math.round(unionStationVenue.afterHoursSurchargePct * 100)}%`} highlight />}
              </div>
              <Button className="w-full mt-5 gap-1.5" onClick={submit}><Sparkles className="size-4" />Submit request</Button>
              <div className="text-[11px] text-muted-foreground mt-3 text-center">Events team responds within 4 business hours.</div>
            </aside>
          </div>
        </TabsContent>

        {/* ─── Approvals queue ─── */}
        <TabsContent value="approvals">
          <div className="card-soft overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Guests</TableHead>
                  <TableHead>Estimate</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Contract</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.client}</div>
                      <div className="text-[11px] text-muted-foreground">{r.id} · {r.eventType} · {r.layout}</div>
                    </TableCell>
                    <TableCell className="text-sm">{r.date}<div className="text-[11px] text-muted-foreground">{r.start}–{r.end}</div></TableCell>
                    <TableCell className="tabular-nums">{r.attendees}</TableCell>
                    <TableCell className="tabular-nums">{formatZAR(r.estimate)}</TableCell>
                    <TableCell><Badge variant="outline" className={STATUS_TONE[r.status]}>{r.status}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className={r.contractSent ? "text-success" : "text-muted-foreground"}>{r.contractSent ? "Sent" : "—"}</span>
                        <span className="opacity-30">·</span>
                        <span className={r.contractSigned ? "text-success" : "text-muted-foreground"}>{r.contractSigned ? "Signed" : "Pending"}</span>
                      </div>
                      {r.depositPct > 0 && <div className="text-[10px] text-muted-foreground">Deposit {r.depositPct}%</div>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        {r.status === "Submitted" && <Button size="sm" variant="outline" className="h-7" onClick={() => updateStatus(r.id, "In Review")}>Review</Button>}
                        {r.status === "In Review" && <Button size="sm" className="h-7 gap-1" onClick={() => updateStatus(r.id, "Quoted")}><FileSignature className="size-3" />Send quote</Button>}
                        {r.status === "Quoted" && <Button size="sm" className="h-7 gap-1" onClick={() => updateStatus(r.id, "Confirmed")}><CheckCircle2 className="size-3" />Confirm</Button>}
                        {r.status === "Confirmed" && <Button size="sm" variant="outline" className="h-7" onClick={() => updateStatus(r.id, "Invoiced")}>Invoice</Button>}
                        {!["Declined", "Completed", "Invoiced"].includes(r.status) && (
                          <Button size="sm" variant="ghost" className="h-7 text-destructive hover:text-destructive" onClick={() => updateStatus(r.id, "Declined")}><X className="size-3" /></Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Workflow visual */}
          <div className="mt-5 card-soft p-5">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">Approval workflow</div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {STATUS_FLOW.map((s, i) => (
                <div key={s} className="flex items-center gap-1.5">
                  <Badge variant="outline" className={STATUS_TONE[s]}>{s}</Badge>
                  {i < STATUS_FLOW.length - 1 && <span className="text-muted-foreground">→</span>}
                </div>
              ))}
              <span className="ml-3 text-muted-foreground">or</span>
              <Badge variant="outline" className={STATUS_TONE.Declined}>Declined</Badge>
            </div>
          </div>
        </TabsContent>

        {/* ─── Event check-in (QR + leads) ─── */}
        <TabsContent value="checkin">
          <CheckInTab />
        </TabsContent>

        {/* ─── Calendar ─── */}
        <TabsContent value="calendar">
          <div className="card-soft p-5">
            <div className="text-sm font-medium mb-3">Upcoming confirmed events</div>
            <div className="space-y-2">
              {requests.filter(r => r.status === "Confirmed" || r.status === "Invoiced").map(r => (
                <div key={r.id} className="grid grid-cols-[100px_1fr_auto] gap-3 items-center rounded-md border bg-card p-3">
                  <div className="text-center">
                    <div className="text-[10px] uppercase text-muted-foreground">{r.date.slice(5, 7) === "07" ? "Jul" : r.date.slice(5, 7) === "08" ? "Aug" : "Sep"}</div>
                    <div className="font-display text-xl font-semibold">{r.date.slice(8)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">{r.client} · {r.eventType}</div>
                    <div className="text-[11px] text-muted-foreground">{r.start}–{r.end} · {r.attendees} guests · {r.layout}</div>
                  </div>
                  <Badge variant="outline" className={STATUS_TONE[r.status]}>{r.status}</Badge>
                </div>
              ))}
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

function CheckInTab() {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://workspace.officeandco.co.za";
  const copy = (txt: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(txt);
    toast.success("Copied to clipboard");
  };
  return (
    <div className="space-y-4">
      <div className="card-soft p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-10 place-items-center rounded-lg bg-brand-soft text-brand shrink-0"><QrCode className="size-5" /></div>
          <div>
            <h3 className="font-display font-semibold">QR check-in for every Union Station event</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">Every attendee that steps into Union Station scans the QR at the entrance, captures their email, full name and (optionally) phone — instantly feeding the sales pipeline. Codes are unique per event.</p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {eventAccessCodes.map(ev => {
          const url = `${origin}/checkin/${ev.code}`;
          const qr = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(url)}`;
          const conv = ev.leadsCaptured > 0 ? Math.round((ev.conversionsToSales / ev.leadsCaptured) * 100) : 0;
          return (
            <div key={ev.code} className="card-soft p-5 flex gap-4">
              <div className="shrink-0">
                <div className="rounded-md border bg-white p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt={`QR for ${ev.title}`} width={120} height={120} className="block" />
                </div>
                <Badge variant="outline" className={`mt-2 w-full justify-center text-[10px] ${ev.active ? "text-success border-success/30" : "text-muted-foreground"}`}>{ev.active ? "Active" : "Scheduled"}</Badge>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{ev.title}</div>
                <div className="text-[11px] text-muted-foreground">{ev.client} · {ev.date}</div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <Stat n={formatInt(ev.attendeesExpected)} l="Expected" />
                  <Stat n={formatInt(ev.leadsCaptured)} l="Captured" tone="brand" />
                  <Stat n={`${conv}%`} l="→ Sales" tone="success" />
                </div>
                <div className="mt-3 flex items-center gap-1.5">
                  <code className="text-[11px] bg-muted px-2 py-1 rounded font-mono truncate flex-1">{url}</code>
                  <Button size="icon" variant="ghost" className="size-7" onClick={() => copy(url)}><Copy className="size-3" /></Button>
                  <Button size="icon" variant="ghost" className="size-7" asChild><a href={url} target="_blank" rel="noreferrer"><ExternalLink className="size-3" /></a></Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ n, l, tone }: { n: string; l: string; tone?: "brand" | "success" }) {
  const c = tone === "brand" ? "text-brand" : tone === "success" ? "text-success" : "text-foreground";
  return (
    <div className="rounded-md bg-muted/30 p-2">
      <div className={`font-display text-sm font-semibold tabular-nums ${c}`}>{n}</div>
      <div className="text-[10px] text-muted-foreground">{l}</div>
    </div>
  );
}
