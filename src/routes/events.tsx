import { createFileRoute } from "@tanstack/react-router";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseClient } from "@/lib/supabase";
import { useRole } from "@/lib/role-context";
import {
  Building2,
  CalendarDays,
  Copy,
  Download,
  Plus,
  QrCode,
  RefreshCw,
  Users,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/events")({
  head: () => ({ meta: [{ title: "Events — WorkspaceOS" }] }),
  component: Events,
});

function Events() {
  const { role } = useRole();
  const assignedBranchIds = role.branchIds ?? [];
  const assignedBranchNames = role.branchNames ?? (role.branch ? [role.branch] : []);
  if (role.id === "group-ceo") return <GroupEventsPortfolio />;

  const canManageCheckIn = [
    "branch-manager",
    "community-manager",
    "group-admin",
    "superadmin",
  ].includes(role.id);

  return (
    <div className="mx-auto max-w-325">
      <PageHeader
        eyebrow="Operations · attendance"
        title="Event and room check-in"
        description="Create QR check-ins and review attendance for your branch’s events and meeting spaces."
      />
      {canManageCheckIn && (
        <EventCheckInManager
          roleId={role.id}
          assignedBranchIds={assignedBranchIds}
          assignedBranchNames={assignedBranchNames}
        />
      )}
      {!canManageCheckIn && (
        <p className="text-sm text-muted-foreground">
          Attendance management is available to branch managers and event managers.
        </p>
      )}
    </div>
  );
}

type PortfolioBranch = { id: string; name: string };
type PortfolioEvent = {
  id: string;
  title: string;
  starts_at: string;
  status: string;
  branch_id: string | null;
};
type PortfolioBooking = {
  id: string;
  starts_at: string;
  status: string;
  guests: number | null;
  rooms: { name: string; branch_id: string } | null;
};
type PortfolioVenueRequest = {
  id: string;
  reference: string;
  event_type: string;
  client_company: string;
  event_date: string;
  starts_time: string;
  status: string;
  attendees: number;
  branch_id: string;
};
type PortfolioCheckInSession = { id: string; branch_id: string };
type PortfolioAttendee = { id: string; session_id: string };
type PortfolioActivity = {
  id: string;
  title: string;
  branch_id: string | null;
  starts_at: string;
  status: string;
  type: "Event" | "Room booking" | "Union Station";
};

function GroupEventsPortfolio() {
  const [branches, setBranches] = useState<PortfolioBranch[]>([]);
  const [events, setEvents] = useState<PortfolioEvent[]>([]);
  const [bookings, setBookings] = useState<PortfolioBooking[]>([]);
  const [venueRequests, setVenueRequests] = useState<PortfolioVenueRequest[]>([]);
  const [checkInsByBranch, setCheckInsByBranch] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPortfolio = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Events portfolio is unavailable because Supabase is not configured.");
      setLoading(false);
      return;
    }

    setLoading(true);
    const now = new Date();
    const nowIso = now.toISOString();
    const today = now.toISOString().slice(0, 10);
    const [branchResult, eventResult, bookingResult, venueResult, sessionResult, attendeeResult] =
      await Promise.all([
        supabase.from("branches").select("id,name").eq("status", "live").order("name"),
        supabase
          .from("events")
          .select("id,title,starts_at,status,branch_id")
          .eq("status", "published")
          .gte("starts_at", nowIso)
          .order("starts_at")
          .limit(500),
        supabase
          .from("bookings")
          .select("id,starts_at,status,guests,rooms!inner(name,branch_id)")
          .eq("status", "confirmed")
          .gte("ends_at", nowIso)
          .order("starts_at")
          .limit(500),
        supabase
          .from("union_station_requests")
          .select(
            "id,reference,event_type,client_company,event_date,starts_time,status,attendees,branch_id",
          )
          .in("status", ["confirmed", "invoiced"])
          .gte("event_date", today)
          .order("event_date")
          .limit(500),
        supabase.from("event_checkin_sessions").select("id,branch_id"),
        supabase.from("event_attendees").select("id,session_id"),
      ]);
    const failed = [
      branchResult,
      eventResult,
      bookingResult,
      venueResult,
      sessionResult,
      attendeeResult,
    ].find((result) => result.error);
    if (failed?.error) {
      setError(failed.error.message);
      setLoading(false);
      return;
    }

    const branchRows = (branchResult.data ?? []) as PortfolioBranch[];
    const eventRows = (eventResult.data ?? []) as PortfolioEvent[];
    const bookingRows = (bookingResult.data ?? []) as unknown as PortfolioBooking[];
    const venueRows = (venueResult.data ?? []) as PortfolioVenueRequest[];
    const sessionRows = (sessionResult.data ?? []) as PortfolioCheckInSession[];
    const attendeeRows = (attendeeResult.data ?? []) as PortfolioAttendee[];
    const sessionsById = new Map(sessionRows.map((session) => [session.id, session.branch_id]));
    const attendance: Record<string, number> = {};
    attendeeRows.forEach((attendee) => {
      const branchId = sessionsById.get(attendee.session_id);
      if (branchId) attendance[branchId] = (attendance[branchId] ?? 0) + 1;
    });

    setBranches(branchRows);
    setEvents(eventRows);
    setBookings(bookingRows);
    setVenueRequests(venueRows);
    setCheckInsByBranch(attendance);
    setError("");
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadPortfolio();
  }, [loadPortfolio]);

  const branchName = (branchId: string | null) =>
    branches.find((branch) => branch.id === branchId)?.name ?? "Unassigned";
  const activities: PortfolioActivity[] = [
    ...events.map((event) => ({
      id: `event:${event.id}`,
      title: event.title,
      branch_id: event.branch_id,
      starts_at: event.starts_at,
      status: event.status,
      type: "Event" as const,
    })),
    ...bookings
      .filter((booking) => booking.rooms)
      .map((booking) => ({
        id: `booking:${booking.id}`,
        title: booking.rooms!.name,
        branch_id: booking.rooms!.branch_id,
        starts_at: booking.starts_at,
        status: booking.status,
        type: "Room booking" as const,
      })),
    ...venueRequests.map((request) => ({
      id: `venue:${request.id}`,
      title: `${request.event_type} · ${request.client_company}`,
      branch_id: request.branch_id,
      starts_at: `${request.event_date}T${request.starts_time}`,
      status: request.status,
      type: "Union Station" as const,
    })),
  ].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const totalCheckIns = Object.values(checkInsByBranch).reduce((sum, count) => sum + count, 0);

  return (
    <div className="mx-auto max-w-350 space-y-5">
      <PageHeader
        eyebrow="Group Operations · Events portfolio"
        title="Events across the group"
        description="Upcoming published events, confirmed room bookings, Union Station events, and recorded check-ins across live branches."
        actions={
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void loadPortfolio()}
            disabled={loading}
            aria-label="Refresh events portfolio"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        }
      />
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          Events portfolio unavailable: {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Live branches"
          value={loading ? "—" : String(branches.length)}
          accent="brand"
        />
        <StatCard
          label="Upcoming events"
          value={loading ? "—" : String(events.length)}
          hint="Published"
        />
        <StatCard
          label="Confirmed bookings"
          value={loading ? "—" : String(bookings.length + venueRequests.length)}
          hint="Rooms and Union Station"
          accent="success"
        />
        <StatCard
          label="Recorded check-ins"
          value={loading ? "—" : new Intl.NumberFormat().format(totalCheckIns)}
          hint="All branches"
        />
      </div>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <Building2 className="size-4 text-brand" />
            Branch activity
          </h2>
        </div>
        {loading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading branch activity…</p>
        ) : branches.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No live branches found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 text-right font-medium">Events</th>
                  <th className="px-4 py-3 text-right font-medium">Room bookings</th>
                  <th className="px-4 py-3 text-right font-medium">Union Station</th>
                  <th className="px-4 py-3 text-right font-medium">Check-ins</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {branches.map((branch) => (
                  <tr key={branch.id}>
                    <td className="px-4 py-3 font-medium">{branch.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {events.filter((event) => event.branch_id === branch.id).length}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {bookings.filter((booking) => booking.rooms?.branch_id === branch.id).length}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {venueRequests.filter((request) => request.branch_id === branch.id).length}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {checkInsByBranch[branch.id] ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <CalendarDays className="size-4 text-brand" />
            Upcoming activity
          </h2>
        </div>
        {loading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading upcoming activity…</p>
        ) : activities.length === 0 ? (
          <div className="grid justify-items-center gap-2 p-8 text-center">
            <Users className="size-7 text-muted-foreground/60" />
            <p className="text-sm font-medium">No upcoming events or bookings</p>
            <p className="text-xs text-muted-foreground">
              New published events and confirmed bookings will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {activities.slice(0, 20).map((activity) => (
              <div
                key={activity.id}
                className="grid gap-1 px-4 py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-4"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{activity.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {branchName(activity.branch_id)} · {activity.type}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(activity.starts_at).toLocaleString()}
                </div>
                <Badge variant="outline">{activity.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

type CheckInEvent = { id: string; title: string; starts_at: string; branch_id: string };
type ManagedBranch = { id: string; name: string };
type EventDraft = {
  title: string;
  kind: string;
  description: string;
  branchId: string;
  startsAt: string;
  endsAt: string;
  capacity: string;
};
type CheckInBooking = {
  id: string;
  branch_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  space_name: string | null;
  request_reference: string | null;
  request_status: string | null;
  rooms: { name: string; branch_id: string } | null;
};
type CheckInUnionRequest = {
  id: string;
  client_company: string;
  event_type: string;
  event_date: string;
  starts_time: string;
  branch_id: string;
};
type CheckInSession = {
  id: string;
  access_code: string;
  event_id: string | null;
  booking_id: string | null;
  union_station_request_id: string | null;
  active: boolean;
  events: { title: string } | null;
  bookings: {
    space_name: string | null;
    request_reference: string | null;
    rooms: { name: string } | null;
  } | null;
  union_station_requests: { event_type: string; client_company: string } | null;
};
type CheckInAttendee = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  company: string | null;
  marketing_consent: boolean;
  checked_in_at: string;
};

function EventCheckInManager({
  roleId,
  assignedBranchIds,
  assignedBranchNames,
}: {
  roleId: string;
  assignedBranchIds: string[];
  assignedBranchNames: string[];
}) {
  const { role } = useRole();
  const [branches, setBranches] = useState<ManagedBranch[]>([]);
  const [eventOptions, setEventOptions] = useState<CheckInEvent[]>([]);
  const [bookingOptions, setBookingOptions] = useState<CheckInBooking[]>([]);
  const [unionRequests, setUnionRequests] = useState<CheckInUnionRequest[]>([]);
  const [sessions, setSessions] = useState<CheckInSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<CheckInSession | null>(null);
  const [attendees, setAttendees] = useState<CheckInAttendee[]>([]);
  const [attendeesLoading, setAttendeesLoading] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [eventDraft, setEventDraft] = useState<EventDraft>({
    title: "",
    kind: "",
    description: "",
    branchId: "",
    startsAt: "",
    endsAt: "",
    capacity: "",
  });
  const [error, setError] = useState<string | null>(null);
  const isGlobalManager = ["group-admin", "group-ceo", "superadmin"].includes(roleId);

  const loadCheckInData = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Check-in management is unavailable because Supabase is not configured.");
      setLoading(false);
      return;
    }
    const now = new Date().toISOString();
    const [branchResult, eventResult, bookingResult, unionRequestResult, sessionResult] =
      await Promise.all([
        supabase.from("branches").select("id,name").eq("status", "live").order("name"),
        supabase
          .from("events")
          .select("id,title,starts_at,branch_id")
          .eq("status", "published")
          .order("starts_at"),
        supabase
          .from("bookings")
          .select(
            "id,branch_id,starts_at,ends_at,status,space_name,request_reference,request_status,rooms(name,branch_id)",
          )
          .or("status.eq.confirmed,request_status.eq.confirmed")
          .gte("ends_at", now)
          .order("starts_at"),
        supabase
          .from("union_station_requests")
          .select("id,client_company,event_type,event_date,starts_time,branch_id")
          .in("status", ["confirmed", "invoiced"])
          .gte("event_date", new Date().toISOString().slice(0, 10))
          .order("event_date"),
        supabase
          .from("event_checkin_sessions")
          .select(
            "id,access_code,event_id,booking_id,union_station_request_id,active,events(title),bookings(space_name,request_reference,rooms(name)),union_station_requests(event_type,client_company)",
          )
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
    if (
      branchResult.error ||
      eventResult.error ||
      bookingResult.error ||
      unionRequestResult.error ||
      sessionResult.error
    ) {
      setError(
        branchResult.error?.message ??
          eventResult.error?.message ??
          bookingResult.error?.message ??
          unionRequestResult.error?.message ??
          sessionResult.error?.message ??
          "Could not load check-in data.",
      );
      setLoading(false);
      return;
    }
    const branchRows = (branchResult.data ?? []) as ManagedBranch[];
    const allowedBranches = isGlobalManager
      ? branchRows
      : branchRows.filter(
          (branch) =>
            assignedBranchIds.includes(branch.id) ||
            assignedBranchNames.some((name) => name.toLowerCase() === branch.name.toLowerCase()),
        );
    setBranches(allowedBranches);
    setEventDraft((current) => ({
      ...current,
      branchId: allowedBranches.some((branch) => branch.id === current.branchId)
        ? current.branchId
        : (allowedBranches[0]?.id ?? ""),
    }));
    const allowedBranchIds = new Set(allowedBranches.map((branch) => branch.id));
    const branchEvents = ((eventResult.data ?? []) as unknown as CheckInEvent[]).filter(
      (event) => isGlobalManager || allowedBranchIds.has(event.branch_id),
    );
    const branchBookings = ((bookingResult.data ?? []) as unknown as CheckInBooking[]).filter(
      (booking) => isGlobalManager || allowedBranchIds.has(booking.branch_id),
    );
    const branchUnionRequests = (
      (unionRequestResult.data ?? []) as unknown as CheckInUnionRequest[]
    ).filter((request) => isGlobalManager || allowedBranchIds.has(request.branch_id));
    setEventOptions(branchEvents);
    setBookingOptions(branchBookings);
    setUnionRequests(branchUnionRequests);
    const loadedSessions = (sessionResult.data ?? []) as unknown as CheckInSession[];
    setSessions(loadedSessions);
    setSelectedTarget(
      (current) =>
        current ||
        (branchEvents[0]
          ? `event:${branchEvents[0].id}`
          : branchBookings[0]
            ? `booking:${branchBookings[0].id}`
            : branchUnionRequests[0]
              ? `union:${branchUnionRequests[0].id}`
              : ""),
    );
    setError(null);
    setLoading(false);
  }, [assignedBranchIds, assignedBranchNames, isGlobalManager]);

  useEffect(() => {
    void loadCheckInData();
  }, [loadCheckInData]);

  const createCode = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !selectedTarget) return;
    const [kind, id] = selectedTarget.split(":");
    setSaving(true);
    const { error: createError } = await supabase.rpc("create_event_checkin_code", {
      p_event_id: kind === "event" ? id : null,
      p_booking_id: kind === "booking" ? id : null,
      p_union_station_request_id: kind === "union" ? id : null,
    });
    setSaving(false);
    if (createError) {
      toast.error(createError.message);
      return;
    }
    toast.success("Check-in QR code created.");
    await loadCheckInData();
  };

  const createEvent = async () => {
    const startsAt = new Date(eventDraft.startsAt);
    const endsAt = eventDraft.endsAt ? new Date(eventDraft.endsAt) : null;
    const capacity = eventDraft.capacity ? Number(eventDraft.capacity) : 0;
    if (!eventDraft.title.trim() || !eventDraft.branchId || !eventDraft.startsAt) {
      toast.error("Add an event title, branch, and start time.");
      return;
    }
    if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) {
      toast.error("Choose a valid future start time.");
      return;
    }
    if (endsAt && (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt)) {
      toast.error("The event end time must be later than its start time.");
      return;
    }
    if (eventDraft.capacity && (!Number.isInteger(capacity) || capacity < 1)) {
      toast.error("Capacity must be a positive whole number.");
      return;
    }
    if (!isGlobalManager && !branches.some((branch) => branch.id === eventDraft.branchId)) {
      toast.error("You can only create events for your assigned branches.");
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      toast.error(userError?.message ?? "Sign in to create an event.");
      return;
    }
    setSaving(true);
    const { data, error: insertError } = await supabase
      .from("events")
      .insert({
        branch_id: eventDraft.branchId,
        title: eventDraft.title.trim(),
        description: eventDraft.description.trim() || null,
        kind: eventDraft.kind.trim() || null,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt?.toISOString() ?? null,
        capacity: capacity || 0,
        status: "published",
        created_by: userData.user.id,
      })
      .select("id")
      .single();
    setSaving(false);
    if (insertError) {
      toast.error(insertError.message);
      return;
    }

    toast.success("Event published. You can now create its check-in QR.");
    setEventDraft((current) => ({
      title: "",
      kind: "",
      description: "",
      branchId: current.branchId,
      startsAt: "",
      endsAt: "",
      capacity: "",
    }));
    setCreateEventOpen(false);
    await loadCheckInData();
    setSelectedTarget(`event:${data.id}`);
  };

  const setSessionActive = async (session: CheckInSession, active: boolean) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error: updateError } = await supabase.rpc("set_event_checkin_active", {
      p_session_id: session.id,
      p_active: active,
    });
    if (updateError) {
      toast.error(updateError.message);
      return;
    }
    setSessions((current) =>
      current.map((item) => (item.id === session.id ? { ...item, active } : item)),
    );
    toast.success(active ? "Check-in code activated." : "Check-in code disabled.");
  };

  const viewAttendance = async (session: CheckInSession) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSelectedSession(session);
    setAttendeesLoading(true);
    const { data, error: attendeeError } = await supabase
      .from("event_attendees")
      .select("id,full_name,email,phone,company,marketing_consent,checked_in_at")
      .eq("session_id", session.id)
      .order("checked_in_at", { ascending: false });
    setAttendeesLoading(false);
    if (attendeeError) {
      toast.error(attendeeError.message);
      setAttendees([]);
      return;
    }
    setAttendees((data ?? []) as CheckInAttendee[]);
  };

  const origin =
    typeof window === "undefined" ? "https://app.officeandco.co.za" : window.location.origin;
  const checkInUrl = (code: string) => `${origin}/checkin/${code}`;
  const downloadQr = async (code: string) => {
    const image = await QRCode.toDataURL(checkInUrl(code), {
      width: 800,
      margin: 2,
      errorCorrectionLevel: "M",
    });
    const link = document.createElement("a");
    link.href = image;
    link.download = `checkin-${code}.png`;
    link.click();
  };

  return (
    <section className="mb-6 border-y py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <QrCode className="size-4 text-brand" />
            Event and room check-in
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create a QR check-in for an upcoming event or confirmed room booking. Attendees are
            recorded and linked to CRM leads.
          </p>
        </div>
        <Badge variant="outline">
          {sessions.filter((session) => session.active).length} active codes
        </Badge>
        {roleId === "branch-manager" && (
          <Dialog open={createEventOpen} onOpenChange={setCreateEventOpen}>
            <DialogTrigger asChild>
              <Button type="button" size="sm" className="gap-1.5">
                <Plus className="size-4" />
                Create event
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create and publish an event</DialogTitle>
                <DialogDescription>
                  Publish the event first, then select it below to create its check-in QR.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="event-title">Event name</Label>
                  <Input
                    id="event-title"
                    value={eventDraft.title}
                    onChange={(event) =>
                      setEventDraft({ ...eventDraft, title: event.target.value })
                    }
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="event-branch">Branch</Label>
                    <Select
                      value={eventDraft.branchId}
                      onValueChange={(branchId) => setEventDraft({ ...eventDraft, branchId })}
                    >
                      <SelectTrigger id="event-branch">
                        <SelectValue placeholder="Choose a branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map((branch) => (
                          <SelectItem key={branch.id} value={branch.id}>
                            {branch.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="event-kind">Event type</Label>
                    <Input
                      id="event-kind"
                      value={eventDraft.kind}
                      onChange={(event) =>
                        setEventDraft({ ...eventDraft, kind: event.target.value })
                      }
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="event-start">Starts</Label>
                    <Input
                      id="event-start"
                      type="datetime-local"
                      value={eventDraft.startsAt}
                      onChange={(event) =>
                        setEventDraft({ ...eventDraft, startsAt: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="event-end">Ends</Label>
                    <Input
                      id="event-end"
                      type="datetime-local"
                      value={eventDraft.endsAt}
                      onChange={(event) =>
                        setEventDraft({ ...eventDraft, endsAt: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="event-capacity">Capacity</Label>
                    <Input
                      id="event-capacity"
                      type="number"
                      min="1"
                      step="1"
                      value={eventDraft.capacity}
                      onChange={(event) =>
                        setEventDraft({ ...eventDraft, capacity: event.target.value })
                      }
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="event-description">Description</Label>
                  <Textarea
                    id="event-description"
                    rows={3}
                    value={eventDraft.description}
                    onChange={(event) =>
                      setEventDraft({ ...eventDraft, description: event.target.value })
                    }
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateEventOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void createEvent()}
                  disabled={saving || !branches.length}
                >
                  {saving ? "Publishing…" : "Publish event"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Select value={selectedTarget} onValueChange={setSelectedTarget}>
          <SelectTrigger className="sm:max-w-xl">
            <SelectValue placeholder="Choose an event or room booking" />
          </SelectTrigger>
          <SelectContent>
            {eventOptions.map((event) => (
              <SelectItem key={`event:${event.id}`} value={`event:${event.id}`}>
                Event · {event.title} · {new Date(event.starts_at).toLocaleDateString()}
              </SelectItem>
            ))}
            {bookingOptions.map((booking) => (
              <SelectItem key={`booking:${booking.id}`} value={`booking:${booking.id}`}>
                Confirmed booking · {booking.space_name ?? booking.rooms?.name ?? "Booked space"}
                {booking.request_reference ? ` · ${booking.request_reference}` : ""} ·{" "}
                {new Date(booking.starts_at).toLocaleDateString()}
              </SelectItem>
            ))}
            {unionRequests.map((request) => (
              <SelectItem key={`union:${request.id}`} value={`union:${request.id}`}>
                Union Station · {request.event_type} · {request.client_company} ·{" "}
                {new Date(request.event_date).toLocaleDateString()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          onClick={() => void createCode()}
          disabled={!selectedTarget || saving}
          className="gap-2"
        >
          <Plus className="size-4" />
          {saving ? "Creating…" : "Create check-in QR"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {!loading &&
        !error &&
        !eventOptions.length &&
        !bookingOptions.length &&
        !unionRequests.length && (
          <p className="mt-3 text-sm text-muted-foreground">
            No published events or upcoming confirmed bookings are available for your branches.
          </p>
        )}

      {sessions.length > 0 && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {sessions.map((session) => {
            const title =
              session.events?.title ??
              (session.union_station_requests
                ? `${session.union_station_requests.event_type} · ${session.union_station_requests.client_company}`
                : null) ??
              session.bookings?.space_name ??
              session.bookings?.rooms?.name ??
              "Check-in session";
            return (
              <div key={session.id} className="flex gap-3 border-t pt-3">
                <CheckInQrImage
                  code={session.access_code}
                  title={title}
                  url={checkInUrl(session.access_code)}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{title}</div>
                  <Badge variant={session.active ? "default" : "secondary"} className="mt-1">
                    {session.active ? "Active" : "Disabled"}
                  </Badge>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Download QR code"
                      aria-label="Download QR code"
                      onClick={() => void downloadQr(session.access_code)}
                    >
                      <Download className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Copy check-in link"
                      aria-label="Copy check-in link"
                      onClick={() => {
                        void navigator.clipboard.writeText(checkInUrl(session.access_code));
                        toast.success("Check-in link copied.");
                      }}
                    >
                      <Copy className="size-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void viewAttendance(session)}
                    >
                      Attendance
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void setSessionActive(session, !session.active)}
                    >
                      {session.active ? "Disable" : "Reactivate"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {selectedSession && (
        <div className="mt-5 border-t pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-sm font-semibold">
              Attendance ·{" "}
              {selectedSession.events?.title ??
                (selectedSession.union_station_requests
                  ? `${selectedSession.union_station_requests.event_type} · ${selectedSession.union_station_requests.client_company}`
                  : null) ??
                selectedSession.bookings?.space_name ??
                selectedSession.bookings?.rooms?.name ??
                "Check-in"}
            </h3>
            <span className="text-xs text-muted-foreground">{attendees.length} checked in</span>
          </div>
          {attendeesLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading attendees…</p>
          ) : attendees.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No attendees have checked in yet.</p>
          ) : (
            <div className="mt-3 divide-y border-y">
              {attendees.map((attendee) => (
                <div
                  key={attendee.id}
                  className="grid gap-1 py-3 text-sm sm:grid-cols-[1fr_1.2fr_0.8fr] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{attendee.full_name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {attendee.company ?? attendee.phone ?? "Company not provided"}
                    </div>
                  </div>
                  <div className="truncate text-xs">{attendee.email}</div>
                  <div className="text-xs text-muted-foreground sm:text-right">
                    {new Date(attendee.checked_in_at).toLocaleString()} ·{" "}
                    {attendee.marketing_consent ? "Updates opted in" : "No marketing opt-in"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function CheckInQrImage({ code, title, url }: { code: string; title: string; url: string }) {
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(url, { width: 240, margin: 2, errorCorrectionLevel: "M" })
      .then((dataUrl) => {
        if (active) setImage(dataUrl);
      })
      .catch(() => {
        if (active) setImage(null);
      });
    return () => {
      active = false;
    };
  }, [url]);

  return image ? (
    <img
      src={image}
      alt={`QR code for ${title}`}
      width={88}
      height={88}
      className="size-[88px] shrink-0 bg-white p-1"
    />
  ) : (
    <div
      className="grid size-[88px] shrink-0 place-items-center bg-muted text-xs text-muted-foreground"
      aria-label={`Generating QR code for ${title}`}
    >
      {code.slice(0, 4)}…
    </div>
  );
}
