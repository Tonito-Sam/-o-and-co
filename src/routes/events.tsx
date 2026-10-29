import { createFileRoute } from "@tanstack/react-router";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSupabaseClient } from "@/lib/supabase";
import { useRole } from "@/lib/role-context";
import { Copy, Download, Plus, QrCode } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/events")({
  head: () => ({ meta: [{ title: "Events — WorkspaceOS" }] }),
  component: Events,
});

function Events() {
  const { role, assignedBranchIds } = useRole();
  const canManageCheckIn = [
    "branch-manager",
    "community-manager",
    "group-admin",
    "group-ceo",
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
        <EventCheckInManager roleId={role.id} assignedBranchIds={assignedBranchIds} />
      )}
      {!canManageCheckIn && (
        <p className="text-sm text-muted-foreground">
          Attendance management is available to branch managers and event managers.
        </p>
      )}
    </div>
  );
}

type CheckInEvent = { id: string; title: string; starts_at: string; branch_id: string };
type CheckInBooking = {
  id: string;
  starts_at: string;
  ends_at: string;
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
  bookings: { rooms: { name: string } | null } | null;
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
}: {
  roleId: string;
  assignedBranchIds: string[];
}) {
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
    const [eventResult, bookingResult, unionRequestResult, sessionResult] = await Promise.all([
      supabase
        .from("events")
        .select("id,title,starts_at,branch_id")
        .eq("status", "published")
        .order("starts_at"),
      supabase
        .from("bookings")
        .select("id,starts_at,ends_at,rooms!inner(name,branch_id)")
        .eq("status", "confirmed")
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
          "id,access_code,event_id,booking_id,union_station_request_id,active,events(title),bookings(rooms(name)),union_station_requests(event_type,client_company)",
        )
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    if (
      eventResult.error ||
      bookingResult.error ||
      unionRequestResult.error ||
      sessionResult.error
    ) {
      setError(
        eventResult.error?.message ??
          bookingResult.error?.message ??
          unionRequestResult.error?.message ??
          sessionResult.error?.message ??
          "Could not load check-in data.",
      );
      setLoading(false);
      return;
    }
    const branchEvents = ((eventResult.data ?? []) as unknown as CheckInEvent[]).filter(
      (event) => isGlobalManager || assignedBranchIds.includes(event.branch_id),
    );
    const branchBookings = ((bookingResult.data ?? []) as unknown as CheckInBooking[]).filter(
      (booking) =>
        booking.rooms && (isGlobalManager || assignedBranchIds.includes(booking.rooms.branch_id)),
    );
    const branchUnionRequests = (
      (unionRequestResult.data ?? []) as unknown as CheckInUnionRequest[]
    ).filter((request) => isGlobalManager || assignedBranchIds.includes(request.branch_id));
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
  }, [assignedBranchIds, isGlobalManager]);

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
    typeof window === "undefined" ? "https://workspace.officeandco.co.za" : window.location.origin;
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
                Room · {booking.rooms?.name} · {new Date(booking.starts_at).toLocaleDateString()}
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
