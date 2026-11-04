import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, ArrowLeft, ArrowRight, CalendarHeart, ChevronDown, MapPin, Play } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase";
import { useRole } from "@/lib/role-context";
import { VirtualTour } from "@/components/VirtualTour";
import { tours } from "@/lib/tours";

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
  const isKyalamiBranchManager =
    role.id === "branch-manager" &&
    assignedBranches.some((branch) => branch.trim().toLowerCase() === "kyalami");
  const isUnauthorizedBranchManager =
    role.id === "branch-manager" &&
    !isKyalamiBranchManager;
  const [bookings, setBookings] = useState<CalendarEvent[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [availabilityError, setAvailabilityError] = useState("");
  const [requestReference, setRequestReference] = useState("");
  const [emailDeliveryStatus, setEmailDeliveryStatus] = useState<"sending" | "sent" | "failed" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [tab, setTab] = useState("request");
  const [formStep, setFormStep] = useState<1 | 2>(1);
  const [virtualTourOpen, setVirtualTourOpen] = useState(false);
  const [form, setForm] = useState({
    client: "",
    contact: "",
    email: "",
    whatsapp: "",
    alternatePhone: "",
    eventType: "",
    date: "",
    start: "",
    end: "",
    attendees: "",
    layout: "",
    layoutDetails: "",
    catering: "",
    cateringDetails: "",
    menuRequirements: [] as string[],
    menuDetails: "",
    equipmentRequirements: [] as string[],
    equipmentDetails: "",
    avRequirements: "",
    notes: "",
  });

  useEffect(() => {
    if (isLoading) return;
    if (role.id === "group-ceo" || isKyalamiBranchManager) {
      void navigate({ to: "/union-station-admin", replace: true });
    } else if (isUnauthorizedBranchManager) {
      void navigate({ to: "/facilities", replace: true });
    }
  }, [isLoading, isKyalamiBranchManager, isUnauthorizedBranchManager, role.id, navigate]);

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
  const isTenantAccount = role.id === "organization-admin" || role.id === "organization-member";
  const venueTour = tours["union-station"];
  const contactIsComplete =
    form.client.trim().length >= 2 &&
    form.eventType.trim().length > 0 &&
    form.contact.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) &&
    form.whatsapp.trim().length >= 7;
  const eventPlanIsComplete =
    Boolean(form.date) &&
    form.date >= new Date().toISOString().slice(0, 10) &&
    Boolean(form.start) &&
    Boolean(form.end) &&
    form.end > form.start &&
    Number.isInteger(Number(form.attendees)) &&
    Number(form.attendees) > 0 &&
    Number(form.attendees) <= 450 &&
    form.catering.trim().length > 0;
  const requestIsComplete = contactIsComplete && eventPlanIsComplete;

  const toggleMenuRequirement = (option: string) => {
    setForm((current) => {
      const selected = current.menuRequirements;
      const next = option === "No specific requirements"
        ? selected.includes(option) ? [] : [option]
        : selected.includes(option)
          ? selected.filter((item) => item !== option)
          : [...selected.filter((item) => item !== "No specific requirements"), option];
      return {
        ...current,
        menuRequirements: next,
        menuDetails: next.includes("Other") ? current.menuDetails : "",
      };
    });
  };

  const toggleEquipmentRequirement = (option: string) => {
    setForm((current) => {
      const selected = current.equipmentRequirements;
      const next = option === "No equipment required"
        ? selected.includes(option) ? [] : [option]
        : selected.includes(option)
          ? selected.filter((item) => item !== option)
          : [...selected.filter((item) => item !== "No equipment required"), option];
      return {
        ...current,
        equipmentRequirements: next,
        equipmentDetails: next.includes("Other") ? current.equipmentDetails : "",
      };
    });
  };

  const continueToEventPlan = () => {
    if (!contactIsComplete) {
      toast.error("Complete the required company, event type, contact, email, and WhatsApp details.");
      return;
    }
    setFormStep(2);
  };

  const submit = async () => {
    const attendees = Number(form.attendees);
    if (!requestIsComplete) {
      toast.error("Complete the required contact and event details, including catering.");
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Union Station requests are temporarily unavailable.");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("submit_public_union_station_request", {
        p_client_company: form.client.trim(),
        p_contact_name: form.contact.trim(),
        p_contact_email: form.email.trim(),
        p_contact_phone: form.whatsapp.trim(),
        p_event_type: form.eventType.trim(),
        p_event_date: form.date,
        p_starts_time: form.start,
        p_ends_time: form.end,
        p_attendees: attendees,
        p_layout: [form.layout, form.layoutDetails.trim()].filter(Boolean).join(": ") || "To be discussed",
        p_catering: [form.catering, form.cateringDetails.trim()].filter(Boolean).join(": "),
        p_av_addons: form.avRequirements.split(",").map((item) => item.trim()).filter(Boolean),
        p_notes: form.notes.trim() || null,
        p_estimate_zar: 0,
        p_alternate_phone: form.alternatePhone.trim() || null,
        p_menu_requirements: [...form.menuRequirements, form.menuDetails.trim()].filter(Boolean).join(": "),
        p_equipment_requirements: [...form.equipmentRequirements, form.equipmentDetails.trim()].filter(Boolean).join(": "),
      });
      if (error) {
        toast.error(error.code === "PGRST202"
          ? "The Union Station booking service needs a database update. Please try again later."
          : error.message);
        return;
      }
      if (!data || typeof data !== "object" || !("reference" in data) || !("booking_id" in data) || !("email_token" in data)) {
        toast.error("The booking service returned an unexpected response. Please try again later.");
        return;
      }
      const result = data as { reference: string; booking_id: string; email_token: string };
      setRequestReference(result.reference);
      setEmailDeliveryStatus("sending");
      try {
        const { data: delivery, error: deliveryError } = await supabase.functions.invoke("deliver-booking-emails", {
          body: { booking_id: result.booking_id, email_token: result.email_token },
        });
        if (deliveryError || delivery?.failed > 0 || delivery?.sent < 1) {
          setEmailDeliveryStatus("failed");
          toast.warning("Your request was saved, but the confirmation email could not be sent yet.");
        } else {
          setEmailDeliveryStatus("sent");
        }
      } catch {
        setEmailDeliveryStatus("failed");
        toast.warning("Your request was saved, but the confirmation email could not be sent yet.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Union Station requests are temporarily unavailable.");
    } finally {
      setSubmitting(false);
    }
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

  if (isLoading || isKyalamiBranchManager || isUnauthorizedBranchManager || role.id === "group-ceo") return null;

  return (
    <div className="mx-auto max-w-350">
      <PageHeader
        eyebrow="Union Station · Event bookings"
        title="Book your event or meeting"
        description="Request an event quote, explore the venue, or arrange a hosted visit. No account is needed to enquire."
        actions={<Button size="sm" className="gap-1.5" onClick={() => setTab("request")}><CalendarHeart className="size-4" />Request a quote</Button>}
      />

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-3 sm:inline-grid sm:w-auto">
          <TabsTrigger value="request">Request a quote</TabsTrigger>
          <TabsTrigger value="tour">Virtual tour</TabsTrigger>
          <TabsTrigger value="visit">Physical visit</TabsTrigger>
        </TabsList>

        <TabsContent value="request" className="space-y-4">
          <div className="rounded-md border bg-card px-4 py-3 text-sm">
            {isTenantAccount ? (
              <span>Your request will be linked to your tenant account. We’ll send updates to your in-app notifications, and any issued invoice will appear in Billing.</span>
            ) : (
              <span>Already an Office &amp; Co tenant?{" "}
                <Link to="/auth/sign-in" search={{ returnTo: "/union-station" }} className="font-medium text-brand underline underline-offset-4">Log in to your account</Link>
                {" "}to link this request to your account and receive updates there. You can also submit without signing in.
              </span>
            )}
          </div>
          <div className="grid lg:grid-cols-[1fr_360px] gap-4">
            <div className="card-soft p-6 space-y-5">
              <ol aria-label="Quote request progress" className="grid grid-cols-2 gap-3">
                {[{ step: 1, title: "Your details" }, { step: 2, title: "Event plan" }].map(({ step, title }) => (
                  <li
                    key={step}
                    aria-current={formStep === step ? "step" : undefined}
                    className={`border-b-2 pb-2 text-sm ${formStep === step ? "border-brand font-semibold text-foreground" : "border-border text-muted-foreground"}`}
                  >
                    <span className="mr-2 inline-flex size-6 items-center justify-center rounded-full border text-xs">{step}</span>
                    {title}
                  </li>
                ))}
              </ol>

              <div className="grid md:grid-cols-2 gap-4">
                {formStep === 1 ? <>
                  <h2 className="md:col-span-2 text-sm font-semibold">Your details</h2>
                  <div className="space-y-1.5">
                    <Label>Company / organisation <span aria-hidden="true" className="text-destructive">*</span></Label>
                    <Input value={form.client} onChange={(event) => setForm({ ...form, client: event.target.value })} autoComplete="organization" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Event type <span aria-hidden="true" className="text-destructive">*</span></Label>
                    <Input value={form.eventType} onChange={(event) => setForm({ ...form, eventType: event.target.value })} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Contact name <span aria-hidden="true" className="text-destructive">*</span></Label>
                    <Input value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} autoComplete="name" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email <span aria-hidden="true" className="text-destructive">*</span></Label>
                    <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>WhatsApp number <span aria-hidden="true" className="text-destructive">*</span></Label>
                    <Input type="tel" value={form.whatsapp} onChange={(event) => setForm({ ...form, whatsapp: event.target.value })} autoComplete="tel" placeholder="+27 82 123 4567" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Alternative phone</Label>
                    <Input type="tel" value={form.alternatePhone} onChange={(event) => setForm({ ...form, alternatePhone: event.target.value })} autoComplete="tel-national" />
                  </div>
                </> : <>
                  <h2 className="md:col-span-2 text-sm font-semibold">Event plan</h2>
                  <div className="space-y-1.5">
                    <Label>Event date <span aria-hidden="true" className="text-destructive">*</span></Label>
                    <Input type="date" min={new Date().toISOString().slice(0, 10)} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label>Start time <span aria-hidden="true" className="text-destructive">*</span></Label>
                      <Input type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Finish time <span aria-hidden="true" className="text-destructive">*</span></Label>
                      <Input type="time" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} required />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Expected guests <span aria-hidden="true" className="text-destructive">*</span></Label>
                    <Input type="number" min={1} step={1} value={form.attendees} onChange={(event) => setForm({ ...form, attendees: event.target.value })} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Room layout</Label>
                    <Select value={form.layout} onValueChange={(value) => setForm({ ...form, layout: value, layoutDetails: "" })}>
                      <SelectTrigger aria-label="Room layout"><SelectValue placeholder="Optional — choose a layout" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Boardroom">Boardroom</SelectItem>
                        <SelectItem value="Classroom">Classroom</SelectItem>
                        <SelectItem value="Theatre">Theatre</SelectItem>
                        <SelectItem value="U-shape">U-shape</SelectItem>
                        <SelectItem value="Banquet">Banquet</SelectItem>
                        <SelectItem value="Cabaret">Cabaret</SelectItem>
                        <SelectItem value="Cocktail / standing">Cocktail / standing</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    {form.layout === "Other" && <Input value={form.layoutDetails} onChange={(event) => setForm({ ...form, layoutDetails: event.target.value })} placeholder="Optional: describe the layout" />}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Catering <span aria-hidden="true" className="text-destructive">*</span></Label>
                    <Select value={form.catering} onValueChange={(value) => setForm({ ...form, catering: value, cateringDetails: "" })}>
                      <SelectTrigger aria-label="Catering"><SelectValue placeholder="Choose a catering option" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="No catering">No catering</SelectItem>
                        <SelectItem value="Tea and coffee">Tea and coffee</SelectItem>
                        <SelectItem value="Light refreshments">Light refreshments</SelectItem>
                        <SelectItem value="Breakfast">Breakfast</SelectItem>
                        <SelectItem value="Lunch">Lunch</SelectItem>
                        <SelectItem value="Dinner">Dinner</SelectItem>
                        <SelectItem value="Full-day catering">Full-day catering</SelectItem>
                        <SelectItem value="Other / dietary requirements">Other / dietary requirements</SelectItem>
                      </SelectContent>
                    </Select>
                    {form.catering === "Other / dietary requirements" && <Input value={form.cateringDetails} onChange={(event) => setForm({ ...form, cateringDetails: event.target.value })} placeholder="Optional: describe catering or dietary needs" />}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Menu requirements</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" role="combobox" aria-label="Menu requirements" className="w-full justify-between gap-2 font-normal">
                          <span className="truncate text-left">{form.menuRequirements.length ? form.menuRequirements.join(", ") : "Optional — select menu requirements"}</span>
                          <ChevronDown className="size-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-2">
                        <div className="space-y-1">
                          {["No specific requirements", "Vegetarian", "Vegan", "Halaal", "Kosher", "Gluten-free", "Dairy-free", "Other"].map((option, index) => (
                            <div key={option} className="flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent">
                              <Checkbox id={`menu-requirement-${index}`} checked={form.menuRequirements.includes(option)} onCheckedChange={() => toggleMenuRequirement(option)} />
                              <Label htmlFor={`menu-requirement-${index}`} className="flex-1 cursor-pointer text-sm font-normal">{option}</Label>
                            </div>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    {form.menuRequirements.includes("Other") && <Input value={form.menuDetails} onChange={(event) => setForm({ ...form, menuDetails: event.target.value })} placeholder="Optional: describe menu needs" />}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Equipment hire</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" role="combobox" aria-label="Equipment hire" className="w-full justify-between gap-2 font-normal">
                          <span className="truncate text-left">{form.equipmentRequirements.length ? form.equipmentRequirements.join(", ") : "Optional — select equipment"}</span>
                          <ChevronDown className="size-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-2">
                        <div className="space-y-1">
                          {["No equipment required", "Projector and screen", "Microphone and PA system", "Video conferencing equipment", "Flip chart or whiteboard", "Additional tables or chairs", "Other"].map((option, index) => (
                            <div key={option} className="flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent">
                              <Checkbox id={`equipment-requirement-${index}`} checked={form.equipmentRequirements.includes(option)} onCheckedChange={() => toggleEquipmentRequirement(option)} />
                              <Label htmlFor={`equipment-requirement-${index}`} className="flex-1 cursor-pointer text-sm font-normal">{option}</Label>
                            </div>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    {form.equipmentRequirements.includes("Other") && <Input value={form.equipmentDetails} onChange={(event) => setForm({ ...form, equipmentDetails: event.target.value })} placeholder="Optional: list equipment needed" />}
                  </div>
                  <div className="space-y-1.5">
                    <Label>AV and production</Label>
                    <Input value={form.avRequirements} onChange={(event) => setForm({ ...form, avRequirements: event.target.value })} placeholder="Optional; separate items with commas" />
                  </div>
                </>}
              </div>

              {formStep === 2 && <div className="space-y-1.5">
                <Label>Additional notes</Label>
                <Textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
              </div>}

              {formStep === 2 && requestReference && <div role="status" className="rounded-md border border-success/30 bg-success/10 p-3 text-sm">
                Enquiry {requestReference} was submitted. It is not a confirmed booking.{isTenantAccount ? <> Your request is linked to your account; updates arrive in Notifications, and any invoice will appear in <Link to="/billing" className="font-medium underline underline-offset-4">Billing</Link>.</> : null}
                <p className="mt-2" aria-live="polite">
                  {emailDeliveryStatus === "sending" && `Sending a copy of your request to ${form.email}…`}
                  {emailDeliveryStatus === "sent" && `A copy of your request was emailed to ${form.email}.`}
                  {emailDeliveryStatus === "failed" && `Your request is saved, but we could not send a copy to ${form.email}. Please keep your reference.`}
                </p>
              </div>}

              {formStep === 2 && conflicts.length > 0 && (
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
              <div className="text-xs text-muted-foreground mt-2">Pricing and availability are confirmed after review.</div>
              {formStep === 1 ? (
                <Button className="w-full mt-5 gap-1.5" onClick={continueToEventPlan}>
                  Continue to event plan<ArrowRight className="size-4" />
                </Button>
              ) : (
                <div className="mt-5 space-y-2">
                  <Button variant="outline" className="w-full gap-1.5" onClick={() => setFormStep(1)}>
                    <ArrowLeft className="size-4" />Back to your details
                  </Button>
                  <Button className="w-full gap-1.5" disabled={submitting || !requestIsComplete} onClick={() => void submit()}>
                    <CalendarHeart className="size-4" />{submitting ? "Submitting…" : "Request a quote"}
                  </Button>
                </div>
              )}
              {formStep === 2 && !eventPlanIsComplete && <p className="mt-2 text-center text-xs text-muted-foreground">Complete the required event details to request your quote.</p>}
            </aside>
          </div>
          <details className="card-soft p-4">
            <summary className="cursor-pointer text-sm font-medium">Check confirmed availability</summary>
            <div className="mt-3">{renderAvailability(upcomingBookings, "No upcoming confirmed events are listed.")}</div>
          </details>
        </TabsContent>

        <TabsContent value="tour">
          <section className="space-y-5">
            <div>
              <h2 className="font-display text-xl font-semibold">Explore Union Station</h2>
              <p className="mt-1 text-sm text-muted-foreground">Take a closer look at the rooms and event spaces before you enquire.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {venueTour.spaces.slice(0, 4).map((space) => (
                <div key={space.id} className="overflow-hidden rounded-md border bg-card">
                  <img src={space.image} alt={`Union Station ${space.name}`} className="aspect-[4/3] w-full object-cover" />
                  <div className="p-3">
                    <h3 className="text-sm font-medium">{space.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">{space.capacity ?? space.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <Button className="gap-2" onClick={() => setVirtualTourOpen(true)}><Play className="size-4" />Start interactive tour</Button>
          </section>
        </TabsContent>

        <TabsContent value="visit">
          <section className="grid gap-6 rounded-md border bg-card p-5 sm:p-7 md:grid-cols-[1fr_auto] md:items-center">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-sm font-medium text-brand"><MapPin className="size-4" />Hosted venue visit</div>
              <h2 className="mt-3 font-display text-2xl font-semibold">See the spaces in person.</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Tell us who is visiting, then choose a preferred date and time. The venue team will confirm your walkthrough.</p>
            </div>
            <Button asChild className="gap-2">
              <Link to="/tour-request" search={{ branch: "union-station" }}>Book a physical visit<CalendarHeart className="size-4" /></Link>
            </Button>
          </section>
        </TabsContent>
      </Tabs>
      <VirtualTour
        tour={venueTour}
        open={virtualTourOpen}
        onOpenChange={setVirtualTourOpen}
        onRequestTour={() => {
          setVirtualTourOpen(false);
          setTab("request");
        }}
      />
    </div>
  );
}
