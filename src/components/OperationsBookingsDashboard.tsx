import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, FileText, ReceiptText, RefreshCw } from "lucide-react";
import { Link } from "@tanstack/react-router";
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type RoleDef } from "@/lib/mock";
import { getSupabaseClient } from "@/lib/supabase";
import { toast } from "sonner";

type RelatedBranch = { name: string } | { name: string }[] | null;
type RoomRelation = { name: string; kind: string } | { name: string; kind: string }[] | null;
type FacilitySpaceRelation =
  { name: string; category: string } | { name: string; category: string }[] | null;

type BookingRow = {
  id: string;
  branch_id: string | null;
  room_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  space_name: string | null;
  request_reference: string | null;
  request_status: string | null;
  invoice_reference: string | null;
  quote_amount_zar: number | null;
  guests: number | null;
  branches: RelatedBranch;
  rooms: RoomRelation;
  source: "room";
};

type ResourceBooking = {
  id: string;
  branch_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  office_id: string | null;
  desk_id: string | null;
  parking_space_id: string | null;
  equipment_id: string | null;
  facility_space_id: string | null;
  quantity: number;
  included_hours_applied: number;
  overage_amount_zar: number;
  event_quote_amount_zar: number | null;
  branches: RelatedBranch;
  facility_spaces: FacilitySpaceRelation;
  source: "resource";
};

type UnionStationRequest = {
  id: string;
  booking_id: string | null;
  reference: string;
  status: string;
  estimate_zar: number;
};

type OperationBooking = {
  id: string;
  branch_id: string | null;
  branch_name: string;
  booking_type: string;
  starts_at: string;
  ends_at: string;
  status: string;
  space_name: string;
  request_reference: string | null;
  request_status: string | null;
  invoice_reference: string | null;
  quote_amount_zar: number | null;
  guests: number | null;
  facility_space_id: string | null;
  facility_space_category: string | null;
  included_hours_applied: number;
  overage_amount_zar: number;
  event_quote_amount_zar: number | null;
  union_station_request_id: string | null;
};

const relationName = (relation: RelatedBranch | RoomRelation) =>
  Array.isArray(relation) ? relation[0]?.name : relation?.name;
const relationKind = (relation: RoomRelation) =>
  Array.isArray(relation) ? relation[0]?.kind : relation?.kind;

const formatZAR = (amount: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(amount);

export function OperationsBookingsDashboard({ role }: { role: RoleDef }) {
  const [bookings, setBookings] = useState<OperationBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quoteBooking, setQuoteBooking] = useState<OperationBooking | null>(null);
  const [quoteAmount, setQuoteAmount] = useState("");
  const [quoteNotes, setQuoteNotes] = useState("");
  const [savingAction, setSavingAction] = useState(false);
  const [includedHours, setIncludedHours] = useState("3");
  const [overageRate, setOverageRate] = useState("450");
  const branchScope = role.id === "branch-manager" ? (role.branchIds ?? []).join(",") : "all";
  const canEditFacilityBookingRules = [
    "superadmin",
    "group-admin",
    "group-ceo",
    "finance",
    "crm-manager",
    "sales-manager",
  ].includes(role.id);
  const canManageBookings = [
    "branch-manager",
    "group-admin",
    "group-ceo",
    "superadmin",
    "crm-manager",
    "sales-manager",
  ].includes(role.id);

  const loadBookings = useCallback(async () => {
    const branchIds = branchScope === "all" ? null : branchScope ? branchScope.split(",") : [];
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Workspace bookings are not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    let roomQuery = supabase
      .from("bookings")
      .select(
        "id,branch_id,room_id,starts_at,ends_at,status,space_name,request_reference,request_status,invoice_reference,quote_amount_zar,guests,branches(name),rooms(name,kind)",
      )
      .order("starts_at", { ascending: false })
      .limit(500);
    let resourceQuery = supabase
      .from("branch_resource_bookings")
      .select(
        "id,branch_id,starts_at,ends_at,status,office_id,desk_id,parking_space_id,equipment_id,facility_space_id,quantity,included_hours_applied,overage_amount_zar,event_quote_amount_zar,branches(name),facility_spaces(name,category)",
      )
      .order("starts_at", { ascending: false })
      .limit(500);
    if (branchIds) {
      const noBranches = branchIds.length === 0;
      const unknownBranch = "00000000-0000-0000-0000-000000000000";
      roomQuery = roomQuery.in("branch_id", noBranches ? [unknownBranch] : branchIds);
      resourceQuery = resourceQuery.in("branch_id", noBranches ? [unknownBranch] : branchIds);
    }
    let unionStationRequestQuery = supabase
      .from("union_station_requests")
      .select("id,booking_id,reference,status,estimate_zar")
      .not("booking_id", "is", null);
    if (branchIds) {
      const noBranches = branchIds.length === 0;
      const unknownBranch = "00000000-0000-0000-0000-000000000000";
      unionStationRequestQuery = unionStationRequestQuery.in(
        "branch_id",
        noBranches ? [unknownBranch] : branchIds,
      );
    }
    const [roomResult, resourceResult, settingsResult, unionStationRequestResult] =
      await Promise.all([
        roomQuery,
        resourceQuery,
        supabase
          .from("facility_booking_settings")
          .select("included_hours_monthly,overage_hourly_zar")
          .eq("id", 1)
          .single(),
        canManageBookings ? unionStationRequestQuery : Promise.resolve(null),
      ]);
    const failure =
      roomResult.error ??
      resourceResult.error ??
      settingsResult.error ??
      unionStationRequestResult?.error;
    if (failure || !settingsResult.data) {
      setError(failure?.message ?? "Facility booking rules are unavailable.");
      setBookings([]);
      setLoading(false);
      return;
    }
    setIncludedHours(String(settingsResult.data.included_hours_monthly));
    setOverageRate(String(settingsResult.data.overage_hourly_zar));

    const unionStationRequestsByBooking = new Map(
      ((unionStationRequestResult?.data ?? []) as UnionStationRequest[])
        .filter((request) => request.booking_id)
        .map((request) => [request.booking_id as string, request]),
    );
    const roomBookings = ((roomResult.data ?? []) as Omit<BookingRow, "source">[]).map(
      (booking): OperationBooking => {
        const venueRequest = unionStationRequestsByBooking.get(booking.id);
        const roomKind = relationKind(booking.rooms);
        const venueQuoteAvailable = venueRequest
          ? ["quoted", "confirmed", "invoiced", "completed"].includes(venueRequest.status)
          : false;
        return {
          id: booking.id,
          branch_id: booking.branch_id,
          branch_name: relationName(booking.branches) ?? "Branch not assigned",
          booking_type: venueRequest
            ? "Union Station event"
            : booking.room_id
              ? (roomKind ?? "Room booking")
              : booking.request_status
                ? "One-off request"
                : "Booking hold",
          starts_at: booking.starts_at,
          ends_at: booking.ends_at,
          status: venueRequest?.status ?? booking.request_status ?? booking.status,
          space_name: booking.space_name ?? relationName(booking.rooms) ?? "Room booking",
          request_reference: venueRequest?.reference ?? booking.request_reference,
          request_status: venueRequest?.status ?? booking.request_status,
          invoice_reference: booking.invoice_reference,
          quote_amount_zar: venueRequest
            ? venueQuoteAvailable
              ? venueRequest.estimate_zar
              : null
            : booking.quote_amount_zar,
          guests: booking.guests,
          facility_space_id: null,
          facility_space_category: null,
          included_hours_applied: 0,
          overage_amount_zar: 0,
          event_quote_amount_zar: null,
          union_station_request_id: venueRequest?.id ?? null,
        };
      },
    );
    const resourceBookings = ((resourceResult.data ?? []) as Omit<ResourceBooking, "source">[]).map(
      (booking): OperationBooking => {
        const facilitySpaceCategory = Array.isArray(booking.facility_spaces)
          ? (booking.facility_spaces[0]?.category ?? null)
          : (booking.facility_spaces?.category ?? null);
        return {
          id: booking.id,
          branch_id: booking.branch_id,
          branch_name: relationName(booking.branches) ?? "Branch not assigned",
          booking_type: booking.facility_space_id
            ? facilitySpaceCategory === "meeting_room"
              ? "Meeting room"
              : "Event space"
            : booking.office_id
              ? "Private office"
              : booking.desk_id
                ? "Desk"
                : booking.parking_space_id
                  ? "Parking"
                  : "Equipment",
          starts_at: booking.starts_at,
          ends_at: booking.ends_at,
          status: booking.status,
          space_name:
            relationName(booking.facility_spaces) ??
            (booking.office_id
              ? "Office resource"
              : booking.desk_id
                ? "Desk resource"
                : booking.parking_space_id
                  ? "Parking resource"
                  : "Equipment resource"),
          request_reference: null,
          request_status: null,
          invoice_reference: null,
          quote_amount_zar: null,
          guests: booking.facility_space_id ? booking.quantity : null,
          facility_space_id: booking.facility_space_id,
          facility_space_category: facilitySpaceCategory,
          included_hours_applied: booking.included_hours_applied,
          overage_amount_zar: booking.overage_amount_zar,
          event_quote_amount_zar: booking.event_quote_amount_zar,
          union_station_request_id: null,
        };
      },
    );
    setBookings(
      [...roomBookings, ...resourceBookings].sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
    );
    setError("");
    setLoading(false);
  }, [branchScope, canManageBookings]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  const saveQuote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!quoteBooking) return;
    const amount = Number(quoteAmount);
    const minimumQuote = quoteBooking.facility_space_id ? 0 : 1;
    if (!Number.isInteger(amount) || amount < minimumQuote || amount > 10_000_000) {
      toast.error(`Enter a whole-number quote between R${minimumQuote} and R10,000,000.`);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSavingAction(true);
    if (quoteBooking.facility_space_id && quoteBooking.facility_space_category !== "meeting_room") {
      const { error: eventQuoteError } = await supabase.rpc("quote_facility_event_booking", {
        p_booking_id: quoteBooking.id,
        p_amount_zar: amount,
      });
      setSavingAction(false);
      if (eventQuoteError) {
        toast.error(`Could not send event-space quote: ${eventQuoteError.message}`);
        return;
      }
      setBookings((current) =>
        current.map((booking) =>
          booking.id === quoteBooking.id
            ? {
                ...booking,
                status: "quoted",
                event_quote_amount_zar: amount,
                quote_amount_zar: amount,
              }
            : booking,
        ),
      );
      setQuoteBooking(null);
      setQuoteAmount("");
      setQuoteNotes("");
      toast.success("Event-space quote sent to the tenant for approval.");
      return;
    }
    const { error: quoteError } = await supabase.rpc("submit_one_off_booking_quote", {
      p_booking_id: quoteBooking.id,
      p_quote_amount_zar: amount,
      p_quote_notes: quoteNotes.trim() || null,
    });
    setSavingAction(false);
    if (quoteError) {
      toast.error(`Could not save quote: ${quoteError.message}`);
      return;
    }
    setBookings((current) =>
      current.map((booking) =>
        booking.id === quoteBooking.id
          ? { ...booking, request_status: "quoted", status: "quoted", quote_amount_zar: amount }
          : booking,
      ),
    );
    setQuoteBooking(null);
    setQuoteAmount("");
    setQuoteNotes("");
    toast.success("Quote saved and sent to Finance for invoicing.");
  };

  const issueInvoice = async (booking: OperationBooking) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSavingAction(true);
    const { data, error: invoiceError } = await supabase.rpc("issue_one_off_booking_invoice", {
      p_booking_id: booking.id,
    });
    setSavingAction(false);
    if (invoiceError) {
      toast.error(`Could not issue invoice: ${invoiceError.message}`);
      return;
    }
    const result = data as { invoice_reference?: string };
    setBookings((current) =>
      current.map((item) =>
        item.id === booking.id
          ? {
              ...item,
              request_status: "invoice_sent",
              status: "invoice_sent",
              invoice_reference: result.invoice_reference ?? item.invoice_reference,
            }
          : item,
      ),
    );
    toast.success(`Invoice ${result.invoice_reference ?? "issued"} and sent to the client.`);
  };

  const reviewFacilityBooking = async (
    booking: OperationBooking,
    decision: "approve" | "decline",
  ) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSavingAction(true);
    const { data, error: reviewError } = await supabase.rpc("review_facility_space_booking", {
      p_booking_id: booking.id,
      p_decision: decision,
    });
    setSavingAction(false);
    if (reviewError) {
      toast.error(`Could not ${decision} booking: ${reviewError.message}`);
      return;
    }
    const result = data as {
      status: string;
      included_hours?: number;
      overage_amount_zar?: number;
      invoice_reference?: string;
    };
    setBookings((current) =>
      current.map((item) =>
        item.id === booking.id
          ? {
              ...item,
              status: result.status,
              included_hours_applied: result.included_hours ?? 0,
              overage_amount_zar: result.overage_amount_zar ?? 0,
            }
          : item,
      ),
    );
    toast.success(
      decision === "approve"
        ? result.overage_amount_zar
          ? `Booking approved. ${result.invoice_reference} was issued for the R${result.overage_amount_zar} overage.`
          : "Booking approved within the tenant's included monthly hours."
        : "Booking declined; the time slot is available again.",
    );
  };

  const saveFacilityBookingRules = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const monthlyHours = Number(includedHours);
    const hourlyRate = Number(overageRate);
    if (!Number.isFinite(monthlyHours) || monthlyHours < 0 || monthlyHours > 1000) {
      toast.error("Enter a monthly allowance between 0 and 1,000 hours.");
      return;
    }
    if (!Number.isInteger(hourlyRate) || hourlyRate < 0 || hourlyRate > 100000) {
      toast.error("Enter a whole-number overage rate between R0 and R100,000 per hour.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSavingAction(true);
    const { error: settingsError } = await supabase
      .from("facility_booking_settings")
      .update({
        included_hours_monthly: monthlyHours,
        overage_hourly_zar: hourlyRate,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    setSavingAction(false);
    if (settingsError) {
      toast.error(`Could not update room booking rules: ${settingsError.message}`);
      return;
    }
    toast.success("Monthly room allowance and overage rate updated.");
  };

  const upcoming = useMemo(() => {
    const now = Date.now();
    return bookings.filter(
      (booking) =>
        new Date(booking.ends_at).getTime() >= now &&
        !["cancelled", "declined"].includes(booking.status),
    );
  }, [bookings]);
  const pending = bookings.filter((booking) =>
    [
      "held",
      "requested",
      "pending_review",
      "submitted",
      "in_review",
      "quoted",
      "invoice_sent",
    ].includes(booking.status),
  );
  const confirmed = bookings.filter((booking) =>
    ["confirmed", "checked_in", "invoiced", "completed"].includes(booking.status),
  );

  return (
    <div className="mx-auto max-w-350 space-y-5">
      <PageHeader
        eyebrow={
          role.id === "group-ceo" ? "Group Operations · Bookings" : "Branch Operations · Bookings"
        }
        title={role.id === "group-ceo" ? "Cross-branch bookings" : "Branch booking activity"}
        description={
          role.id === "group-ceo"
            ? "Live room and resource bookings across active branches."
            : "Live booking activity for your assigned branches."
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadBookings()}
            disabled={loading}
            aria-label="Refresh bookings"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        }
      />
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          Booking data unavailable: {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Upcoming"
          value={loading ? "—" : String(upcoming.length)}
          hint="Not cancelled or declined"
          accent="brand"
        />
        <StatCard
          label="Awaiting action"
          value={loading ? "—" : String(pending.length)}
          hint="Requests, quotes, and held bookings"
          accent={pending.length ? "warning" : "success"}
        />
        <StatCard
          label="Confirmed or completed"
          value={loading ? "—" : String(confirmed.length)}
          hint="Database status records"
        />
        <StatCard
          label="All records"
          value={loading ? "—" : String(bookings.length)}
          hint="Room and resource bookings"
        />
      </div>

      {canEditFacilityBookingRules ? (
        <form
          onSubmit={(event) => void saveFacilityBookingRules(event)}
          className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4"
        >
          <div className="mr-auto">
            <h2 className="text-sm font-semibold">Tenant meeting-space allowance</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Applies across branches per tenant organization and resets each calendar month.
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="facility-booking-included-hours">Included hours / month</Label>
            <Input
              id="facility-booking-included-hours"
              type="number"
              min="0"
              max="1000"
              step="0.5"
              value={includedHours}
              onChange={(event) => setIncludedHours(event.target.value)}
              className="w-36"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="facility-booking-overage-rate">Overage / hour (R)</Label>
            <Input
              id="facility-booking-overage-rate"
              type="number"
              min="0"
              max="100000"
              step="1"
              value={overageRate}
              onChange={(event) => setOverageRate(event.target.value)}
              className="w-36"
            />
          </div>
          <Button type="submit" disabled={savingAction}>
            Save rules
          </Button>
        </form>
      ) : null}

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="font-display text-base font-semibold">Live booking schedule</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Bookings are read from the workspace database; no sample schedule is shown.
          </p>
        </div>
        {loading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading booking records…</p>
        ) : bookings.length === 0 ? (
          <div className="grid justify-items-center gap-2 p-10 text-center">
            <CalendarDays className="size-7 text-muted-foreground/60" />
            <p className="text-sm font-medium">No booking records found</p>
            <p className="text-xs text-muted-foreground">
              The current role scope has no room or resource bookings.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  {role.id === "group-ceo" ? (
                    <th className="px-4 py-3 font-medium">Branch</th>
                  ) : null}
                  <th className="px-4 py-3 font-medium">Space</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Starts</th>
                  <th className="px-4 py-3 font-medium">Ends</th>
                  <th className="px-4 py-3 text-right font-medium">Guests</th>
                  <th className="px-4 py-3 text-right font-medium">Quote / charge</th>
                  <th className="px-4 py-3 text-right font-medium">Status</th>
                  {canManageBookings ? (
                    <th className="px-4 py-3 text-right font-medium">Actions</th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y">
                {bookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs">
                      {booking.request_reference ??
                        booking.invoice_reference ??
                        booking.id.slice(0, 8)}
                    </td>
                    {role.id === "group-ceo" ? (
                      <td className="px-4 py-3">{booking.branch_name}</td>
                    ) : null}
                    <td className="px-4 py-3 font-medium">{booking.space_name}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{booking.booking_type}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {new Date(booking.starts_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {new Date(booking.ends_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{booking.guests ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {booking.quote_amount_zar !== null
                        ? formatZAR(booking.quote_amount_zar)
                        : booking.event_quote_amount_zar !== null
                          ? formatZAR(booking.event_quote_amount_zar)
                          : booking.facility_space_id && booking.status === "confirmed"
                            ? formatZAR(booking.overage_amount_zar)
                            : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge
                        variant={
                          ["declined", "cancelled"].includes(booking.status)
                            ? "secondary"
                            : ["confirmed", "completed"].includes(booking.status)
                              ? "default"
                              : "outline"
                        }
                      >
                        {booking.status.replaceAll("_", " ")}
                      </Badge>
                    </td>
                    {canManageBookings ? (
                      <td className="px-4 py-3 text-right">
                        {booking.union_station_request_id ? (
                          <Button asChild size="sm" variant="outline">
                            <Link
                              to="/union-station-admin"
                              search={{ requestId: booking.union_station_request_id }}
                            >
                              Open event
                            </Link>
                          </Button>
                        ) : booking.facility_space_id &&
                          booking.facility_space_category !== "meeting_room" &&
                          booking.status === "requested" ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setQuoteBooking(booking);
                                setQuoteAmount("");
                                setQuoteNotes("");
                              }}
                            >
                              Quote
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void reviewFacilityBooking(booking, "decline")}
                              disabled={savingAction}
                            >
                              Decline
                            </Button>
                          </div>
                        ) : booking.facility_space_id && booking.status === "requested" ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              onClick={() => void reviewFacilityBooking(booking, "approve")}
                              disabled={savingAction}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void reviewFacilityBooking(booking, "decline")}
                              disabled={savingAction}
                            >
                              Decline
                            </Button>
                          </div>
                        ) : booking.request_status === "pending_review" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setQuoteBooking(booking);
                              setQuoteAmount("");
                              setQuoteNotes("");
                            }}
                          >
                            <FileText className="mr-1.5 size-4" />
                            Quote
                          </Button>
                        ) : booking.request_status === "quoted" ? (
                          <Button
                            size="sm"
                            onClick={() => void issueInvoice(booking)}
                            disabled={savingAction}
                          >
                            <ReceiptText className="mr-1.5 size-4" />
                            Issue invoice
                          </Button>
                        ) : booking.request_status === "invoice_sent" ? (
                          <span className="text-xs text-muted-foreground">Invoice sent</span>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Dialog open={quoteBooking !== null} onOpenChange={(open) => !open && setQuoteBooking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {quoteBooking?.facility_space_id &&
              quoteBooking.facility_space_category !== "meeting_room"
                ? "Quote event-space booking"
                : "Prepare booking quote"}
            </DialogTitle>
            <DialogDescription>
              {quoteBooking?.request_reference} · {quoteBooking?.space_name} ·{" "}
              {quoteBooking ? new Date(quoteBooking.starts_at).toLocaleDateString() : ""}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void saveQuote(event)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="booking-quote-amount">Quote amount (ZAR)</Label>
              <Input
                id="booking-quote-amount"
                type="number"
                min={quoteBooking?.facility_space_id ? "0" : "1"}
                max="10000000"
                step="1"
                required
                value={quoteAmount}
                onChange={(event) => setQuoteAmount(event.target.value)}
              />
            </div>
            {!quoteBooking?.facility_space_id ? (
              <div className="space-y-2">
                <Label htmlFor="booking-quote-notes">Quote notes</Label>
                <Textarea
                  id="booking-quote-notes"
                  maxLength={2000}
                  value={quoteNotes}
                  onChange={(event) => setQuoteNotes(event.target.value)}
                />
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setQuoteBooking(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingAction}>
                {savingAction
                  ? "Saving…"
                  : quoteBooking?.facility_space_id
                    ? "Send quote"
                    : "Save quote"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
