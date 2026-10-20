import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  Check,
  Clock3,
  Coffee,
  DoorOpen,
  LifeBuoy,
  LoaderCircle,
  MapPin,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseClient } from "@/lib/supabase";
import { formatZAR } from "@/lib/mock";

type Branch = { id: string; name: string; city: string | null; status: string };
type OrganizationContext = { userId: string; organizationId: string; branchId: string };
type ResourceType = "room" | "office" | "desk" | "parking" | "equipment";
type Resource = {
  id: string;
  branchId: string;
  name: string;
  type: ResourceType;
  detail: string;
  rate: number;
  ratePeriod: "hour" | "month";
};
type InvoiceRow = {
  id: string;
  reference: string;
  amount_zar: number;
  status: string;
  issued_at: string;
  due_at: string;
  paid_at: string | null;
  metadata: Record<string, unknown> | null;
};
type TicketRow = {
  id: string;
  reference: string | null;
  subject: string;
  body: string | null;
  priority: string;
  status: string;
  created_at: string;
};

async function getOrganizationContext(): Promise<OrganizationContext> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Workspace data is not configured.");
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error(authError?.message || "Sign in to continue.");
  const { data: membership, error } = await supabase
    .from("organization_members")
    .select("organization_id,branch_id")
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (error || !membership) throw new Error(error?.message || "No active organization was found.");
  return {
    userId: auth.user.id,
    organizationId: membership.organization_id,
    branchId: membership.branch_id,
  };
}

async function getLiveBranches() {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Workspace data is not configured.");
  const { data, error } = await supabase
    .from("branches")
    .select("id,name,city,status")
    .eq("status", "live")
    .order("name");
  if (error) throw error;
  return (data ?? []) as Branch[];
}

async function getBranchResources(branchId: string): Promise<Resource[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Workspace data is not configured.");
  const [sectionsResult, roomsResult, officesResult, desksResult, parkingResult, equipmentResult] =
    await Promise.all([
      supabase
        .from("branch_sections")
        .select("section_key")
        .eq("branch_id", branchId)
        .eq("enabled", true),
      supabase
        .from("rooms")
        .select("id,branch_id,name,kind,capacity,hourly_zar,is_active")
        .eq("branch_id", branchId)
        .eq("is_active", true),
      supabase
        .from("branch_offices")
        .select("id,branch_id,name,capacity,monthly_zar,status")
        .eq("branch_id", branchId)
        .eq("status", "available"),
      supabase
        .from("branch_desks")
        .select("id,branch_id,name,desk_type,monthly_zar,status")
        .eq("branch_id", branchId)
        .eq("status", "available"),
      supabase
        .from("branch_parking_spaces")
        .select("id,branch_id,name,parking_type,monthly_zar,status")
        .eq("branch_id", branchId)
        .eq("status", "available"),
      supabase
        .from("branch_equipment")
        .select("id,branch_id,name,category,available_quantity,hourly_zar,is_active")
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .gt("available_quantity", 0),
    ]);
  const results = [
    sectionsResult,
    roomsResult,
    officesResult,
    desksResult,
    parkingResult,
    equipmentResult,
  ];
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
  const enabled = new Set((sectionsResult.data ?? []).map((section) => section.section_key));
  const resources: Resource[] = [];
  if (enabled.has("rooms"))
    for (const item of roomsResult.data ?? [])
      resources.push({
        id: item.id,
        branchId: item.branch_id,
        name: item.name,
        type: "room",
        detail: `${item.kind} · capacity ${item.capacity}`,
        rate: item.hourly_zar ?? 0,
        ratePeriod: "hour",
      });
  if (enabled.has("offices"))
    for (const item of officesResult.data ?? [])
      resources.push({
        id: item.id,
        branchId: item.branch_id,
        name: item.name,
        type: "office",
        detail: `Private office · ${item.capacity} desks`,
        rate: item.monthly_zar ?? 0,
        ratePeriod: "month",
      });
  if (enabled.has("desks"))
    for (const item of desksResult.data ?? [])
      resources.push({
        id: item.id,
        branchId: item.branch_id,
        name: item.name,
        type: "desk",
        detail: item.desk_type.replaceAll("_", " "),
        rate: item.monthly_zar ?? 0,
        ratePeriod: "month",
      });
  if (enabled.has("parking"))
    for (const item of parkingResult.data ?? [])
      resources.push({
        id: item.id,
        branchId: item.branch_id,
        name: item.name,
        type: "parking",
        detail: item.parking_type.replaceAll("_", " "),
        rate: item.monthly_zar ?? 0,
        ratePeriod: "month",
      });
  if (enabled.has("equipment"))
    for (const item of equipmentResult.data ?? [])
      resources.push({
        id: item.id,
        branchId: item.branch_id,
        name: item.name,
        type: "equipment",
        detail: `${item.category} · ${item.available_quantity} available`,
        rate: item.hourly_zar ?? 0,
        ratePeriod: "hour",
      });
  return resources;
}

const resourceLabel: Record<ResourceType, string> = {
  room: "Room",
  office: "Private office",
  desk: "Desk",
  parking: "Parking",
  equipment: "Equipment",
};
const resourceOptionGroups: { type: ResourceType; label: string; emptyLabel: string }[] = [
  { type: "room", label: "Rooms", emptyLabel: "No rooms currently listed" },
  { type: "office", label: "Private offices", emptyLabel: "No private offices currently listed" },
  { type: "desk", label: "Desks", emptyLabel: "No desks currently listed" },
  { type: "parking", label: "Parking", emptyLabel: "No parking spaces currently listed" },
  { type: "equipment", label: "Equipment", emptyLabel: "No equipment currently listed" },
];

export function OrganizationFacilitiesView() {
  const navigate = useNavigate();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | ResourceType>("all");
  useEffect(() => {
    let active = true;
    void Promise.all([getOrganizationContext(), getLiveBranches()])
      .then(([context, liveBranches]) => {
        if (!active) return;
        setBranches(liveBranches);
        setBranchId(
          liveBranches.some((branch) => branch.id === context.branchId)
            ? context.branchId
            : (liveBranches[0]?.id ?? ""),
        );
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Could not load facilities.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!branchId) return;
    let active = true;
    setLoading(true);
    void getBranchResources(branchId)
      .then((items) => {
        if (active) setResources(items);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "Could not load branch availability.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [branchId]);

  const visibleResources = useMemo(
    () => (filter === "all" ? resources : resources.filter((resource) => resource.type === filter)),
    [resources, filter],
  );
  const bookResource = (resource: Resource) => {
    sessionStorage.setItem(
      "woos.booking-selection",
      JSON.stringify({ branchId, resourceId: resource.id, resourceType: resource.type }),
    );
    void navigate({ to: "/bookings" });
  };

  return (
    <div className="mx-auto max-w-350">
      <PageHeader
        eyebrow="Your Office & Co workspace"
        title="Facilities"
        description="Explore available rooms, offices, desks, parking, and equipment at live branches."
      />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(["all", "room", "office", "desk", "parking", "equipment"] as const).map((type) => (
            <Button
              key={type}
              size="sm"
              variant={filter === type ? "default" : "outline"}
              onClick={() => setFilter(type)}
            >
              {type === "all" ? "All facilities" : `${resourceLabel[type]}s`}
            </Button>
          ))}
        </div>
        <select
          aria-label="Branch"
          value={branchId}
          onChange={(event) => setBranchId(event.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
              {branch.city ? ` · ${branch.city}` : ""}
            </option>
          ))}
        </select>
      </div>
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
          Loading live availability…
        </div>
      ) : visibleResources.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleResources.map((resource) => (
            <Card
              key={`${resource.type}-${resource.id}`}
              className="flex flex-col p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-10 place-items-center rounded-lg bg-brand/10 text-brand">
                  <DoorOpen className="size-5" />
                </span>
                <Badge variant="secondary">Available</Badge>
              </div>
              <div className="mt-4 font-display text-lg font-semibold">{resource.name}</div>
              <p className="mt-1 text-sm capitalize text-muted-foreground">{resource.detail}</p>
              <div className="mt-auto flex items-end justify-between gap-3 pt-5">
                <div className="text-sm font-semibold">
                  {formatZAR(resource.rate)}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    / {resource.ratePeriod}
                  </span>
                </div>
                <Button size="sm" onClick={() => bookResource(resource)}>
                  Book
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center">
          <div className="mx-auto grid size-11 place-items-center rounded-full bg-muted">
            <MapPin className="size-5 text-muted-foreground" />
          </div>
          <h2 className="mt-3 font-display text-lg font-semibold">No available facilities</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Try another branch or check back later.
          </p>
        </Card>
      )}
    </div>
  );
}

export function OrganizationBookingsView() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState("");
  const [startsAt, setStartsAt] = useState(() =>
    new Date(Date.now() + 3600000).toISOString().slice(0, 16),
  );
  const [endsAt, setEndsAt] = useState(() =>
    new Date(Date.now() + 7200000).toISOString().slice(0, 16),
  );
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [ownBookings, setOwnBookings] = useState<
    Array<{ id: string; starts_at: string; ends_at: string; status: string; notes: string | null }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([getOrganizationContext(), getLiveBranches()])
      .then(async ([context, liveBranches]) => {
        if (!active) return;
        setBranches(liveBranches);
        const initial = liveBranches.find((branch) => branch.id === context.branchId)
          ? context.branchId
          : (liveBranches[0]?.id ?? "");
        const saved = sessionStorage.getItem("woos.booking-selection");
        const selection = saved
          ? (JSON.parse(saved) as {
              branchId?: string;
              resourceId?: string;
              resourceType?: ResourceType;
            })
          : null;
        const nextBranch =
          selection?.branchId && liveBranches.some((branch) => branch.id === selection.branchId)
            ? selection.branchId
            : initial;
        setBranchId(nextBranch);
        if (selection?.resourceId) setSelectedResourceId(selection.resourceId);
        const supabase = getSupabaseClient();
        const { data: membership } = await supabase!
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", context.userId)
          .eq("status", "active")
          .maybeSingle();
        if (membership) {
          const { data: invoices } = await supabase!
            .from("invoices")
            .select("booking_id,resource_booking_id")
            .eq("organization_id", membership.organization_id);
          const invoiceBookingIds = new Set(
            (invoices ?? []).map((invoice) => invoice.booking_id).filter(Boolean),
          );
          const invoiceResourceIds = new Set(
            (invoices ?? []).map((invoice) => invoice.resource_booking_id).filter(Boolean),
          );
          const [rooms, resourcesForOrg] = await Promise.all([
            supabase!
              .from("bookings")
              .select("id,starts_at,ends_at,status,notes")
              .eq("booked_by", context.userId)
              .order("starts_at", { ascending: false })
              .limit(20),
            supabase!
              .from("branch_resource_bookings")
              .select("id,starts_at,ends_at,status,notes")
              .eq("organization_id", membership.organization_id)
              .order("starts_at", { ascending: false })
              .limit(20),
          ]);
          if (active)
            setOwnBookings(
              [
                ...(rooms.data ?? []).filter((booking) => invoiceBookingIds.has(booking.id)),
                ...(resourcesForOrg.data ?? []).filter((booking) =>
                  invoiceResourceIds.has(booking.id),
                ),
              ].sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
            );
        }
        if (active) setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : "Could not load booking workspace.");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!branchId) return;
    let active = true;
    void getBranchResources(branchId)
      .then((items) => {
        if (active) setResources(items);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "Could not load branch facilities.");
      });
    return () => {
      active = false;
    };
  }, [branchId]);

  const selectedResource = resources.find((resource) => resource.id === selectedResourceId) ?? null;
  const quantityValue = Math.max(1, Number.parseInt(quantity, 10) || 1);
  const durationHours =
    startsAt && endsAt
      ? Math.max(
          1,
          Math.ceil((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 3600000),
        )
      : 1;
  const estimate = selectedResource
    ? selectedResource.ratePeriod === "hour"
      ? selectedResource.rate * durationHours * quantityValue
      : selectedResource.rate * quantityValue
    : 0;

  const submitBooking = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedResource) {
      toast.error("Choose an available facility.");
      return;
    }
    if (new Date(endsAt) <= new Date(startsAt)) {
      toast.error("End time must be after start time.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSubmitting(true);
    const { data, error: requestError } = await supabase.rpc(
      "request_organization_resource_booking",
      {
        p_branch_id: branchId,
        p_resource_type: selectedResource.type,
        p_resource_id: selectedResource.id,
        p_starts_at: new Date(startsAt).toISOString(),
        p_ends_at: new Date(endsAt).toISOString(),
        p_quantity: quantityValue,
        p_notes: notes.trim() || null,
      },
    );
    setSubmitting(false);
    if (requestError) {
      toast.error(requestError.message);
      return;
    }
    sessionStorage.removeItem("woos.booking-selection");
    const invoice = data as { reference: string; amount_zar: number };
    toast.success(`Booking request submitted. Invoice ${invoice.reference} is ready in Billing.`);
    const context = await getOrganizationContext();
    const supabaseAgain = getSupabaseClient();
    const { data: existingInvoices } = await supabaseAgain!
      .from("invoices")
      .select("booking_id,resource_booking_id")
      .eq("organization_id", context.organizationId);
    const ids = new Set(
      (existingInvoices ?? [])
        .map((item) => item.booking_id ?? item.resource_booking_id)
        .filter(Boolean),
    );
    const [rooms, resourcesForOrg] = await Promise.all([
      supabaseAgain!
        .from("bookings")
        .select("id,starts_at,ends_at,status,notes")
        .eq("booked_by", context.userId)
        .order("starts_at", { ascending: false })
        .limit(20),
      supabaseAgain!
        .from("branch_resource_bookings")
        .select("id,starts_at,ends_at,status,notes")
        .eq("organization_id", context.organizationId)
        .order("starts_at", { ascending: false })
        .limit(20),
    ]);
    setOwnBookings(
      [...(rooms.data ?? []), ...(resourcesForOrg.data ?? [])]
        .filter((booking) => ids.has(booking.id))
        .sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
    );
  };

  return (
    <div className="mx-auto max-w-350">
      <PageHeader
        eyebrow="Your Office & Co workspace"
        title="Bookings"
        description="Choose a live branch and request a space. An invoice is generated with each booking request."
      />
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="p-5 md:p-7">
          <h2 className="mb-5 font-display text-lg font-semibold">Request a booking</h2>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Loading availability…
            </div>
          ) : (
            <form onSubmit={submitBooking} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="booking-branch">Branch</Label>
                <select
                  id="booking-branch"
                  value={branchId}
                  onChange={(event) => {
                    setBranchId(event.target.value);
                    setSelectedResourceId("");
                  }}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                      {branch.city ? ` · ${branch.city}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="booking-resource">Space or service</Label>
                <select
                  id="booking-resource"
                  required
                  value={selectedResourceId}
                  onChange={(event) => setSelectedResourceId(event.target.value)}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Choose a space or service</option>
                  {resourceOptionGroups.map((group) => {
                    const groupResources = resources.filter((resource) => resource.type === group.type);
                    return (
                      <optgroup key={group.type} label={group.label}>
                        {groupResources.length ? (
                          groupResources.map((resource) => (
                            <option key={`${resource.type}-${resource.id}`} value={resource.id}>
                              {resource.name} · {resource.detail} · {formatZAR(resource.rate)}/
                              {resource.ratePeriod}
                            </option>
                          ))
                        ) : (
                          <option value={`unlisted-${group.type}`} disabled>
                            {group.emptyLabel}
                          </option>
                        )}
                      </optgroup>
                    );
                  })}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="booking-start">Start</Label>
                  <Input
                    id="booking-start"
                    type="datetime-local"
                    required
                    value={startsAt}
                    onChange={(event) => setStartsAt(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="booking-end">End</Label>
                  <Input
                    id="booking-end"
                    type="datetime-local"
                    required
                    value={endsAt}
                    onChange={(event) => setEndsAt(event.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="booking-quantity">People / quantity</Label>
                  <Input
                    id="booking-quantity"
                    type="number"
                    min={1}
                    max={100}
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Estimated charge</Label>
                  <div className="flex h-10 items-center rounded-md border bg-muted/30 px-3 text-sm font-semibold">
                    {formatZAR(estimate)}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="booking-notes">Notes for branch team</Label>
                <Textarea
                  id="booking-notes"
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Share setup or access requirements"
                />
              </div>
              <Button type="submit" disabled={submitting || !resources.length} className="w-full">
                {submitting ? "Submitting request…" : "Request booking and invoice"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Your request is held for branch confirmation. The invoice will appear in Billing;
                payment is due by its listed date.
              </p>
            </form>
          )}
        </Card>
        <section>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="font-display text-lg font-semibold">Your bookings</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Recent requests and reservations.
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/billing">
                Billing <Wallet className="ml-1 size-4" />
              </Link>
            </Button>
          </div>
          <div className="divide-y border-y">
            {ownBookings.map((booking) => (
              <div key={booking.id} className="flex items-start justify-between gap-4 py-4">
                <div>
                  <p className="text-sm font-medium">{booking.notes || "Facility booking"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(booking.starts_at))}
                  </p>
                </div>
                <Badge variant={booking.status === "confirmed" ? "secondary" : "outline"}>
                  {booking.status}
                </Badge>
              </div>
            ))}
            {!ownBookings.length && (
              <p className="py-5 text-sm text-muted-foreground">No booking requests yet.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export function OrganizationSupportView() {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [branchId, setBranchId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const loadTickets = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Workspace data is not configured.");
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error("Sign in to view support requests.");
    const [membership, userRole] = await Promise.all([
      supabase
        .from("organization_members")
        .select("branch_id")
        .eq("user_id", user.user.id)
        .eq("status", "active")
        .maybeSingle(),
      supabase
        .from("user_roles")
        .select("branch_id")
        .eq("user_id", user.user.id)
        .eq("role", "tenant_admin")
        .maybeSingle(),
    ]);
    const memberBranchId = membership.data?.branch_id ?? userRole.data?.branch_id;
    if (!memberBranchId) throw new Error("Your account has no assigned Office & Co branch.");
    setBranchId(memberBranchId);
    const { data, error: ticketError } = await supabase
      .from("support_tickets")
      .select("id,reference,subject,body,priority,status,created_at")
      .eq("raised_by", user.user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (ticketError) throw ticketError;
    setTickets((data ?? []) as TicketRow[]);
  };
  useEffect(() => {
    void loadTickets()
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Could not load tickets."),
      )
      .finally(() => setLoading(false));
  }, []);

  const submitTicket = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) {
      toast.error("Sign in to submit a request.");
      return;
    }
    setSubmitting(true);
    const { error: insertError } = await supabase.from("support_tickets").insert({
      branch_id: branchId,
      raised_by: user.user.id,
      subject: subject.trim(),
      body: body.trim(),
      priority: "medium",
      status: "open",
    });
    setSubmitting(false);
    if (insertError) {
      toast.error(insertError.message);
      return;
    }
    setSubject("");
    setBody("");
    await loadTickets();
    toast.success("Support request submitted.");
  };

  return (
    <div className="mx-auto max-w-350">
      <PageHeader
        eyebrow="Your Office & Co workspace"
        title="Support"
        description="Create a request and track updates from your branch team."
      />
      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="p-5 md:p-7">
          <h2 className="mb-4 font-display text-lg font-semibold">New support request</h2>
          <form onSubmit={submitTicket} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="support-subject">Subject</Label>
              <Input
                id="support-subject"
                required
                maxLength={180}
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="support-description">What do you need help with?</Label>
              <Textarea
                id="support-description"
                required
                rows={6}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={!branchId || submitting} className="w-full">
              {submitting ? "Submitting…" : "Submit request"}
            </Button>
          </form>
        </Card>
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Your requests</h2>
          {loading ? (
            <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Loading requests…
            </div>
          ) : (
            <div className="divide-y border-y">
              {tickets.map((ticket) => (
                <div key={ticket.id} className="flex items-start justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{ticket.subject}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{ticket.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ticket.reference ?? ticket.id.slice(0, 8)} ·{" "}
                      {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
                        new Date(ticket.created_at),
                      )}
                    </p>
                  </div>
                  <Badge
                    variant={
                      ticket.status === "resolved" || ticket.status === "closed"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {ticket.status.replaceAll("_", " ")}
                  </Badge>
                </div>
              ))}
              {tickets.length === 0 && (
                <p className="py-5 text-sm text-muted-foreground">
                  You have not submitted a support request yet.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function OrganizationBillingView() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      const context = await getOrganizationContext();
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Workspace data is not configured.");
      const { data, error: invoiceError } = await supabase
        .from("invoices")
        .select("id,reference,amount_zar,status,issued_at,due_at,paid_at,metadata")
        .eq("organization_id", context.organizationId)
        .order("issued_at", { ascending: false });
      if (invoiceError) throw invoiceError;
      if (active) setInvoices((data ?? []) as InvoiceRow[]);
    })()
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "Could not load organization invoices.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const outstanding = invoices.filter(
    (invoice) => invoice.status !== "paid" && invoice.status !== "void",
  );
  const totalDue = outstanding.reduce((sum, invoice) => sum + invoice.amount_zar, 0);
  return (
    <div className="mx-auto max-w-350">
      <PageHeader
        eyebrow="Your Office & Co workspace"
        title="Billing"
        description="Invoices and payments for your organization. This view shows organization charges, not Office & Co revenue."
      />
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <div className="mb-6 grid grid-cols-2 gap-4 md:max-w-xl">
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Outstanding invoices</p>
          <p className="mt-2 font-display text-2xl font-semibold">{outstanding.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">Balance due</p>
          <p className="mt-2 font-display text-2xl font-semibold">{formatZAR(totalDue)}</p>
        </Card>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Loading invoices…
        </div>
      ) : (
        <div className="divide-y border-y">
          {invoices.map((invoice) => {
            const checkoutUrl =
              typeof invoice.metadata?.checkout_url === "string"
                ? invoice.metadata.checkout_url
                : null;
            return (
              <div
                key={invoice.id}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium">{invoice.reference}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Issued {invoice.issued_at} · Due {invoice.due_at}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{formatZAR(invoice.amount_zar)}</span>
                  <Badge variant={invoice.status === "paid" ? "secondary" : "outline"}>
                    {invoice.status}
                  </Badge>
                  {checkoutUrl && (
                    <Button asChild size="sm">
                      <a href={checkoutUrl} target="_blank" rel="noreferrer">
                        Pay invoice
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {!invoices.length && (
            <Card className="my-5 p-8 text-center">
              <Wallet className="mx-auto size-6 text-muted-foreground" />
              <h2 className="mt-3 font-display font-semibold">No invoices yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Booking invoices will appear here when issued for your organization.
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
