import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CalendarHeart } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase";
import { useRole } from "@/lib/role-context";

export const Route = createFileRoute("/union-station")({
  head: () => ({ meta: [{ title: "Union Station Bookings — WorkspaceOS" }] }),
  component: PublicUnionStation,
});

type CalendarEvent = {
  id: string;
  date: string;
  start: string;
  end: string;
  status: "Confirmed" | "Invoiced" | "Completed";
};

function PublicUnionStation() {
  const { role, isLoading } = useRole();
  const navigate = useNavigate();
  const assignedBranches = role.branchNames?.length ? role.branchNames : [role.branch ?? ""];
  const isUnauthorizedBranchManager =
    role.id === "branch-manager" &&
    !assignedBranches.some((branch) => branch.trim().toLowerCase() === "kyalami");
  const [bookings, setBookings] = useState<CalendarEvent[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [availabilityError, setAvailabilityError] = useState("");
  const [requestReference, setRequestReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState("request");
  const [form, setForm] = useState({
    client: "",
    contact: "",
    email: "",
    eventType: "",
    date: "",
    start: "",
    end: "",
    attendees: "",
    layout: "",
    catering: "",
    avRequirements: "",
    notes: "",
  });

  useEffect(() => {
    if (isLoading) return;
    if (role.id === "group-ceo") {
      void navigate({ to: "/union-station-admin", replace: true });
    } else if (isUnauthorizedBranchManager) {
      void navigate({ to: "/facilities", replace: true });
    }
  }, [isLoading, isUnauthorizedBranchManager, role.id, navigate]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    let active = true;

    const loadAvailability = async () => {
      if (!supabase) {
        setAvailabilityError("Availability is unavailable because the booking service is not configured.");
        setAvailabilityLoading(false);
        return;
      }

      const { data, error } = await supabase.rpc("get_public_union_station_calendar", {
        p_from: new Date().toISOString().slice(0, 10),
      });
      if (!active) return;

      if (error) {
        setAvailabilityError("Availability could not be loaded. Please try again later.");
        setBookings([]);
      } else {
        const rows = (data ?? []) as Array<{
          reference: string;
          event_date: string;
          starts_time: string;
          ends_time: string;
          status: string;
        }>;
        setBookings(rows.map((row): CalendarEvent => ({
          id: row.reference,
          date: row.event_date,
          start: row.starts_time.slice(0, 5),
          end: row.ends_time.slice(0, 5),
          status: row.status === "invoiced" ? "Invoiced" : row.status === "completed" ? "Completed" : "Confirmed",
        })));
        setAvailabilityError("");
      }
      setAvailabilityLoading(false);
    };

    void loadAvailability();
    return () => { active = false; };
  }, []);

  const conflicts = useMemo(
    () => bookings.filter((booking) => booking.date === form.date && booking.status !== "Completed"),
    [bookings, form.date],
  );
  const upcomingBookings = bookings.filter((booking) => booking.status === "Confirmed" || booking.status === "Invoiced");

  const submit = async () => {
    const attendees = Number(form.attendees);
    if (!form.client.trim() || !form.contact.trim() || !form.email.trim() || !form.eventType.trim() ||
      !form.date || !form.start || !form.end || !Number.isInteger(attendees) || attendees < 1) {
      toast.error("Complete the required event, contact, date, time and attendee fields.");
      return;
    }
    if (form.end <= form.start) {
      toast.error("The end time must be later than the start time.");
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Union Station requests are temporarily unavailable.");
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.rpc("submit_public_union_station_request", {
      p_client_company: form.client.trim(),
      p_contact_name: form.contact.trim(),
      p_contact_email: form.email.trim(),
      p_contact_phone: null,
      p_event_type: form.eventType.trim(),
      p_event_date: form.date,
      p_starts_time: form.start,
      p_ends_time: form.end,
      p_attendees: attendees,
      p_layout: form.layout.trim() || "To be discussed",
      p_catering: form.catering.trim() || "To be discussed",
      p_av_addons: form.avRequirements.split(",").map((item) => item.trim()).filter(Boolean),
      p_notes: form.notes.trim() || null,
      p_estimate_zar: 0,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    const result = data as { reference: string };
    setRequestReference(result.reference);
    toast.success(`Enquiry ${result.reference} submitted.`);
  };

  const renderAvailability = (items: CalendarEvent[], emptyMessage: string) => {
    if (availabilityLoading) return <p className="py-8 text-center text-sm text-muted-foreground">Loading availability…</p>;
    if (availabilityError) return <p role="alert" className="py-4 text-sm text-destructive">{availabilityError}</p>;
    if (!items.length) return <p className="py-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>;

    return (
      <div className="space-y-2">
        {items.map((booking) => (
          <div key={booking.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-card p-3">
            <div>
              <div className="text-sm font-medium">{new Date(`${booking.date}T12:00:00`).toLocaleDateString(undefined, { dateStyle: "medium" })}</div>
              <div className="text-[11px] text-muted-foreground">Unavailable · {booking.start}–{booking.end}</div>
            </div>
            <Badge variant="outline">{booking.status}</Badge>
          </div>
        ))}
      </div>
    );
  };

  if (role.id === "group-ceo") return null;

  if (isLoading || isUnauthorizedBranchManager || role.id === "group-ceo") return null;

  return (
    <div className="mx-auto max-w-350">
      <PageHeader
        eyebrow="Union Station · Event bookings"
        title="Book your event or meeting"
        description="Send an event enquiry to request availability and a quote. Confirmed bookings appear in the availability calendar."
        actions={<Button size="sm" className="gap-1.5" onClick={() => setTab("request")}><CalendarHeart className="size-4" />Request a quote</Button>}
      />

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
                <div className="space-y-1.5">
                  <Label>Client / Company</Label>
                  <Input value={form.client} onChange={(event) => setForm({ ...form, client: event.target.value })} autoComplete="organization" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Event type</Label>
                  <Input value={form.eventType} onChange={(event) => setForm({ ...form, eventType: event.target.value })} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Primary contact</Label>
                  <Input value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} autoComplete="name" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required />
                </div>
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" min={new Date().toISOString().slice(0, 10)} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>Start</Label>
                    <Input type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End</Label>
                    <Input type="time" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Expected attendees</Label>
                  <Input type="number" min={1} step={1} value={form.attendees} onChange={(event) => setForm({ ...form, attendees: event.target.value })} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Layout preference</Label>
                  <Input value={form.layout} onChange={(event) => setForm({ ...form, layout: event.target.value })} placeholder="Optional" />
                </div>
                <div className="space-y-1.5">
                  <Label>Catering requirements</Label>
                  <Input value={form.catering} onChange={(event) => setForm({ ...form, catering: event.target.value })} placeholder="Optional" />
                </div>
                <div className="space-y-1.5">
                  <Label>AV and production requirements</Label>
                  <Input value={form.avRequirements} onChange={(event) => setForm({ ...form, avRequirements: event.target.value })} placeholder="Optional; separate items with commas" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Notes for the events team</Label>
                <Textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
              </div>

              {requestReference && <div role="status" className="rounded-md border border-success/30 bg-success/10 p-3 text-sm">Enquiry {requestReference} was submitted. It is not a confirmed booking.</div>}

              {conflicts.length > 0 && (
                <div className="flex items-start gap-2.5 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs">
                  <AlertCircle className="size-4 text-warning shrink-0 mt-px" />
                  <div>
                    <div className="font-medium text-warning">Possible conflict on {form.date}</div>
                    <div className="text-foreground/80">A confirmed booking already exists on this date. Availability for the requested time must be verified.</div>
                  </div>
                </div>
              )}
            </div>

            <aside className="card-soft p-6 h-fit sticky top-20">
              <div className="text-[11px] uppercase tracking-wider text-brand font-medium mb-2">Quote</div>
              <div className="font-display text-2xl font-semibold">Prepared on request</div>
              <div className="text-xs text-muted-foreground mt-2">Pricing and availability are confirmed after your requirements are reviewed.</div>
              <Button className="w-full mt-5 gap-1.5" disabled={submitting} onClick={() => void submit()}>
                <CalendarHeart className="size-4" />{submitting ? "Submitting…" : "Submit enquiry"}
              </Button>
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="calendar">
          <div className="card-soft p-5">
            <div className="text-sm font-medium mb-3">Confirmed availability</div>
            {renderAvailability(bookings, "No confirmed bookings are listed for upcoming dates.")}
          </div>
        </TabsContent>

        <TabsContent value="upcoming">
          <div className="card-soft p-5">
            <div className="text-sm font-medium mb-3">Upcoming confirmed bookings</div>
            {renderAvailability(upcomingBookings, "No upcoming bookings are listed.")}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
