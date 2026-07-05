import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { branches, revenueTrend, leads, communityPosts, communityEngagement, formatZAR, formatInt, tenants, invoices, cafeOrders, tickets, spaces, events, loadInvoices, type Invoice } from "@/lib/mock";
import { useRole } from "@/lib/role-context";
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
  BarChart, Bar, Line, LineChart,
} from "recharts";
import { ArrowUpRight, Sparkles, Building2, TrendingUp, Activity, MapPin, Users, UserPlus, Heart, CalendarDays, ReceiptText, Coffee, LifeBuoy, BellRing } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Executive Overview — Office & Co WorkspaceOS" },
      { name: "description", content: "Group-wide revenue, occupancy, pipeline and community signals across every Office & Co branch." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { role, showCommunity } = useRole();
  const live = branches.filter(b => b.status === "live");
  const planned = branches.filter(b => b.status === "planned");
  const totalRevenue = live.reduce((s, b) => s + b.revenue, 0);
  const avgOcc = live.reduce((s, b) => s + b.occupancy, 0) / live.length;
  const firstName = role.user.split(" ")[0];
  const isManagementDashboard = ["group-ceo", "sales-manager", "branch-manager", "community-manager", "lydia-admin"].includes(role.id);
  const isTenantDashboard = role.id === "tenant-admin";
  const showCommunityCard = isManagementDashboard && (role.id !== "group-ceo" || showCommunity);
  const [greetingState, setGreetingState] = useState({ dateLabel: "Today", greeting: "Good morning" });
  const [tenantInvoiceRows, setTenantInvoiceRows] = useState<Invoice[]>([]);
  useEffect(() => {
    const currentDate = new Date();
    const dateLabel = new Intl.DateTimeFormat("en", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Africa/Johannesburg",
    }).format(currentDate);
    const hour = currentDate.getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    setGreetingState({ dateLabel, greeting });
  }, []);
  const tenantAccount = tenants.find((tenant) => tenant.name === "Tundra Capital");
  useEffect(() => {
    setTenantInvoiceRows(loadInvoices().filter((invoice) => invoice.tenant === tenantAccount?.name));
  }, [tenantAccount?.name]);
  const tenantInvoices = tenantInvoiceRows.length > 0 ? tenantInvoiceRows : invoices.filter((invoice) => invoice.tenant === tenantAccount?.name);
  const tenantCafeOrders = cafeOrders.filter((order) => order.tenant === tenantAccount?.name);
  const tenantTickets = tickets.filter((ticket) => ticket.tenant === tenantAccount?.name);
  const branchSpaces = spaces.filter((space) => space.branch === tenantAccount?.branch);
  const activeBranchSpaces = branchSpaces.filter((space) => ["Booked", "In Use"].includes(space.status));
  const nextEvent = events.find((event) => event.branch === tenantAccount?.branch);
  const lastInvoice = tenantInvoices[0];

  return (
    <div className="mx-auto max-w-350">
      <PageHeader
        eyebrow={`${role.title} · ${greetingState.dateLabel}`}
        title={`${greetingState.greeting}, ${firstName}.`}
        description={isManagementDashboard
          ? `${live.length} live branches across Kyalami, Bryanston, Rosebank and Union Station — with ${planned.length} new locations in the pipeline. Here's how the group is performing today.`
          : "Use the navigation to access bookings, café orders, feed updates and invoices for your branch."}
        actions={isManagementDashboard ? (
          <>
            <Button variant="outline" size="sm">Last 30 days</Button>
            <Button size="sm" className="gap-1.5"><Sparkles className="size-4" /> Ask WorkspaceOS</Button>
          </>
        ) : null}
      />

      {!isManagementDashboard && (
        <div className="space-y-4">
          {!isTenantDashboard ? (
            <div className="card-soft p-5">
              <h3 className="font-display font-semibold">Your workspace</h3>
              <p className="mt-2 text-sm text-muted-foreground">Everything you need for your branch is available in the app navigation — from bookings and café orders to feed updates and billing.</p>
            </div>
          ) : (
            <>
              <div className="card-soft p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="font-display font-semibold">Your workspace overview</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Here’s a quick view of what matters for {tenantAccount?.name} at {tenantAccount?.branch} this week.</p>
                  </div>
                  <Badge variant="secondary" className="w-fit">{tenantAccount?.plan}</Badge>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CalendarDays className="size-4 text-brand" />
                      Bookings & spaces
                    </div>
                    <div className="mt-3 text-2xl font-display font-semibold">{activeBranchSpaces.length}</div>
                    <p className="mt-1 text-sm text-muted-foreground">Rooms or spaces currently booked or in use</p>
                  </div>

                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ReceiptText className="size-4 text-brand" />
                      Billing
                    </div>
                    <div className="mt-3 text-2xl font-display font-semibold">{lastInvoice ? formatZAR(lastInvoice.amount) : "—"}</div>
                    <p className="mt-1 text-sm text-muted-foreground">Latest invoice · {lastInvoice?.status ?? "No recent invoice"}</p>
                  </div>

                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Coffee className="size-4 text-brand" />
                      Café activity
                    </div>
                    <div className="mt-3 text-2xl font-display font-semibold">{tenantCafeOrders.length}</div>
                    <p className="mt-1 text-sm text-muted-foreground">Recent café orders for your account</p>
                  </div>

                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <LifeBuoy className="size-4 text-brand" />
                      Support
                    </div>
                    <div className="mt-3 text-2xl font-display font-semibold">{tenantTickets.length}</div>
                    <p className="mt-1 text-sm text-muted-foreground">Open or recent support requests</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                <div className="card-soft p-5">
                  <div className="flex items-center gap-2">
                    <BellRing className="size-4 text-brand" />
                    <h3 className="font-display font-semibold">What needs attention</h3>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <div className="text-sm font-medium">Latest invoice</div>
                      <div className="mt-1 flex items-center justify-between text-sm text-muted-foreground">
                        <span>{lastInvoice?.id ?? "No recent invoice"}</span>
                        <span>{lastInvoice ? lastInvoice.status : "—"}</span>
                      </div>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <div className="text-sm font-medium">Branch activity</div>
                      <div className="mt-1 text-sm text-muted-foreground">{tenantAccount?.members ?? 0} members on your account · {branchSpaces.length} spaces tracked</div>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <div className="text-sm font-medium">Latest café order</div>
                      <div className="mt-1 text-sm text-muted-foreground">{tenantCafeOrders[0]?.item ?? "No recent orders"} · {tenantCafeOrders[0]?.status ?? "—"}</div>
                    </div>
                  </div>
                </div>

                <div className="card-soft p-5">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-brand" />
                    <h3 className="font-display font-semibold">Next up for your branch</h3>
                  </div>
                  <div className="mt-4 rounded-lg border bg-muted/20 p-4">
                    <div className="text-sm font-medium">{nextEvent?.title ?? "No upcoming branch event"}</div>
                    <div className="mt-2 text-sm text-muted-foreground">{nextEvent ? `${nextEvent.date} · ${nextEvent.branch}` : "Your calendar is quiet right now."}</div>
                    {nextEvent ? <div className="mt-3 text-sm text-muted-foreground">{nextEvent.rsvp} RSVPs · Capacity {nextEvent.capacity}</div> : null}
                  </div>
                  <div className="mt-3 rounded-lg border bg-muted/20 p-4">
                    <div className="text-sm font-medium">Tenant account</div>
                    <div className="mt-2 text-sm text-muted-foreground">Plan: {tenantAccount?.plan ?? "—"}</div>
                    <div className="mt-1 text-sm text-muted-foreground">Health: {tenantAccount?.health ?? "—"}</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {isManagementDashboard && (
        <div className="hidden md:block">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard label="Monthly revenue" value={formatZAR(totalRevenue)} delta="▲ 12.4% MoM" accent="success" hint="Target: R7.0M" />
            <StatCard label="Group occupancy" value={`${Math.round(avgOcc * 100)}%`} delta="▲ 3.1pts" accent="success" hint={`${live.length} branches live`} />
            <StatCard label="Active tenants" value="142" delta="+9 this month" accent="brand" hint="3 at risk" />
            <StatCard label="Pipeline value" value={formatZAR(4_180_000)} delta="42 open deals · Samantha" accent="brand" hint="6 in negotiation" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="card-soft p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-semibold">Revenue vs target</h3>
              <p className="text-xs text-muted-foreground">Monthly recurring across all branches (ZAR, millions)</p>
            </div>
            <Badge variant="secondary" className="gap-1"><TrendingUp className="size-3" /> Ahead of plan</Badge>
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={revenueTrend} margin={{ left: -10, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.5 0.08 195)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="oklch(0.5 0.08 195)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 95)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "oklch(0.5 0.02 260)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "oklch(0.5 0.02 260)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid oklch(0.92 0.008 95)", fontSize: 12 }} />
                <Area type="monotone" dataKey="target" stroke="oklch(0.78 0 0)" strokeDasharray="4 4" fill="transparent" />
                <Area type="monotone" dataKey="revenue" stroke="oklch(0.5 0.08 195)" strokeWidth={2.5} fill="url(#rev)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

            <div className="card-soft p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display font-semibold">Branch occupancy</h3>
                <Activity className="size-4 text-muted-foreground" />
              </div>
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={live.map(b => ({ name: b.name, occ: Math.round(b.occupancy * 100) }))} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <XAxis type="number" hide domain={[0, 100]} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11, fill: "oklch(0.4 0.02 260)" }} axisLine={false} tickLine={false} width={88} />
                    <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid oklch(0.92 0.008 95)", fontSize: 12 }} formatter={(v) => `${v}%`} />
                    <Bar dataKey="occ" fill="oklch(0.5 0.08 195)" radius={[0, 6, 6, 0]} barSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Community engagement card — respects CEO toggle */}
          {showCommunityCard && (
        <div className="card-soft p-5 mb-6 animate-in fade-in slide-in-from-top-1 duration-500">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display font-semibold flex items-center gap-2"><Heart className="size-4 text-brand" /> Feed engagement</h3>
              <p className="text-xs text-muted-foreground">Live signal across all branches · last 7 days</p>
            </div>
            <Button asChild variant="ghost" size="sm" className="gap-1"><Link to="/community">Open feed <ArrowUpRight className="size-3.5" /></Link></Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <EngStat icon={Users} label="Active members" value={formatInt(communityEngagement.activeMembers)} hint={`Top branch · ${communityEngagement.topBranch}`} />
            <EngStat icon={UserPlus} label="New this week" value={`+${communityEngagement.newThisWeek}`} hint="onboarded across branches" />
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="text-xs text-muted-foreground">Engagement level</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-2xl font-semibold">{communityEngagement.engagementRate}%</span>
                <span className="text-xs text-success">▲ 4pts</span>
              </div>
              <div className="h-10 mt-1.5">
                <ResponsiveContainer>
                  <LineChart data={communityEngagement.sparkline.map((v, i) => ({ i, v }))}>
                    <Line type="monotone" dataKey="v" stroke="oklch(0.5 0.08 195)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="text-xs text-muted-foreground">Top contributing branch</div>
              <div className="font-display text-xl font-semibold mt-1">{communityEngagement.topBranch}</div>
              <div className="text-xs text-muted-foreground mt-2">412 reactions · 84 posts · 11 events RSVP'd</div>
            </div>
          </div>
        </div>
      )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="card-soft p-5 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display font-semibold">Branch performance</h3>
                  <p className="text-xs text-muted-foreground">Live snapshot · refreshed 2 min ago</p>
                </div>
                <Button variant="ghost" size="sm" className="gap-1">View all <ArrowUpRight className="size-3.5" /></Button>
              </div>
              <div className="divide-y">
                {live.map((b) => (
                  <div key={b.id} className="grid grid-cols-12 items-center gap-3 py-3">
                    <div className="col-span-4 flex items-center gap-2.5">
                      <div className="grid size-8 place-items-center rounded-md bg-brand-soft text-brand"><Building2 className="size-4" /></div>
                      <div className="leading-tight">
                        <div className="text-sm font-medium">{b.name}</div>
                        <div className="text-[11px] text-muted-foreground">{b.city} · {b.region}</div>
                      </div>
                    </div>
                    <div className="col-span-4">
                      <div className="flex items-center justify-between mb-1 text-[11px] text-muted-foreground">
                        <span>Occupancy</span><span>{Math.round(b.occupancy * 100)}%</span>
                      </div>
                      <Progress value={b.occupancy * 100} className="h-1.5" />
                    </div>
                    <div className="col-span-3 text-right">
                      <div className="text-sm font-medium tabular-nums">{formatZAR(b.revenue)}</div>
                      <div className="text-[11px] text-muted-foreground">MRR</div>
                    </div>
                    <div className="col-span-1 text-right">
                      <Badge variant={b.occupancy > 0.85 ? "default" : "secondary"} className="text-[10px]">
                        {b.occupancy > 0.85 ? "Strong" : "Steady"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card-soft p-5">
              <h3 className="font-display font-semibold mb-1">Hottest deals</h3>
              <p className="text-xs text-muted-foreground mb-3">AI-scored prospects · Samantha N.</p>
              <div className="space-y-3">
                {leads.filter(l => l.score > 80).slice(0, 4).map((l) => (
                  <div key={l.id} className="flex items-start justify-between gap-2 border-b pb-3 last:border-0 last:pb-0">
                    <div className="leading-tight">
                      <div className="text-sm font-medium">{l.company}</div>
                      <div className="text-[11px] text-muted-foreground">{l.stage} · {l.branch}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm tabular-nums">{formatZAR(l.value)}</div>
                      <Badge variant="secondary" className="text-[10px]">Score {l.score}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="card-soft p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display font-semibold">Expansion pipeline</h3>
                  <p className="text-xs text-muted-foreground">New cities & branches</p>
                </div>
                <MapPin className="size-4 text-muted-foreground" />
              </div>
              <div className="space-y-2.5">
                {planned.map((b) => (
                  <div key={b.id} className="flex items-start justify-between gap-2 rounded-lg border bg-muted/30 p-3">
                    <div className="leading-tight">
                      <div className="text-sm font-medium">{b.name}</div>
                      <div className="text-[11px] text-muted-foreground">{b.city} · {b.region}</div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">Planned</Badge>
                  </div>
                ))}
              </div>
            </div>

            {showCommunityCard && (
              <div className="card-soft p-5 lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-display font-semibold">Feed pulse</h3>
                    <p className="text-xs text-muted-foreground">Latest activity across all branches</p>
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  {communityPosts.slice(0, 4).map((p) => (
                    <div key={p.id} className="rounded-lg border p-3.5 bg-muted/20">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="text-sm font-medium">{p.author}</div>
                        <Badge variant="outline" className="text-[10px]">{p.kind}</Badge>
                      </div>
                      <p className="text-sm text-foreground/85">{p.body}</p>
                      <div className="mt-2 text-[11px] text-muted-foreground">{p.reactions} reactions · {p.comments} comments · {p.time}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EngStat({ icon: Icon, label, value, hint }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="size-3.5" />{label}</div>
      <div className="font-display text-2xl font-semibold mt-1">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}
