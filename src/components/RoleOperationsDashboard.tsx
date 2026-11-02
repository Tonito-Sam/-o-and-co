import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { branches, ROLES, type RoleDef } from "@/lib/mock";
import { getSupabaseClient } from "@/lib/supabase";
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  CircleHelp,
  ClipboardCheck,
  DoorOpen,
  FileText,
  Landmark,
  LoaderCircle,
  MessageSquare,
  Radar,
  Settings,
  ShoppingBag,
  Users,
} from "lucide-react";

type GreetingState = { dateLabel: string; greeting: string };
type DashboardEvent = {
  id: string;
  title: string;
  starts_at: string;
  kind: string | null;
};
type Snapshot = {
  availableOffices: number;
  totalOffices: number;
  availableDesks: number;
  totalDesks: number;
  upcomingBookings: number;
  openTickets: number;
  upcomingEvents: DashboardEvent[];
  pendingPosts: number;
  activeCafeProducts: number;
  lowStockCafeProducts: number;
};

const emptySnapshot: Snapshot = {
  availableOffices: 0,
  totalOffices: 0,
  availableDesks: 0,
  totalDesks: 0,
  upcomingBookings: 0,
  openTickets: 0,
  upcomingEvents: [],
  pendingPosts: 0,
  activeCafeProducts: 0,
  lowStockCafeProducts: 0,
};

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));

export function RoleOperationsDashboard({
  role,
  greetingState,
  firstName,
}: {
  role: RoleDef;
  greetingState: GreetingState;
  firstName: string;
}) {
  const isSuperadmin = role.id === "superadmin";
  const branchName =
    role.id === "lydia-admin"
      ? "Union Station"
      : role.id === "cafe-manager"
        ? role.branch
      : role.id === "rosebank-sales"
        ? "Rosebank"
        : role.branch;
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [loading, setLoading] = useState(!isSuperadmin);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!branchName || isSuperadmin) return;
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Workspace data is not configured.");
      setLoading(false);
      return;
    }

    let active = true;
    const loadSnapshot = async () => {
      const { data: branch, error: branchError } = await supabase
        .from("branches")
        .select("id")
        .eq("name", branchName)
        .maybeSingle();
      if (branchError || !branch) {
        if (active) {
          setError(branchError?.message ?? `No branch record found for ${branchName}.`);
          setLoading(false);
        }
        return;
      }

      const now = new Date().toISOString();
      const [officeResult, deskResult, eventResult] = await Promise.all([
        supabase.from("branch_offices").select("status").eq("branch_id", branch.id),
        supabase.from("branch_desks").select("status").eq("branch_id", branch.id),
        supabase
          .from("events")
          .select("id,title,starts_at,kind")
          .eq("branch_id", branch.id)
          .eq("status", "published")
          .gte("starts_at", now)
          .order("starts_at", { ascending: true })
          .limit(5),
      ]);

      let upcomingBookings = 0;
      let openTickets = 0;
      let pendingPosts = 0;
      let activeCafeProducts = 0;
      let lowStockCafeProducts = 0;
      let cafeProductsError: Error | null = null;
      if (role.id === "cafe-manager") {
        const cafeResult = await supabase
          .from("cafe_products")
          .select("stock_quantity,low_stock_threshold,track_inventory,is_available")
          .eq("branch_id", branch.id)
          .eq("is_active", true);
        cafeProductsError = cafeResult.error;
        const cafeProducts = cafeResult.data ?? [];
        activeCafeProducts = cafeProducts.filter(({ is_available }) => is_available).length;
        lowStockCafeProducts = cafeProducts.filter(
          ({ track_inventory, stock_quantity, low_stock_threshold }) =>
            track_inventory && stock_quantity <= low_stock_threshold,
        ).length;
      }
      const followUpResults = await Promise.all([
        role.id === "branch-manager"
          ? supabase
              .from("branch_resource_bookings")
              .select("id", { count: "exact", head: true })
              .eq("branch_id", branch.id)
              .gte("starts_at", now)
              .in("status", ["requested", "confirmed"])
          : Promise.resolve(null),
        role.id === "branch-manager"
          ? supabase
              .from("support_tickets")
              .select("id", { count: "exact", head: true })
              .eq("branch_id", branch.id)
              .in("status", ["open", "in_progress"])
          : Promise.resolve(null),
        role.id === "community-manager"
          ? supabase
              .from("community_posts")
              .select("id", { count: "exact", head: true })
              .eq("branch_id", branch.id)
              .eq("status", "pending")
          : Promise.resolve(null),
      ]);
      const [bookingResult, ticketResult, postResult] = followUpResults;
      upcomingBookings = bookingResult?.count ?? 0;
      openTickets = ticketResult?.count ?? 0;
      pendingPosts = postResult?.count ?? 0;

      if (!active) return;
      const queryError = [
        officeResult.error,
        deskResult.error,
        eventResult.error,
        bookingResult?.error,
        ticketResult?.error,
        postResult?.error,
        cafeProductsError,
      ].find(Boolean);
      if (queryError) setError(queryError.message);
      const offices = officeResult.data ?? [];
      const desks = deskResult.data ?? [];
      setSnapshot({
        availableOffices: offices.filter(({ status }) => status === "available").length,
        totalOffices: offices.length,
        availableDesks: desks.filter(({ status }) => status === "available").length,
        totalDesks: desks.length,
        upcomingBookings,
        openTickets,
        upcomingEvents: (eventResult.data ?? []) as DashboardEvent[],
        pendingPosts,
        activeCafeProducts,
        lowStockCafeProducts,
      });
      setLoading(false);
    };

    void loadSnapshot().catch((cause: unknown) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "Could not load the role dashboard.");
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [branchName, isSuperadmin, role.id]);

  const config = {
    superadmin: {
      title: "Platform control center",
      description: "Manage access, monitor system activity, and review the organization-wide operating tools.",
      links: [
        { label: "Role settings", to: "/settings/roles", icon: Settings },
        { label: "Crawler activity", to: "/crawler-intelligence", icon: Activity },
        { label: "Leads intelligence", to: "/leads-intelligence", icon: Radar },
        { label: "CRM pipeline", to: "/crm", icon: ClipboardCheck },
        { label: "Analytics", to: "/analytics", icon: FileText },
      ],
    },
    "branch-manager": {
      title: `${branchName ?? "Branch"} operations`,
      description: "A branch-level view of space availability, upcoming requests, and service issues.",
      links: [
        { label: "Facilities", to: "/facilities", icon: DoorOpen },
        { label: "Bookings", to: "/bookings", icon: CalendarDays },
        { label: "Support queue", to: "/support", icon: CircleHelp },
        { label: "Tenants", to: "/tenants", icon: Users },
      ],
    },
    "cafe-manager": {
      title: `${branchName ?? "Branch"} café operations`,
      description: "Manage the branch menu and stock, and keep tenant-facing café availability accurate.",
      links: [
        { label: "Manage café menu and stock", to: "/cafe", icon: ShoppingBag },
        { label: "Branch bookings", to: "/bookings", icon: CalendarDays },
        { label: "Branch support", to: "/support", icon: CircleHelp },
      ],
    },
    "rosebank-sales": {
      title: "Rosebank sales workspace",
      description: "Local workspace availability, events, and direct access to your branch sales pipeline.",
      links: [
        { label: "CRM pipeline", to: "/crm", icon: ClipboardCheck },
        { label: "Tenants", to: "/tenants", icon: Users },
        { label: "Bookings", to: "/bookings", icon: CalendarDays },
        { label: "Events", to: "/events", icon: Landmark },
      ],
    },
    "community-manager": {
      title: `${branchName ?? "Branch"} community`,
      description: "Keep the local community active through events, useful updates, and timely follow-up.",
      links: [
        { label: "Events", to: "/events", icon: CalendarDays },
        { label: "Community feed", to: "/community", icon: MessageSquare },
        { label: "Content hub", to: "/content", icon: FileText },
        { label: "Bookings", to: "/bookings", icon: DoorOpen },
      ],
    },
    "lydia-admin": {
      title: "Union Station venue operations",
      description: "Coordinate upcoming venue events and move booking requests through the venue workflow.",
      links: [
        { label: "Venue dashboard", to: "/union-station-admin", icon: Landmark },
        { label: "Booking workflow", to: "/union-station", icon: CalendarDays },
        { label: "Events", to: "/events", icon: Users },
        { label: "Facilities", to: "/facilities", icon: DoorOpen },
      ],
    },
  }[role.id as "superadmin" | "branch-manager" | "cafe-manager" | "rosebank-sales" | "community-manager" | "lydia-admin"];

  if (!config) return null;

  const availableSpaces = snapshot.availableOffices + snapshot.availableDesks;
  const totalSpaces = snapshot.totalOffices + snapshot.totalDesks;
  const focusHighlights =
    role.id === "branch-manager"
      ? [
          { label: "Space availability", value: `${availableSpaces} / ${totalSpaces}`, tone: "success" },
          { label: "Open issues", value: String(snapshot.openTickets), tone: snapshot.openTickets ? "warning" : "success" },
          { label: "Booking activity", value: String(snapshot.upcomingBookings), tone: "brand" },
        ]
      : role.id === "cafe-manager"
        ? [
            { label: "Menu items", value: String(snapshot.activeCafeProducts), tone: "brand" },
            { label: "Restock alerts", value: String(snapshot.lowStockCafeProducts), tone: snapshot.lowStockCafeProducts ? "warning" : "success" },
            { label: "Assigned branch", value: branchName ?? "N/A", tone: "default" },
          ]
        : role.id === "community-manager"
          ? [
              { label: "Published events", value: String(snapshot.upcomingEvents.length), tone: "brand" },
              { label: "Pending posts", value: String(snapshot.pendingPosts), tone: snapshot.pendingPosts ? "warning" : "success" },
              { label: "Branch", value: branchName ?? "N/A", tone: "default" },
            ]
          : [
              { label: "Upcoming venue events", value: String(snapshot.upcomingEvents.length), tone: "brand" },
              { label: "Workflow status", value: "Open", tone: "success" },
              { label: "Venue", value: branchName ?? "N/A", tone: "default" },
            ];

  const greeting = (
    <PageHeader
      eyebrow={`${role.title} · ${greetingState.dateLabel}`}
      title={`${greetingState.greeting}, ${firstName}.`}
      description={config.description}
      actions={
        <Badge variant="outline" className="gap-1.5">
          <Activity className="size-3.5" />{role.scope}
        </Badge>
      }
    />
  );

  if (isSuperadmin) {
    return (
      <div className="mx-auto max-w-350">
        {greeting}
        <div className="mb-8 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatCard label="Access profiles" value={String(ROLES.length)} hint="Configured role types" accent="brand" />
          <StatCard label="Workspace scope" value="Group-wide" hint="Platform administration" />
          <StatCard label="Controls" value="Role-based" hint="Review access and permissions" accent="success" />
          <StatCard label="System activity" value="Review" hint="Crawler and platform queues" accent="warning" />
        </div>
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Administration</h2>
          <div className="divide-y border-y">
            {config.links.map(({ label, to, icon: Icon }) => (
              <Link key={to} to={to} className="flex items-center justify-between gap-4 py-4 hover:text-brand">
                <span className="flex items-center gap-3 text-sm font-medium"><Icon className="size-4 text-brand" />{label}</span>
                <ArrowUpRight className="size-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    );
  }

  const isBranchManager = role.id === "branch-manager";
  const isCafeManager = role.id === "cafe-manager";
  const isRosebankSales = role.id === "rosebank-sales";
  const isCommunityManager = role.id === "community-manager";

  return (
    <div className="mx-auto max-w-350">
      {greeting}
      {error && <p role="alert" className="mb-4 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">{error}</p>}
      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading branch activity</div>
      ) : (
        <>
          <section className="mb-8 rounded-lg border bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">Priority focus</h2>
                <p className="mt-1 text-sm text-muted-foreground">The main items to review for this workspace today.</p>
              </div>
              <Badge variant="outline">{role.title}</Badge>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {focusHighlights.map(({ label, value, tone }) => (
                <div key={label} className="rounded-md border bg-muted/20 p-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                  <p className={`mt-2 text-xl font-semibold ${tone === "warning" ? "text-warning" : tone === "success" ? "text-emerald-500" : tone === "brand" ? "text-brand" : "text-foreground"}`}>
                    {value}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {isBranchManager ? (
            <div className="mb-8 grid grid-cols-2 gap-3 xl:grid-cols-4">
              <StatCard label="Available spaces" value={`${availableSpaces} / ${totalSpaces}`} hint="Offices and desks" accent="success" />
              <StatCard label="Upcoming requests" value={String(snapshot.upcomingBookings)} hint="Requested or confirmed" accent="brand" />
              <StatCard label="Open service issues" value={String(snapshot.openTickets)} hint="Needs branch attention" accent={snapshot.openTickets ? "warning" : undefined} />
              <StatCard label="Upcoming events" value={String(snapshot.upcomingEvents.length)} hint="Published at this branch" />
            </div>
          ) : isCafeManager ? (
            <div className="mb-8 grid grid-cols-2 gap-3 xl:grid-cols-3">
              <StatCard label="Active menu items" value={String(snapshot.activeCafeProducts)} hint={`${branchName} café`} accent="brand" />
              <StatCard label="Low-stock items" value={String(snapshot.lowStockCafeProducts)} hint="At or below reorder level" accent={snapshot.lowStockCafeProducts ? "warning" : "success"} />
              <StatCard label="Café branch" value={branchName ?? "Not assigned"} hint="Assigned management scope" />
            </div>
          ) : isRosebankSales ? (
            <div className="mb-8 grid grid-cols-2 gap-3 xl:grid-cols-3">
              <StatCard label="Available spaces" value={`${availableSpaces} / ${totalSpaces}`} hint="Offices and desks in Rosebank" accent="success" />
              <StatCard label="Upcoming events" value={String(snapshot.upcomingEvents.length)} hint="Published at Rosebank" accent="brand" />
              <StatCard label="Sales workspace" value="Rosebank" hint="Branch-scoped pipeline" />
            </div>
          ) : isCommunityManager ? (
            <div className="mb-8 grid grid-cols-2 gap-3 xl:grid-cols-3">
              <StatCard label="Upcoming events" value={String(snapshot.upcomingEvents.length)} hint="Published at this branch" accent="brand" />
              <StatCard label="Posts to review" value={String(snapshot.pendingPosts)} hint="Pending community approval" accent={snapshot.pendingPosts ? "warning" : undefined} />
              <StatCard label="Available spaces" value={`${availableSpaces} / ${totalSpaces}`} hint="Offices and desks at your branch" accent="success" />
            </div>
          ) : (
            <div className="mb-8 grid grid-cols-2 gap-3 xl:grid-cols-3">
              <StatCard label="Upcoming venue events" value={String(snapshot.upcomingEvents.length)} hint="Published at Union Station" accent="brand" />
              <StatCard label="Venue workflow" value="Open" hint="Review requests and quotes" />
              <StatCard label="Next event" value={snapshot.upcomingEvents[0] ? dateLabel(snapshot.upcomingEvents[0].starts_at) : "None scheduled"} hint={snapshot.upcomingEvents[0]?.title ?? "No upcoming published event"} />
            </div>
          )}

          <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
            <section>
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-semibold">{isBranchManager ? "Upcoming branch events" : isCafeManager ? "Café branch activity" : isCommunityManager ? "Community calendar" : "Union Station calendar"}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{isCafeManager ? `${branchName} · menu and inventory status` : `${branchName} · published events and start times`}</p>
                </div>
                <Button asChild variant="ghost" size="sm"><Link to={isCafeManager ? "/cafe" : isCommunityManager ? "/events" : isBranchManager ? "/bookings" : "/union-station-admin"}>{isCafeManager ? "Open café" : "Open calendar"} <ArrowUpRight className="size-3.5" /></Link></Button>
              </div>
              {isCafeManager ? (
                <div className="divide-y border-y">
                  <div className="flex items-center justify-between py-4 text-sm"><span>Available products</span><span className="font-medium">{snapshot.activeCafeProducts}</span></div>
                  <div className="flex items-center justify-between py-4 text-sm"><span>Products needing restock</span><span className="font-medium">{snapshot.lowStockCafeProducts}</span></div>
                </div>
              ) : <div className="divide-y border-y">
                {snapshot.upcomingEvents.length ? snapshot.upcomingEvents.map((event) => (
                  <div key={event.id} className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{event.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{event.kind ?? "Event"}</div>
                    </div>
                    <time className="shrink-0 text-xs text-muted-foreground">{dateLabel(event.starts_at)}</time>
                  </div>
                )) : <p className="py-5 text-sm text-muted-foreground">No upcoming published events for this branch.</p>}
              </div>}
            </section>

            <section>
              <h2 className="mb-3 font-display text-lg font-semibold">{isBranchManager ? "Branch work queues" : isCafeManager ? "Café tools" : isCommunityManager ? "Community tools" : "Venue tools"}</h2>
              <div className="divide-y border-y">
                {config.links.map(({ label, to, icon: Icon }) => (
                  <Link key={to} to={to} className="flex items-center justify-between gap-4 py-4 hover:text-brand">
                    <span className="flex items-center gap-3 text-sm font-medium"><Icon className="size-4 text-brand" />{label}</span>
                    <ArrowUpRight className="size-4 text-muted-foreground" />
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