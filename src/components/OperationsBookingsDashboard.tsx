import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type RoleDef } from "@/lib/mock";
import { getSupabaseClient } from "@/lib/supabase";

type RelatedBranch = { name: string } | { name: string }[] | null;
type RoomRelation = { name: string } | { name: string }[] | null;

type BookingRow = {
  id: string;
  branch_id: string | null;
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
  branches: RelatedBranch;
  source: "resource";
};

type OperationBooking = {
  id: string;
  branch_id: string | null;
  branch_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  space_name: string;
  request_reference: string | null;
  request_status: string | null;
  invoice_reference: string | null;
  quote_amount_zar: number | null;
  guests: number | null;
};

const relationName = (relation: RelatedBranch | RoomRelation) =>
  Array.isArray(relation) ? relation[0]?.name : relation?.name;

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
  const branchScope = role.id === "branch-manager" ? (role.branchIds ?? []).join(",") : "all";

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
        "id,branch_id,starts_at,ends_at,status,space_name,request_reference,request_status,invoice_reference,quote_amount_zar,guests,branches(name),rooms(name)",
      )
      .order("starts_at", { ascending: false })
      .limit(500);
    let resourceQuery = supabase
      .from("branch_resource_bookings")
      .select(
        "id,branch_id,starts_at,ends_at,status,office_id,desk_id,parking_space_id,equipment_id,branches(name)",
      )
      .order("starts_at", { ascending: false })
      .limit(500);
    if (branchIds) {
      const noBranches = branchIds.length === 0;
      const unknownBranch = "00000000-0000-0000-0000-000000000000";
      roomQuery = roomQuery.in("branch_id", noBranches ? [unknownBranch] : branchIds);
      resourceQuery = resourceQuery.in("branch_id", noBranches ? [unknownBranch] : branchIds);
    }
    const [roomResult, resourceResult] = await Promise.all([roomQuery, resourceQuery]);
    const failure = roomResult.error ?? resourceResult.error;
    if (failure) {
      setError(failure.message);
      setBookings([]);
      setLoading(false);
      return;
    }

    const roomBookings = ((roomResult.data ?? []) as Omit<BookingRow, "source">[]).map(
      (booking): OperationBooking => ({
        id: booking.id,
        branch_id: booking.branch_id,
        branch_name: relationName(booking.branches) ?? "Branch not assigned",
        starts_at: booking.starts_at,
        ends_at: booking.ends_at,
        status: booking.request_status ?? booking.status,
        space_name: booking.space_name ?? relationName(booking.rooms) ?? "Room booking",
        request_reference: booking.request_reference,
        request_status: booking.request_status,
        invoice_reference: booking.invoice_reference,
        quote_amount_zar: booking.quote_amount_zar,
        guests: booking.guests,
      }),
    );
    const resourceBookings = ((resourceResult.data ?? []) as Omit<ResourceBooking, "source">[]).map(
      (booking): OperationBooking => ({
        id: booking.id,
        branch_id: booking.branch_id,
        branch_name: relationName(booking.branches) ?? "Branch not assigned",
        starts_at: booking.starts_at,
        ends_at: booking.ends_at,
        status: booking.status,
        space_name: booking.office_id
          ? "Office resource"
          : booking.desk_id
            ? "Desk resource"
            : booking.parking_space_id
              ? "Parking resource"
              : "Equipment resource",
        request_reference: null,
        request_status: null,
        invoice_reference: null,
        quote_amount_zar: null,
        guests: null,
      }),
    );
    setBookings(
      [...roomBookings, ...resourceBookings].sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
    );
    setError("");
    setLoading(false);
  }, [branchScope]);

  useEffect(() => {
    void loadBookings();
  }, [loadBookings]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return bookings.filter(
      (booking) =>
        new Date(booking.ends_at).getTime() >= now &&
        !["cancelled", "declined"].includes(booking.status),
    );
  }, [bookings]);
  const pending = bookings.filter((booking) =>
    ["held", "requested", "pending_review", "quoted", "invoice_sent"].includes(booking.status),
  );
  const confirmed = bookings.filter((booking) =>
    ["confirmed", "checked_in", "completed"].includes(booking.status),
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
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  {role.id === "group-ceo" ? (
                    <th className="px-4 py-3 font-medium">Branch</th>
                  ) : null}
                  <th className="px-4 py-3 font-medium">Space</th>
                  <th className="px-4 py-3 font-medium">Starts</th>
                  <th className="px-4 py-3 font-medium">Ends</th>
                  <th className="px-4 py-3 text-right font-medium">Guests</th>
                  <th className="px-4 py-3 text-right font-medium">Quote</th>
                  <th className="px-4 py-3 text-right font-medium">Status</th>
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
                    <td className="px-4 py-3 text-xs">
                      {new Date(booking.starts_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {new Date(booking.ends_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{booking.guests ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {booking.quote_amount_zar === null
                        ? "—"
                        : formatZAR(booking.quote_amount_zar)}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
