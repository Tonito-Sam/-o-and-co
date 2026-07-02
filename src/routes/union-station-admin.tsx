import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { unionStationRequests, eventAccessCodes as seedCodes, eventLeadsSample, conversionByEvent, conversionByBranch, formatZAR, formatInt, type EventAccessCode } from "@/lib/mock";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Landmark, TrendingUp, AlertTriangle, ArrowUpRight, QrCode, Users, Sparkles, Target, Clock, Plus, Copy, Download, Mail, Printer } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/union-station-admin")({
  head: () => ({ meta: [{ title: "Union Station — Admin Dashboard — WorkspaceOS" }] }),
  component: UnionStationAdmin,
});

const monthly = [
  { m: "Mar", rev: 1.1, events: 4 },
  { m: "Apr", rev: 1.3, events: 6 },
  { m: "May", rev: 1.45, events: 7 },
  { m: "Jun", rev: 1.54, events: 8 },
  { m: "Jul", rev: 1.82, events: 11 },
  { m: "Aug", rev: 2.04, events: 12 },
];

const gaps = [
  { t: "Mondays underbooked", d: "Only 18% of Mondays booked across the next 90 days — opportunity for a recurring corporate slot.", sev: "high" as const },
  { t: "Catering attach-rate", d: "32% of confirmed bookings opt for catering. Industry benchmark is 58%.", sev: "med" as const },
  { t: "AV upsell on Cabaret layouts", d: "Only 1 in 4 Cabaret bookings include Pro AV — bundle with quote template.", sev: "med" as const },
  { t: "Slow turnaround on quotes", d: "Avg quote SLA is 9h vs 4h target. 3 quotes overdue.", sev: "high" as const },
];

function UnionStationAdmin() {
  const [codes, setCodes] = useState<EventAccessCode[]>(seedCodes);

  const stats = useMemo(() => {
    const confirmed = unionStationRequests.filter(r => r.status === "Confirmed" || r.status === "Invoiced");
    const pipeline = unionStationRequests.filter(r => ["Submitted", "In Review", "Quoted"].includes(r.status));
    const revenueConfirmed = confirmed.reduce((s, r) => s + r.estimate, 0);
    const pipelineValue = pipeline.reduce((s, r) => s + r.estimate, 0);
    const guests = confirmed.reduce((s, r) => s + r.attendees, 0);
    const leadsCaptured = codes.reduce((s, e) => s + e.leadsCaptured, 0);
    const conversions = codes.reduce((s, e) => s + e.conversionsToSales, 0);
    const convRate = leadsCaptured > 0 ? Math.round((conversions / leadsCaptured) * 100) : 0;
    return { confirmed: confirmed.length, pipeline: pipeline.length, revenueConfirmed, pipelineValue, guests, leadsCaptured, conversions, convRate };
  }, [codes]);

  const utilisation = 72; // % capacity utilised this quarter
  const quoteSLA = 56; // % within 4h target
  const repeatBookings = 38; // % from returning clients

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        eyebrow="Union Station · Administrator"
        title="Lydia's command centre"
        description="A single view of everything keeping Union Station the most-booked corporate venue in Johannesburg — bookings, lead capture, growth and the gaps to close."
        actions={
          <>
            <Button asChild variant="outline" size="sm" className="gap-1.5"><Link to="/union-station"><Landmark className="size-3.5" />Booking workflow</Link></Button>
            <Button size="sm" className="gap-1.5"><Sparkles className="size-4" />Weekly briefing</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Confirmed revenue" value={formatZAR(stats.revenueConfirmed)} delta="▲ 24% QoQ" accent="success" hint="Q3 to date" />
        <StatCard label="Pipeline value" value={formatZAR(stats.pipelineValue)} delta={`${stats.pipeline} open requests`} accent="brand" />
        <StatCard label="Leads captured" value={formatInt(stats.leadsCaptured)} delta={`+${codes[0].leadsCaptured} from Investec Gala`} accent="brand" hint="via QR check-in" />
        <StatCard label="Lead → Sale" value={`${stats.convRate}%`} delta={`${stats.conversions} converted`} accent="success" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card-soft p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-semibold">Growth — revenue &amp; events</h3>
              <p className="text-xs text-muted-foreground">6-month trajectory · Union Station only</p>
            </div>
            <Badge variant="secondary" className="gap-1"><TrendingUp className="size-3" />On track</Badge>
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={monthly} margin={{ left: -10, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="usrev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.5 0.08 195)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="oklch(0.5 0.08 195)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 95)" />
                <XAxis dataKey="m" tick={{ fontSize: 11, fill: "oklch(0.5 0.02 260)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "oklch(0.5 0.02 260)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid oklch(0.92 0.008 95)", fontSize: 12 }} />
                <Area type="monotone" dataKey="rev" stroke="oklch(0.5 0.08 195)" strokeWidth={2.5} fill="url(#usrev)" name="Revenue (R m)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card-soft p-5">
          <h3 className="font-display font-semibold mb-1">Operational health</h3>
          <p className="text-xs text-muted-foreground mb-4">Targets vs actuals</p>
          <Bar2 label="Capacity utilisation" value={utilisation} target={80} />
          <Bar2 label="Quote SLA (≤ 4h)" value={quoteSLA} target={90} />
          <Bar2 label="Repeat bookings" value={repeatBookings} target={45} />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-6">
        <div className="card-soft p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-semibold flex items-center gap-2"><QrCode className="size-4 text-brand" /> Lead capture by event</h3>
              <p className="text-xs text-muted-foreground">QR check-ins at Union Station · last 90 days</p>
            </div>
            <Button asChild variant="ghost" size="sm" className="gap-1"><Link to="/union-station">Manage codes <ArrowUpRight className="size-3.5" /></Link></Button>
          </div>
          <div className="h-52 mb-4">
            <ResponsiveContainer>
              <BarChart data={codes.map(e => ({ name: e.title.split(" ").slice(0, 2).join(" "), captured: e.leadsCaptured, expected: e.attendeesExpected }))} margin={{ left: -10, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 95)" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "oklch(0.5 0.02 260)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "oklch(0.5 0.02 260)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid oklch(0.92 0.008 95)", fontSize: 12 }} />
                <Bar dataKey="expected" fill="oklch(0.92 0.008 95)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="captured" fill="oklch(0.5 0.08 195)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead className="text-right">Expected</TableHead>
                <TableHead className="text-right">Captured</TableHead>
                <TableHead className="text-right">Capture %</TableHead>
                <TableHead className="text-right">→ Sales</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.map(e => {
                const cap = e.attendeesExpected > 0 ? Math.round((e.leadsCaptured / e.attendeesExpected) * 100) : 0;
                return (
                  <TableRow key={e.code}>
                    <TableCell>
                      <div className="text-sm font-medium">{e.title}</div>
                      <div className="text-[11px] text-muted-foreground">{e.date} · {e.client}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatInt(e.attendeesExpected)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatInt(e.leadsCaptured)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className={cap >= 80 ? "text-success border-success/30" : cap >= 50 ? "text-brand border-brand/30" : "text-muted-foreground"}>{cap}%</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{e.conversionsToSales}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="card-soft p-5">
          <h3 className="font-display font-semibold flex items-center gap-2 mb-1"><AlertTriangle className="size-4 text-warning" /> Gaps to close</h3>
          <p className="text-xs text-muted-foreground mb-3">Where we're losing revenue or efficiency</p>
          <div className="space-y-2.5">
            {gaps.map((g, i) => (
              <div key={i} className="rounded-md border p-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">{g.t}</div>
                  <Badge variant="outline" className={g.sev === "high" ? "text-destructive border-destructive/30" : "text-warning border-warning/30"}>{g.sev === "high" ? "High" : "Medium"}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{g.d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─────────── QR generator ─────────── */}
      <QrGenerator codes={codes} onAdd={(c) => setCodes(prev => [c, ...prev])} />

      {/* ─────────── Conversion analytics ─────────── */}
      <ConversionAnalytics />

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card-soft p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-display font-semibold flex items-center gap-2"><Users className="size-4 text-brand" /> Recent leads captured</h3>
              <p className="text-xs text-muted-foreground">Auto-routed to Samantha for qualification</p>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Event</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eventLeadsSample.map(l => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.fullName}</TableCell>
                  <TableCell className="text-sm">{l.email}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{l.phone ?? "—"}</TableCell>
                  <TableCell className="text-[11px]">{l.eventCode}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline" className={l.status === "Converted" ? "text-success border-success/30" : l.status === "Qualified" ? "text-brand border-brand/30" : ""}>{l.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="card-soft p-5">
          <h3 className="font-display font-semibold flex items-center gap-2 mb-1"><Target className="size-4 text-brand" /> Critical to oversee</h3>
          <p className="text-xs text-muted-foreground mb-3">Lydia's daily watchlist</p>
          <div className="space-y-2">
            <Watch icon={Clock} title="3 quotes past SLA" hint="Allan Gray, Discovery, TechCabal" tone="warn" />
            <Watch icon={Users} title="287 leads from Investec Gala" hint="14 converted · 60 awaiting outreach" tone="brand" />
            <Watch icon={Landmark} title="Heritage Hall maintenance" hint="Scheduled Aug 8 · blocks 1 day" tone="muted" />
            <Watch icon={TrendingUp} title="Q3 pacing 124% to target" hint="On track to set venue record" tone="success" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Bar2({ label, value, target }: { label: string; value: number; target: number }) {
  const hit = value >= target;
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between text-xs mb-1">
        <span>{label}</span>
        <span className={hit ? "text-success" : "text-muted-foreground"}>{value}% <span className="text-muted-foreground">/ {target}%</span></span>
      </div>
      <Progress value={value} className="h-1.5" />
    </div>
  );
}

function Watch({ icon: Icon, title, hint, tone }: { icon: React.ComponentType<{ className?: string }>; title: string; hint: string; tone: "warn" | "brand" | "success" | "muted" }) {
  const c = tone === "warn" ? "text-warning bg-warning/15" : tone === "brand" ? "text-brand bg-brand-soft" : tone === "success" ? "text-success bg-success/15" : "text-muted-foreground bg-muted";
  return (
    <div className="flex items-start gap-2.5 rounded-md border p-3 bg-card">
      <div className={`grid size-8 place-items-center rounded-md shrink-0 ${c}`}><Icon className="size-4" /></div>
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
    </div>
  );
}

// ─────────────────────── QR Generator ───────────────────────

function QrGenerator({ codes, onAdd }: { codes: EventAccessCode[]; onAdd: (c: EventAccessCode) => void }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://workspace.officeandco.co.za";
  const [form, setForm] = useState({ title: "", client: "", date: "", attendees: 100, code: "" });
  const [preview, setPreview] = useState<EventAccessCode | null>(null);

  const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 16);

  const create = () => {
    if (!form.title || !form.date) { toast.error("Title and date are required"); return; }
    const code = form.code ? slug(form.code) : `${slug(form.title.split(" ").slice(0, 2).join(" "))}-${new Date(form.date).getFullYear().toString().slice(-2)}`;
    if (codes.some(c => c.code === code)) { toast.error("Code already exists — choose another"); return; }
    const c: EventAccessCode = {
      code, eventId: `US-${Date.now().toString().slice(-6)}`, title: form.title, date: form.date,
      client: form.client || "TBC", attendeesExpected: form.attendees, leadsCaptured: 0, conversionsToSales: 0, active: true,
    };
    onAdd(c); setPreview(c);
    setForm({ title: "", client: "", date: "", attendees: 100, code: "" });
    toast.success(`QR code ${code} generated`);
  };

  const qrUrl = (code: string, size = 220) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=8&data=${encodeURIComponent(`${origin}/checkin/${code}`)}`;

  const copy = (t: string) => { navigator?.clipboard?.writeText(t); toast.success("Copied"); };
  const mailto = (c: EventAccessCode) => {
    const url = `${origin}/checkin/${c.code}`;
    const subject = encodeURIComponent(`Your check-in link — ${c.title}`);
    const body = encodeURIComponent(`Hi,\n\nOn arrival at Union Station, please scan the QR at the entrance or open this link to check in:\n\n${url}\n\nSee you at ${c.title} on ${c.date}.\n\n— Office & Co · Union Station`);
    return `mailto:?subject=${subject}&body=${body}`;
  };

  return (
    <div className="card-soft p-5 mb-6">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <h3 className="font-display font-semibold flex items-center gap-2"><QrCode className="size-4 text-brand" /> QR code generator</h3>
          <p className="text-xs text-muted-foreground">Create unique check-in codes for every event — download for signage, copy for emails.</p>
        </div>
        <Badge variant="outline" className="text-[10px]">{codes.length} codes live</Badge>
      </div>

      <div className="grid lg:grid-cols-[1fr_260px] gap-5">
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5 sm:col-span-2"><Label>Event title</Label>
            <Input placeholder="e.g. Discovery Product Summit 2026" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Client</Label>
            <Input placeholder="Discovery Health" value={form.client} onChange={e => setForm({ ...form, client: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Date</Label>
            <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Expected attendees</Label>
            <Input type="number" min={1} value={form.attendees} onChange={e => setForm({ ...form, attendees: Number(e.target.value) })} /></div>
          <div className="space-y-1.5"><Label>Custom code <span className="text-[10px] text-muted-foreground">(optional)</span></Label>
            <Input placeholder="Auto-generated if empty" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></div>
          <div className="sm:col-span-2 flex gap-2 pt-1">
            <Button onClick={create} className="gap-1.5"><Plus className="size-4" />Generate QR</Button>
            <Button variant="outline" onClick={() => setForm({ title: "", client: "", date: "", attendees: 100, code: "" })}>Reset</Button>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-4 text-center">
          {preview ? (
            <>
              <img src={qrUrl(preview.code, 200)} alt={`QR for ${preview.title}`} width={200} height={200} className="mx-auto rounded bg-white p-2" />
              <div className="mt-2 text-sm font-semibold truncate">{preview.title}</div>
              <div className="text-[11px] text-muted-foreground font-mono">{preview.code}</div>
              <div className="mt-3 grid grid-cols-3 gap-1">
                <Button asChild size="sm" variant="outline" className="h-8 text-[11px] gap-1"><a href={qrUrl(preview.code, 800)} download={`qr-${preview.code}.png`} target="_blank" rel="noreferrer"><Download className="size-3" />PNG</a></Button>
                <Button size="sm" variant="outline" className="h-8 text-[11px] gap-1" onClick={() => copy(`${origin}/checkin/${preview.code}`)}><Copy className="size-3" />Link</Button>
                <Button asChild size="sm" variant="outline" className="h-8 text-[11px] gap-1"><a href={mailto(preview)}><Mail className="size-3" />Email</a></Button>
              </div>
            </>
          ) : (
            <div className="grid place-items-center h-full py-10 text-xs text-muted-foreground">
              <div>
                <QrCode className="size-8 mx-auto opacity-40 mb-2" />
                Preview appears here after generation
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Existing codes — export panel */}
      <div className="mt-5 border-t pt-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">All active event codes — export for signage &amp; emails</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {codes.map(c => (
            <div key={c.code} className="rounded-lg border bg-card p-3 flex gap-3">
              <img src={qrUrl(c.code, 120)} alt={c.code} width={80} height={80} className="rounded bg-white p-1.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold truncate">{c.title}</div>
                <div className="text-[10px] text-muted-foreground">{c.date} · {c.client}</div>
                <div className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">{c.code}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Button asChild size="icon" variant="ghost" className="size-6"><a href={qrUrl(c.code, 800)} download={`qr-${c.code}.png`} target="_blank" rel="noreferrer"><Download className="size-3" /></a></Button>
                  <Button size="icon" variant="ghost" className="size-6" onClick={() => copy(`${origin}/checkin/${c.code}`)}><Copy className="size-3" /></Button>
                  <Button asChild size="icon" variant="ghost" className="size-6"><a href={mailto(c)}><Mail className="size-3" /></a></Button>
                  <Button size="icon" variant="ghost" className="size-6" onClick={() => window.open(qrUrl(c.code, 800), "_blank")?.print()}><Printer className="size-3" /></Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── Conversion analytics ───────────────────────

function ConversionAnalytics() {
  const totals = conversionByEvent.reduce((acc, r) => ({
    checkIns: acc.checkIns + r.checkIns, leads: acc.leads + r.leads, tours: acc.tours + r.tours, contracts: acc.contracts + r.contracts,
  }), { checkIns: 0, leads: 0, tours: 0, contracts: 0 });
  const leadRate = totals.checkIns ? Math.round((totals.leads / totals.checkIns) * 100) : 0;
  const tourRate = totals.leads ? Math.round((totals.tours / totals.leads) * 100) : 0;
  const contractRate = totals.tours ? Math.round((totals.contracts / totals.tours) * 100) : 0;

  return (
    <div className="card-soft p-5 mb-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h3 className="font-display font-semibold flex items-center gap-2"><TrendingUp className="size-4 text-brand" /> Conversion analytics</h3>
          <p className="text-xs text-muted-foreground">Check-in → Lead → Tour → Contract, by branch and event.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <Badge variant="outline" className="text-brand border-brand/30">Lead rate {leadRate}%</Badge>
          <Badge variant="outline" className="text-brand border-brand/30">Tour rate {tourRate}%</Badge>
          <Badge variant="outline" className="text-success border-success/30">Contract rate {contractRate}%</Badge>
        </div>
      </div>

      {/* Funnel summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <FunnelStat label="Check-ins" value={totals.checkIns} tone="muted" />
        <FunnelStat label="Leads created" value={totals.leads} tone="brand" pct={leadRate} of="check-ins" />
        <FunnelStat label="Tour bookings" value={totals.tours} tone="brand" pct={tourRate} of="leads" />
        <FunnelStat label="Contracts signed" value={totals.contracts} tone="success" pct={contractRate} of="tours" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* By branch chart */}
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">By branch</div>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={conversionByBranch} margin={{ left: -10, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 95)" />
                <XAxis dataKey="branch" tick={{ fontSize: 10, fill: "oklch(0.5 0.02 260)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "oklch(0.5 0.02 260)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid oklch(0.92 0.008 95)", fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="checkIns" name="Check-ins" fill="oklch(0.86 0.02 260)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="leads" name="Leads" fill="oklch(0.55 0.14 260)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="tours" name="Tours" fill="oklch(0.5 0.08 195)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="contracts" name="Contracts" fill="oklch(0.55 0.14 155)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* By event table */}
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">By event</div>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead className="text-right">Check-ins</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Tours</TableHead>
                  <TableHead className="text-right">Contracts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {conversionByEvent.map(r => (
                  <TableRow key={r.eventCode}>
                    <TableCell>
                      <div className="text-sm font-medium truncate max-w-[180px]">{r.event}</div>
                      <div className="text-[10px] text-muted-foreground">{r.branch}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatInt(r.checkIns)}</TableCell>
                    <TableCell className="text-right tabular-nums text-brand">{formatInt(r.leads)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.tours}</TableCell>
                    <TableCell className="text-right tabular-nums text-success font-semibold">{r.contracts}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}

function FunnelStat({ label, value, tone, pct, of }: { label: string; value: number; tone: "brand" | "success" | "muted"; pct?: number; of?: string }) {
  const c = tone === "brand" ? "text-brand" : tone === "success" ? "text-success" : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`font-display text-2xl font-semibold tabular-nums mt-1 ${c}`}>{formatInt(value)}</div>
      {typeof pct === "number" && <div className="text-[11px] text-muted-foreground mt-0.5">{pct}% of {of}</div>}
    </div>
  );
}
