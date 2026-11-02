import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  branches,
  revenueTrend,
  leads,
  communityPosts,
  communityEngagement,
  formatZAR,
  formatInt,
  invoices,
  cafeOrders,
  tickets,
  spaces,
  events,
  loadInvoices,
  type Invoice,
} from "@/lib/mock";
import { useRole } from "@/lib/role-context";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  Line,
  LineChart,
} from "recharts";
import {
  ArrowUpRight,
  Sparkles,
  Building2,
  TrendingUp,
  Activity,
  MapPin,
  Users,
  UserPlus,
  Heart,
  CalendarDays,
  ReceiptText,
  Coffee,
  LifeBuoy,
  BellRing,
  Wallet,
  ShieldCheck,
  Landmark,
  LoaderCircle,
  ShoppingBag,
  UserRound,
} from "lucide-react";
import { ProductionFinanceAPI } from "@/components/finance/ProductionFinanceAPI";
import { RoleOperationsDashboard } from "@/components/RoleOperationsDashboard";
import { FinancialOverviewDashboard } from "@/components/FinancialOverviewDashboard";
import { getSupabaseClient } from "@/lib/supabase";
import { GroupExecutiveDashboard } from "@/components/GroupExecutiveDashboard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Executive Overview — Office & Co WorkspaceOS" },
      {
        name: "description",
        content:
          "Group-wide revenue, occupancy, pipeline and community signals across every Office & Co branch.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { role, showCommunity, canSeeRevenue, canSeeInvoiceStatus } = useRole();
  const live = branches.filter((b) => b.status === "live");
  const planned = branches.filter((b) => b.status === "planned");
  const totalRevenue = live.reduce((s, b) => s + b.revenue, 0);
  const avgOcc = live.reduce((s, b) => s + b.occupancy, 0) / live.length;
  const firstName = role.user.split(" ")[0];
  const isFinanceDashboard = role.id === "finance";
  const isManagementDashboard = [
    "group-ceo",
    "sales-manager",
    "branch-manager",
    "community-manager",
    "lydia-admin",
    "finance",
  ].includes(role.id);
  const isTenantDashboard = role.id === "tenant-admin";
  const isOrganizationDashboard =
    role.id === "organization-admin" || role.id === "organization-member";
  const showCommunityCard = isManagementDashboard && (role.id !== "group-ceo" || showCommunity);
  const financeCollections = Math.round(totalRevenue * 0.82);
  const financeReceivables = Math.round(totalRevenue * 0.18);
  const financeExpenseRunrate = Math.round(totalRevenue * 0.61);
  const [greetingState, setGreetingState] = useState({
    dateLabel: "Today",
    greeting: "Good morning",
  });
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
  const tenantAccount = role.tenant
    ? {
        name: role.tenant,
        branch: role.branch ?? "",
        plan: "Registered organization",
        members: 0,
        health: "Registered",
      }
    : null;
  useEffect(() => {
    setTenantInvoiceRows(
      loadInvoices().filter((invoice) => invoice.tenant === tenantAccount?.name),
    );
  }, [tenantAccount?.name]);
  const tenantInvoices =
    tenantInvoiceRows.length > 0
      ? tenantInvoiceRows
      : invoices.filter((invoice) => invoice.tenant === tenantAccount?.name);
  const tenantCafeOrders = cafeOrders.filter((order) => order.tenant === tenantAccount?.name);
  const tenantTickets = tickets.filter((ticket) => ticket.tenant === tenantAccount?.name);
  const branchSpaces = spaces.filter((space) => space.branch === tenantAccount?.branch);
  const activeBranchSpaces = branchSpaces.filter((space) =>
    ["Booked", "In Use"].includes(space.status),
  );
  const nextEvent = events.find((event) => event.branch === tenantAccount?.branch);
  const lastInvoice = tenantInvoices[0];

  if (isOrganizationDashboard) {
    return <OrganizationOverview greetingState={greetingState} firstName={firstName} />;
  }
  if (role.id === "group-ceo") {
    return <GroupExecutiveDashboard role={role} />;
  }
  if (["superadmin", "group-admin", "finance"].includes(role.id)) {
    return <FinancialOverviewDashboard role={role} />;
  }
  if (["crm-manager", "sales-manager"].includes(role.id)) {
    return <SalesManagerOverview greetingState={greetingState} firstName={firstName} />;
  }
  if (["branch-manager", "cafe-manager", "rosebank-sales", "community-manager", "lydia-admin"].includes(role.id)) {
    return (
      <RoleOperationsDashboard
        role={role}
        greetingState={greetingState}
        firstName={firstName}
      />
    );
  }

  return (
    <div className="mx-auto max-w-350">
      <PageHeader
        eyebrow={`${isOrganizationDashboard ? `${role.tenant ?? "Organization"} · ${role.branch ?? "Branch"}` : role.title} · ${greetingState.dateLabel}`}
        title={`${greetingState.greeting}, ${firstName}.`}
        description={
          isFinanceDashboard
            ? "Cash flow, collections, billing health and month-end controls for Office & Co's finance function. This view tracks branch revenue from memberships, café sales, events and operational billing to support Vijeshna as Finance Lead and CFO-style decision-maker."
            : isManagementDashboard
              ? `${live.length} live branches across Kyalami, Bryanston, Rosebank and Union Station — with ${planned.length} new locations in the pipeline. Here's how the group is performing today.`
              : isOrganizationDashboard
                ? `Welcome to ${role.tenant ?? "your organization"}. Your WorkspaceOS access is set up for ${role.branch ?? "your Office & Co branch"}. Use the Account menu to copy and share your organization invite code with teammates.`
                : "Use the navigation to access bookings, café orders, feed updates and invoices for your branch."
        }
        actions={
          isFinanceDashboard ? (
            <>
              <Badge variant="outline" className="gap-1">
                <ShieldCheck className="size-3.5" /> Sage sync ready
              </Badge>
              <Button size="sm" className="gap-1.5">
                <Sparkles className="size-4" /> Run close cycle
              </Button>
            </>
          ) : isManagementDashboard ? (
            <>
              <Button variant="outline" size="sm">
                Last 30 days
              </Button>
              <Button size="sm" className="gap-1.5">
                <Sparkles className="size-4" /> Ask WorkspaceOS
              </Button>
            </>
          ) : null
        }
      />

      {canSeeRevenue ? (
        <div className="hidden md:block">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="Monthly revenue"
              value={formatZAR(totalRevenue)}
              delta="▲ 12.4% MoM"
              accent="success"
              hint="Target: R7.0M"
            />
            <StatCard
              label="Group occupancy"
              value={`${Math.round(avgOcc * 100)}%`}
              delta="▲ 3.1pts"
              accent="success"
              hint={`${live.length} branches live`}
            />
            <StatCard
              label="Active tenants"
              value="142"
              delta="+9 this month"
              accent="brand"
              hint="3 at risk"
            />
            <StatCard
              label="Pipeline value"
              value={formatZAR(4_180_000)}
              delta="42 open deals · Samantha"
              accent="brand"
              hint="6 in negotiation"
            />
          </div>
        </div>
      ) : null}

      {!isManagementDashboard && (
        <div className="space-y-4">
          {!isTenantDashboard ? (
            <div className="card-soft p-5">
              <h3 className="font-display font-semibold">Your workspace</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Everything you need for your branch is available in the app navigation — from
                bookings and café orders to feed updates and billing.
              </p>
            </div>
          ) : (
            <>
              <div className="card-soft p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3 className="font-display font-semibold">Your workspace overview</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Here’s a quick view of what matters for {tenantAccount?.name} at{" "}
                      {tenantAccount?.branch} this week.
                    </p>
                  </div>
                  <Badge variant="secondary" className="w-fit">
                    {tenantAccount?.plan}
                  </Badge>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CalendarDays className="size-4 text-brand" />
                      Bookings & spaces
                    </div>
                    <div className="mt-3 text-2xl font-display font-semibold">
                      {activeBranchSpaces.length}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Rooms or spaces currently booked or in use
                    </p>
                  </div>

                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ReceiptText className="size-4 text-brand" />
                      Billing
                    </div>
                    <div className="mt-3 text-2xl font-display font-semibold">
                      {lastInvoice ? formatZAR(lastInvoice.amount) : "—"}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Latest invoice · {lastInvoice?.status ?? "No recent invoice"}
                    </p>
                  </div>

                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Coffee className="size-4 text-brand" />
                      Café activity
                    </div>
                    <div className="mt-3 text-2xl font-display font-semibold">
                      {tenantCafeOrders.length}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Recent café orders for your account
                    </p>
                  </div>

                  <div className="rounded-xl border bg-muted/20 p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <LifeBuoy className="size-4 text-brand" />
                      Support
                    </div>
                    <div className="mt-3 text-2xl font-display font-semibold">
                      {tenantTickets.length}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Open or recent support requests
                    </p>
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
                      <div className="mt-1 text-sm text-muted-foreground">
                        {tenantAccount?.members ?? 0} members on your account ·{" "}
                        {branchSpaces.length} spaces tracked
                      </div>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <div className="text-sm font-medium">Latest café order</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {tenantCafeOrders[0]?.item ?? "No recent orders"} ·{" "}
                        {tenantCafeOrders[0]?.status ?? "—"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card-soft p-5">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-brand" />
                    <h3 className="font-display font-semibold">Next up for your branch</h3>
                  </div>
                  <div className="mt-4 rounded-lg border bg-muted/20 p-4">
                    <div className="text-sm font-medium">
                      {nextEvent?.title ?? "No upcoming branch event"}
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      {nextEvent
                        ? `${nextEvent.date} · ${nextEvent.branch}`
                        : "Your calendar is quiet right now."}
                    </div>
                    {nextEvent ? (
                      <div className="mt-3 text-sm text-muted-foreground">
                        {nextEvent.rsvp} RSVPs · Capacity {nextEvent.capacity}
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-3 rounded-lg border bg-muted/20 p-4">
                    <div className="text-sm font-medium">Tenant account</div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      Plan: {tenantAccount?.plan ?? "—"}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Health: {tenantAccount?.health ?? "—"}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {isManagementDashboard &&
        (isFinanceDashboard ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard
                label="Cash collected"
                value={formatZAR(financeCollections)}
                delta="▲ 14.8% vs last month"
                accent="success"
                hint="Primary cash in"
              />
              <StatCard
                label="Receivables outstanding"
                value={formatZAR(financeReceivables)}
                delta="5 invoices aging"
                accent="warning"
                hint="Across active tenants"
              />
              <StatCard
                label="Expense run-rate"
                value={formatZAR(financeExpenseRunrate)}
                delta="Stable"
                accent="brand"
                hint="Operational burn"
              />
              <StatCard
                label="Month-end close"
                value="94%"
                delta="2 approvals pending"
                accent="brand"
                hint="Sage sync status"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-4 mb-6">
              <div className="card-soft p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-display font-semibold">Finance pulse</h3>
                    <p className="text-xs text-muted-foreground">
                      Collections and billing momentum across café, events and branch operations
                    </p>
                  </div>
                  <Badge variant="secondary" className="gap-1">
                    <TrendingUp className="size-3" /> Ahead of plan
                  </Badge>
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
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 11, fill: "oklch(0.5 0.02 260)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "oklch(0.5 0.02 260)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 10,
                          border: "1px solid oklch(0.92 0.008 95)",
                          fontSize: 12,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="target"
                        stroke="oklch(0.78 0 0)"
                        strokeDasharray="4 4"
                        fill="transparent"
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="oklch(0.5 0.08 195)"
                        strokeWidth={2.5}
                        fill="url(#rev)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="card-soft p-5">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-display font-semibold">Finance watchlist</h3>
                    <p className="text-xs text-muted-foreground">
                      Items Vijeshna should review today
                    </p>
                  </div>
                  <Wallet className="size-4 text-muted-foreground" />
                </div>
                <div className="space-y-3">
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-sm font-medium">Outstanding AR</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      R412k across 6 tenant accounts with due dates within the next 7 days.
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-sm font-medium">Sage readiness</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Invoices and payment mappings are ready for ERP sync once the accounting
                      integration is enabled.
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-sm font-medium">Month-end control</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Bank reconciliation and payments are complete for 94% of activity this cycle.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="card-soft p-5">
                <ProductionFinanceAPI />
              </div>
            </div>
          </div>
        ) : (
          <div className="hidden md:block">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <StatCard
                label="Monthly revenue"
                value={formatZAR(totalRevenue)}
                delta="▲ 12.4% MoM"
                accent="success"
                hint="Target: R7.0M"
              />
              <StatCard
                label="Group occupancy"
                value={`${Math.round(avgOcc * 100)}%`}
                delta="▲ 3.1pts"
                accent="success"
                hint={`${live.length} branches live`}
              />
              <StatCard
                label="Active tenants"
                value="142"
                delta="+9 this month"
                accent="brand"
                hint="3 at risk"
              />
              <StatCard
                label="Pipeline value"
                value={formatZAR(4_180_000)}
                delta="42 open deals · Samantha"
                accent="brand"
                hint="6 in negotiation"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              <div className="card-soft p-5 lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-display font-semibold">Revenue vs target</h3>
                    <p className="text-xs text-muted-foreground">
                      Revenue mix across memberships, café, events and branch operations (ZAR,
                      millions)
                    </p>
                  </div>
                  <Badge variant="secondary" className="gap-1">
                    <TrendingUp className="size-3" /> Ahead of plan
                  </Badge>
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
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 11, fill: "oklch(0.5 0.02 260)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "oklch(0.5 0.02 260)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 10,
                          border: "1px solid oklch(0.92 0.008 95)",
                          fontSize: 12,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="target"
                        stroke="oklch(0.78 0 0)"
                        strokeDasharray="4 4"
                        fill="transparent"
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="oklch(0.5 0.08 195)"
                        strokeWidth={2.5}
                        fill="url(#rev)"
                      />
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
                    <BarChart
                      data={live.map((b) => ({ name: b.name, occ: Math.round(b.occupancy * 100) }))}
                      layout="vertical"
                      margin={{ left: 8, right: 16 }}
                    >
                      <XAxis type="number" hide domain={[0, 100]} />
                      <YAxis
                        dataKey="name"
                        type="category"
                        tick={{ fontSize: 11, fill: "oklch(0.4 0.02 260)" }}
                        axisLine={false}
                        tickLine={false}
                        width={88}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 10,
                          border: "1px solid oklch(0.92 0.008 95)",
                          fontSize: 12,
                        }}
                        formatter={(v) => `${v}%`}
                      />
                      <Bar
                        dataKey="occ"
                        fill="oklch(0.5 0.08 195)"
                        radius={[0, 6, 6, 0]}
                        barSize={14}
                      />
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
                    <h3 className="font-display font-semibold flex items-center gap-2">
                      <Heart className="size-4 text-brand" /> Feed engagement
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Live signal across all branches · last 7 days
                    </p>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="gap-1">
                    <Link to="/community">
                      Open feed <ArrowUpRight className="size-3.5" />
                    </Link>
                  </Button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <EngStat
                    icon={Users}
                    label="Active members"
                    value={formatInt(communityEngagement.activeMembers)}
                    hint={`Top branch · ${communityEngagement.topBranch}`}
                  />
                  <EngStat
                    icon={UserPlus}
                    label="New this week"
                    value={`+${communityEngagement.newThisWeek}`}
                    hint="onboarded across branches"
                  />
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <div className="text-xs text-muted-foreground">Engagement level</div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="font-display text-2xl font-semibold">
                        {communityEngagement.engagementRate}%
                      </span>
                      <span className="text-xs text-success">▲ 4pts</span>
                    </div>
                    <div className="h-10 mt-1.5">
                      <ResponsiveContainer>
                        <LineChart data={communityEngagement.sparkline.map((v, i) => ({ i, v }))}>
                          <Line
                            type="monotone"
                            dataKey="v"
                            stroke="oklch(0.5 0.08 195)"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <div className="text-xs text-muted-foreground">Top contributing branch</div>
                    <div className="font-display text-xl font-semibold mt-1">
                      {communityEngagement.topBranch}
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      412 reactions · 84 posts · 11 events RSVP'd
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
              <div className="card-soft p-5 lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-display font-semibold">Branch performance</h3>
                    <p className="text-xs text-muted-foreground">
                      Live snapshot · refreshed 2 min ago
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" className="gap-1">
                    View all <ArrowUpRight className="size-3.5" />
                  </Button>
                </div>
                <div className="divide-y">
                  {live.map((b) => (
                    <div key={b.id} className="grid grid-cols-12 items-center gap-3 py-3">
                      <div className="col-span-4 flex items-center gap-2.5">
                        <div className="grid size-8 place-items-center rounded-md bg-brand-soft text-brand">
                          <Building2 className="size-4" />
                        </div>
                        <div className="leading-tight">
                          <div className="text-sm font-medium">{b.name}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {b.city} · {b.region}
                          </div>
                        </div>
                      </div>
                      <div className="col-span-4">
                        <div className="flex items-center justify-between mb-1 text-[11px] text-muted-foreground">
                          <span>Occupancy</span>
                          <span>{Math.round(b.occupancy * 100)}%</span>
                        </div>
                        <Progress value={b.occupancy * 100} className="h-1.5" />
                      </div>
                      <div className="col-span-3 text-right">
                        <div className="text-sm font-medium tabular-nums">
                          {formatZAR(b.revenue)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">MRR</div>
                      </div>
                      <div className="col-span-1 text-right">
                        <Badge
                          variant={b.occupancy > 0.85 ? "default" : "secondary"}
                          className="text-[10px]"
                        >
                          {b.occupancy > 0.85 ? "Strong" : "Steady"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card-soft p-5">
                <h3 className="font-display font-semibold mb-1">Hottest deals</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  AI-scored prospects · Samantha N.
                </p>
                <div className="space-y-3">
                  {leads
                    .filter((l) => l.score > 80)
                    .slice(0, 4)
                    .map((l) => (
                      <div
                        key={l.id}
                        className="flex items-start justify-between gap-2 border-b pb-3 last:border-0 last:pb-0"
                      >
                        <div className="leading-tight">
                          <div className="text-sm font-medium">{l.company}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {l.stage} · {l.branch}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm tabular-nums">{formatZAR(l.value)}</div>
                          <Badge variant="secondary" className="text-[10px]">
                            Score {l.score}
                          </Badge>
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
                    <div
                      key={b.id}
                      className="flex items-start justify-between gap-2 rounded-lg border bg-muted/30 p-3"
                    >
                      <div className="leading-tight">
                        <div className="text-sm font-medium">{b.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {b.city} · {b.region}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        Planned
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              {showCommunityCard && (
                <div className="card-soft p-5 lg:col-span-2">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-display font-semibold">Feed pulse</h3>
                      <p className="text-xs text-muted-foreground">
                        Latest activity across all branches
                      </p>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    {communityPosts.slice(0, 4).map((p) => (
                      <div key={p.id} className="rounded-lg border p-3.5 bg-muted/20">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="text-sm font-medium">{p.author}</div>
                          <Badge variant="outline" className="text-[10px]">
                            {p.kind}
                          </Badge>
                        </div>
                        <p className="text-sm text-foreground/85">{p.body}</p>
                        <div className="mt-2 text-[11px] text-muted-foreground">
                          {p.reactions} reactions · {p.comments} comments · {p.time}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}

type SalesLeadRow = {
  id: string;
  company_name: string;
  stage: string;
  sales_stage: string | null;
  score: number | null;
  branch_id: string | null;
  created_at: string;
};

type SalesProspectRow = {
  id: string;
  company_name: string;
  city: string | null;
  industry: string | null;
  opportunity_score: number;
  discovered_at: string;
};

function SalesManagerOverview({
  greetingState,
  firstName,
}: {
  greetingState: { dateLabel: string; greeting: string };
  firstName: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [metrics, setMetrics] = useState({
    openLeads: 0,
    qualified: 0,
    hotProspects: 0,
    reviewQueue: 0,
  });
  const [recentLeads, setRecentLeads] = useState<SalesLeadRow[]>([]);
  const [hotProspects, setHotProspects] = useState<SalesProspectRow[]>([]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Sales workspace data is not configured.");
      setLoading(false);
      return;
    }
    let active = true;
    const loadSalesOverview = async () => {
      const [
        openResult,
        qualifiedResult,
        hotCountResult,
        reviewResult,
        leadResult,
        prospectResult,
      ] = await Promise.all([
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .not("sales_stage", "in", '("Active Tenant","Lost")'),
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("sales_stage", "Qualified"),
        supabase
          .from("prospect_profiles")
          .select("id", { count: "exact", head: true })
          .gte("opportunity_score", 80)
          .not("discovery_status", "in", "(archived,failed)"),
        supabase
          .from("prospect_profiles")
          .select("id", { count: "exact", head: true })
          .eq("discovery_status", "needs_review"),
        supabase
          .from("leads")
          .select("id,company_name,stage,sales_stage,score,branch_id,created_at")
          .order("created_at", { ascending: false })
          .limit(6),
        supabase
          .from("prospect_profiles")
          .select("id,company_name,city,industry,opportunity_score,discovered_at")
          .gte("opportunity_score", 70)
          .not("discovery_status", "in", "(archived,failed)")
          .order("opportunity_score", { ascending: false })
          .limit(5),
      ]);
      if (!active) return;
      const queryError = [
        openResult.error,
        qualifiedResult.error,
        hotCountResult.error,
        reviewResult.error,
        leadResult.error,
        prospectResult.error,
      ].find((resultError) => resultError !== null);
      if (queryError) setError(queryError.message);
      setMetrics({
        openLeads: openResult.count ?? 0,
        qualified: qualifiedResult.count ?? 0,
        hotProspects: hotCountResult.count ?? 0,
        reviewQueue: reviewResult.count ?? 0,
      });
      setRecentLeads((leadResult.data ?? []) as SalesLeadRow[]);
      setHotProspects((prospectResult.data ?? []) as SalesProspectRow[]);
      setLoading(false);
    };
    void loadSalesOverview().catch((cause: unknown) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "Could not load the sales overview.");
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const stageLabel = (stage: string) =>
    stage.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

  return (
    <div className="mx-auto max-w-350">
      <PageHeader
        eyebrow={`Sales & CRM · ${greetingState.dateLabel}`}
        title={`${greetingState.greeting}, ${firstName}.`}
        description="Your sales command centre: work the pipeline, review qualified opportunities, and act on new business signals."
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/leads-intelligence">Review prospects</Link>
            </Button>
            <Button asChild>
              <Link to="/crm">Open pipeline</Link>
            </Button>
          </>
        }
      />

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Loading sales activity…
        </div>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard
              label="Open pipeline"
              value={String(metrics.openLeads)}
              hint="Active CRM leads"
              accent="brand"
            />
            <StatCard
              label="Qualified leads"
              value={String(metrics.qualified)}
              hint="Ready for next action"
              accent="success"
            />
            <StatCard
              label="Hot prospects"
              value={String(metrics.hotProspects)}
              hint="Intelligence score 80+"
              accent="warning"
            />
            <StatCard
              label="Review queue"
              value={String(metrics.reviewQueue)}
              hint="Prospects needing attention"
            />
          </div>

          <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
            <section>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold">Recent pipeline activity</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Latest CRM leads across your sales scope.
                  </p>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/crm">
                    View pipeline <ArrowUpRight className="ml-1 size-3.5" />
                  </Link>
                </Button>
              </div>
              <div className="divide-y border-y">
                {recentLeads.length ? (
                  recentLeads.map((lead) => (
                    <div key={lead.id} className="flex items-center justify-between gap-4 py-4">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{lead.company_name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {lead.sales_stage ?? stageLabel(lead.stage)} · Score {lead.score ?? 0}
                        </div>
                      </div>
                      <time className="shrink-0 text-xs text-muted-foreground">
                        {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
                          new Date(lead.created_at),
                        )}
                      </time>
                    </div>
                  ))
                ) : (
                  <p className="py-5 text-sm text-muted-foreground">
                    No CRM leads have been created yet.
                  </p>
                )}
              </div>
            </section>

            <section>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold">Opportunity signals</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    High-scoring companies to review.
                  </p>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/leads-intelligence">
                    All prospects <ArrowUpRight className="ml-1 size-3.5" />
                  </Link>
                </Button>
              </div>
              <div className="divide-y border-y">
                {hotProspects.length ? (
                  hotProspects.map((prospect) => (
                    <div key={prospect.id} className="flex items-center justify-between gap-4 py-4">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{prospect.company_name}</div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {[prospect.industry, prospect.city].filter(Boolean).join(" · ") ||
                            "Company intelligence"}
                        </div>
                      </div>
                      <Badge variant={prospect.opportunity_score >= 80 ? "default" : "outline"}>
                        {prospect.opportunity_score}/100
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="py-5 text-sm text-muted-foreground">
                    No high-scoring prospects are available yet.
                  </p>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

type OrganizationEvent = { id: string; title: string; starts_at: string; kind: string | null };

function OrganizationOverview({
  greetingState,
  firstName,
}: {
  greetingState: { dateLabel: string; greeting: string };
  firstName: string;
}) {
  const { role, canAccessUrl } = useRole();
  const isOrganizationAdmin = role.id === "organization-admin";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activity, setActivity] = useState({
    bookings: 0,
    shopOrders: 0,
    cafeOrders: 0,
    support: 0,
  });
  const [upcomingEvents, setUpcomingEvents] = useState<OrganizationEvent[]>([]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Workspace data is not configured.");
      setLoading(false);
      return;
    }
    let active = true;
    const loadActivity = async () => {
      const { data: authResult, error: authError } = await supabase.auth.getUser();
      if (authError || !authResult.user) {
        if (active) {
          setError(authError?.message || "Sign in to view your organization workspace.");
          setLoading(false);
        }
        return;
      }
      const { data: membership, error: membershipError } = await supabase
        .from("organization_members")
        .select("organization_id,branch_id")
        .eq("user_id", authResult.user.id)
        .eq("status", "active")
        .maybeSingle();
      if (membershipError || !membership) {
        if (active) {
          setError(membershipError?.message || "No active organization membership was found.");
          setLoading(false);
        }
        return;
      }

      const now = new Date();
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const [bookingResult, shopResult, cafeResult, supportResult, eventResult] = await Promise.all(
        [
          isOrganizationAdmin
            ? supabase
                .from("branch_resource_bookings")
                .select("id", { count: "exact", head: true })
                .eq("organization_id", membership.organization_id)
                .eq("branch_id", membership.branch_id)
                .gte("starts_at", now.toISOString())
                .in("status", ["requested", "confirmed"])
            : Promise.resolve({ count: 0, error: null }),
          isOrganizationAdmin
            ? supabase
                .from("branch_shop_orders")
                .select("id", { count: "exact", head: true })
                .eq("organization_id", membership.organization_id)
                .eq("branch_id", membership.branch_id)
                .in("status", ["placed", "accepted", "ready"])
            : Promise.resolve({ count: 0, error: null }),
          supabase
            .from("cafe_orders")
            .select("id", { count: "exact", head: true })
            .eq("profile_id", authResult.user.id)
            .eq("branch_id", membership.branch_id)
            .gte("created_at", monthAgo),
          isOrganizationAdmin
            ? supabase
                .from("support_tickets")
                .select("id", { count: "exact", head: true })
                .eq("raised_by", authResult.user.id)
                .eq("branch_id", membership.branch_id)
                .in("status", ["open", "in_progress"])
            : Promise.resolve({ count: 0, error: null }),
          isOrganizationAdmin
            ? supabase
                .from("events")
                .select("id,title,starts_at,kind")
                .eq("branch_id", membership.branch_id)
                .eq("status", "published")
                .gte("starts_at", now.toISOString())
                .order("starts_at", { ascending: true })
                .limit(4)
            : Promise.resolve({ data: [], error: null }),
        ],
      );

      if (!active) return;
      const queryError = [
        bookingResult.error,
        shopResult.error,
        cafeResult.error,
        supportResult.error,
        eventResult.error,
      ].find((resultError) => resultError !== null);
      if (queryError) setError(queryError.message);
      setActivity({
        bookings: bookingResult.count ?? 0,
        shopOrders: shopResult.count ?? 0,
        cafeOrders: cafeResult.count ?? 0,
        support: supportResult.count ?? 0,
      });
      setUpcomingEvents((eventResult.data ?? []) as OrganizationEvent[]);
      setLoading(false);
    };
    void loadActivity().catch((cause: unknown) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "Could not load organization activity.");
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [isOrganizationAdmin]);

  const shortcuts = [
    {
      title: "Book a room",
      description: "Find a room or workspace",
      url: "/bookings",
      icon: CalendarDays,
    },
    { title: "Café", description: "Browse the branch café", url: "/cafe", icon: Coffee },
    {
      title: "Marketplace",
      description: "Explore member services",
      url: "/marketplace",
      icon: ShoppingBag,
    },
    { title: "Support", description: "Get help from Office & Co", url: "/support", icon: LifeBuoy },
  ].filter((shortcut) => canAccessUrl(shortcut.url));

  const adminFocus = [
    { label: "Upcoming bookings", value: String(activity.bookings), tone: "brand" },
    { label: "Shop orders", value: String(activity.shopOrders), tone: "success" },
    { label: "Open support", value: String(activity.support), tone: activity.support ? "warning" : "success" },
  ];

  if (!isOrganizationAdmin) {
    const memberShortcuts = [
      {
        title: "Community feed",
        description: "Updates and conversations from your workspace",
        url: "/community",
        icon: Users,
      },
      { title: "Café", description: "Browse your branch café", url: "/cafe", icon: Coffee },
      {
        title: "Marketplace",
        description: "Explore services from the member community",
        url: "/marketplace",
        icon: ShoppingBag,
      },
      {
        title: "Your profile",
        description: "Update your name and share your invite code",
        url: "/account",
        icon: UserRound,
      },
    ].filter((shortcut) => canAccessUrl(shortcut.url));

    return (
      <div className="mx-auto max-w-350">
        <PageHeader
          eyebrow={`${role.tenant ?? "Organization"} · ${role.branch ?? "Office & Co"} · ${greetingState.dateLabel}`}
          title={`${greetingState.greeting}, ${firstName}.`}
          description={`Welcome to ${role.tenant ?? "your organization"}. Your member workspace includes community, café, marketplace, and your profile. Invoice and organization administration are managed by your organization admin.`}
          actions={
            <Button asChild variant="outline">
              <Link to="/account">Your profile</Link>
            </Button>
          }
        />

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading your workspace…
          </div>
        ) : (
          <>
            <section className="mb-8">
              <div className="mb-4">
                <h2 className="font-display text-lg font-semibold">Your workspace</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  The everyday tools available to you as a team member.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {memberShortcuts.map((shortcut) => (
                  <Link
                    key={shortcut.url}
                    to={shortcut.url}
                    className="group card-soft flex min-h-40 flex-col justify-between p-5 transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md"
                  >
                    <span className="grid size-10 place-items-center rounded-lg bg-brand/10 text-brand">
                      <shortcut.icon className="size-5" />
                    </span>
                    <span className="mt-5">
                      <span className="block font-display font-semibold">{shortcut.title}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {shortcut.description}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
            <div className="max-w-2xl border-t pt-5">
              <p className="text-sm text-muted-foreground">
                Café orders placed in the last 30 days:{" "}
                <span className="font-medium text-foreground">{activity.cafeOrders}</span>
              </p>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-350">
      <PageHeader
        eyebrow={`${role.tenant ?? "Organization"} · ${role.branch ?? "Office & Co"} · ${greetingState.dateLabel}`}
        title={`${greetingState.greeting}, ${firstName}.`}
        description={`Your ${role.tenant ?? "organization"} workspace at ${role.branch ?? "Office & Co"}. See your activity and get to the services your team uses.`}
        actions={
          <Button asChild variant="outline">
            <Link to="/organization">Organization</Link>
          </Button>
        }
      />

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Loading your organization activity…
        </div>
      ) : (
        <>
          <section className="mb-8 rounded-lg border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">Organization focus</h2>
                <p className="mt-1 text-sm text-muted-foreground">The most important operational signals for your workspace this week.</p>
              </div>
              <Badge variant="outline">Your branch team</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {adminFocus.map(({ label, value, tone }) => (
                <div key={label} className="rounded-md border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                  <p className={`mt-2 text-xl font-semibold ${tone === "warning" ? "text-warning" : tone === "success" ? "text-emerald-500" : tone === "brand" ? "text-brand" : "text-foreground"}`}>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Upcoming bookings"
              value={String(activity.bookings)}
              hint="Your organization · selected branch"
              accent="brand"
            />
            <StatCard
              label="Shop orders in progress"
              value={String(activity.shopOrders)}
              hint="Placed, accepted, or ready"
            />
            <StatCard
              label="Café orders · 30 days"
              value={String(activity.cafeOrders)}
              hint="Your recent branch orders"
            />
            <StatCard
              label="Open support requests"
              value={String(activity.support)}
              hint="Raised by you"
              accent={activity.support ? "warning" : undefined}
            />
          </div>

          <div className="grid gap-7 lg:grid-cols-[1.1fr_0.9fr]">
            <section>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold">Upcoming at your branch</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Published events at {role.branch ?? "your branch"}.
                  </p>
                </div>
                {canAccessUrl("/events") && (
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/events">
                      All events <ArrowUpRight className="ml-1 size-3.5" />
                    </Link>
                  </Button>
                )}
              </div>
              <div className="divide-y border-y">
                {upcomingEvents.length ? (
                  upcomingEvents.map((event) => (
                    <div key={event.id} className="flex items-center justify-between gap-4 py-4">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{event.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {event.kind || "Branch event"}
                        </div>
                      </div>
                      <time className="shrink-0 text-xs text-muted-foreground">
                        {new Intl.DateTimeFormat("en", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        }).format(new Date(event.starts_at))}
                      </time>
                    </div>
                  ))
                ) : (
                  <p className="py-5 text-sm text-muted-foreground">
                    No upcoming published events for this branch.
                  </p>
                )}
              </div>
            </section>

            <section>
              <h2 className="mb-3 font-display text-lg font-semibold">Your workspace</h2>
              <div className="divide-y border-y">
                {shortcuts.map((shortcut) => (
                  <Link
                    key={shortcut.url}
                    to={shortcut.url}
                    className="group flex items-center justify-between gap-3 py-4 hover:text-brand"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-foreground/70 group-hover:bg-brand/10 group-hover:text-brand">
                        <shortcut.icon className="size-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{shortcut.title}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {shortcut.description}
                        </span>
                      </span>
                    </span>
                    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function EngStat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="font-display text-2xl font-semibold mt-1">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}
