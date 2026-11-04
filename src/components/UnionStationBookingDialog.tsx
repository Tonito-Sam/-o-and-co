import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CalendarHeart, CheckCircle2, ChevronDown, MapPin, Play } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { VirtualTour } from "@/components/VirtualTour";
import { tours } from "@/lib/tours";
import { getSupabaseClient } from "@/lib/supabase";
import { useRole } from "@/lib/role-context";

type UnionStationBookingDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted?: () => void;
};

const emptyForm = {
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
};

export function UnionStationBookingDialog({ open, onOpenChange, onSubmitted }: UnionStationBookingDialogProps) {
  const { role } = useRole();
  const [activeTab, setActiveTab] = useState("quote");
  const [formStep, setFormStep] = useState<1 | 2>(1);
  const [virtualTourOpen, setVirtualTourOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requestReference, setRequestReference] = useState("");
  const [emailDeliveryStatus, setEmailDeliveryStatus] = useState<"sending" | "sent" | "failed" | null>(null);
  const [form, setForm] = useState(emptyForm);
  const venueTour = tours["union-station"];
  const isTenant = role.id === "organization-admin" || role.id === "organization-member";
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

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && requestReference) {
      setRequestReference("");
      setEmailDeliveryStatus(null);
      setForm(emptyForm);
      setFormStep(1);
    }
    onOpenChange(nextOpen);
  };

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

  const submitRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requestIsComplete) return;
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
        p_attendees: Number(form.attendees),
        p_layout: [form.layout, form.layoutDetails.trim()].filter(Boolean).join(": ") || "To be discussed",
        p_catering: [form.catering, form.cateringDetails.trim()].filter(Boolean).join(": "),
        p_av_addons: form.avRequirements.split(",").map((item) => item.trim()).filter(Boolean),
        p_notes: [form.alternatePhone.trim() ? `Alternative phone: ${form.alternatePhone.trim()}` : "", form.notes.trim()]
          .filter(Boolean)
          .join("\n") || null,
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
      onSubmitted?.();
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

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[92vh] w-[calc(100%-1rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100%-2rem)]">
          <DialogHeader className="border-b px-5 py-4 pr-12 text-left sm:px-7">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-brand">Union Station · Events</div>
            <DialogTitle className="mt-1 font-display text-xl sm:text-2xl">Plan your event at Union Station</DialogTitle>
            <DialogDescription>Tell us what you’re planning, explore the venue, or arrange a hosted visit. No account is needed to enquire.</DialogDescription>
            {!isTenant && (
              <p className="pt-1 text-xs text-muted-foreground">
                Already a tenant?{" "}
                <Link to="/auth/sign-in" search={{ returnTo: "welcome-union-station" }} className="font-medium text-brand underline underline-offset-4">Log in to link your request to your account</Link>
              </p>
            )}
            {isTenant && <p className="pt-1 text-xs text-muted-foreground">Your request will be linked to your tenant account. Updates arrive in Notifications; issued invoices appear in Billing.</p>}
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
            <div className="border-b px-4 py-3 sm:px-7">
              <TabsList className="grid h-auto w-full grid-cols-3 sm:w-fit">
                <TabsTrigger value="quote" className="gap-1.5"><CalendarHeart className="size-3.5" />Quote request</TabsTrigger>
                <TabsTrigger value="tour" className="gap-1.5"><Play className="size-3.5" />Virtual tour</TabsTrigger>
                <TabsTrigger value="visit" className="gap-1.5"><MapPin className="size-3.5" />Visit in person</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="quote" className="mt-0 min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-7">
              {requestReference ? (
                <section role="status" aria-live="polite" className="mx-auto flex min-h-80 max-w-xl flex-col items-center justify-center py-10 text-center">
                  <div className="grid size-14 place-items-center rounded-full bg-success/10 text-success">
                    <CheckCircle2 className="size-8" aria-hidden="true" />
                  </div>
                  <h3 className="mt-5 font-display text-2xl font-semibold">Thank you, {form.contact.split(" ")[0]}.</h3>
                  <p className="mt-2 text-sm text-muted-foreground">Your event enquiry has been submitted successfully.</p>
                  <div className="mt-5 rounded-md border bg-muted/30 px-5 py-3">
                    <div className="text-xs text-muted-foreground">Enquiry reference</div>
                    <div className="mt-1 font-semibold">{requestReference}</div>
                  </div>
                  <p className="mt-5 max-w-md text-sm leading-6 text-muted-foreground">
                    Our events team will review your requirements and follow up to confirm pricing and availability. This is an enquiry, not a confirmed booking.
                    {isTenant && " Updates will arrive in Notifications, and any issued invoice will appear in Billing."}
                  </p>
                  <p className="mt-3 text-sm" aria-live="polite">
                    {emailDeliveryStatus === "sending" && `Sending a copy of your request to ${form.email}…`}
                    {emailDeliveryStatus === "sent" && `A copy of your request was emailed to ${form.email}.`}
                    {emailDeliveryStatus === "failed" && `Your request is saved, but we could not send a copy to ${form.email}. Please keep your reference.`}
                  </p>
                  <Button className="mt-6" onClick={() => handleOpenChange(false)}>Done</Button>
                </section>
              ) : <form id="union-station-quote-form" onSubmit={(event) => void submitRequest(event)}>
                <ol aria-label="Quote request progress" className="mb-5 grid grid-cols-2 gap-3">
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

                {formStep === 1 && <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your details</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Company / organisation" required><Input value={form.client} onChange={(event) => setForm({ ...form, client: event.target.value })} autoComplete="organization" required /></Field>
                    <Field label="Event type" required><Input value={form.eventType} onChange={(event) => setForm({ ...form, eventType: event.target.value })} placeholder="Conference, celebration…" required /></Field>
                    <Field label="Contact name" required><Input value={form.contact} onChange={(event) => setForm({ ...form, contact: event.target.value })} autoComplete="name" required /></Field>
                    <Field label="Email" required><Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" required /></Field>
                    <Field label="WhatsApp number" required><Input type="tel" value={form.whatsapp} onChange={(event) => setForm({ ...form, whatsapp: event.target.value })} autoComplete="tel" placeholder="+27 82 123 4567" required /></Field>
                    <Field label="Alternative phone"><Input type="tel" value={form.alternatePhone} onChange={(event) => setForm({ ...form, alternatePhone: event.target.value })} autoComplete="tel-national" /></Field>
                  </div>
                </section>}

                {formStep === 2 && <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Event plan</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="Event date" required><Input type="date" min={new Date().toISOString().slice(0, 10)} value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} required /></Field>
                    <Field label="Start time" required><Input type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} required /></Field>
                    <Field label="Finish time" required><Input type="time" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} required /></Field>
                    <Field label="Expected guests" required><Input type="number" min={1} max={450} step={1} value={form.attendees} onChange={(event) => setForm({ ...form, attendees: event.target.value })} required /></Field>
                    <Field label="Room layout">
                      <div className="space-y-2">
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
                        {form.layout === "Other" && (
                          <Input value={form.layoutDetails} onChange={(event) => setForm({ ...form, layoutDetails: event.target.value })} placeholder="Optional: describe the layout" />
                        )}
                      </div>
                    </Field>
                    <Field label="Catering" required>
                      <div className="space-y-2">
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
                        {form.catering === "Other / dietary requirements" && (
                          <Input value={form.cateringDetails} onChange={(event) => setForm({ ...form, cateringDetails: event.target.value })} placeholder="Optional: describe catering or dietary needs" />
                        )}
                      </div>
                    </Field>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Field label="Menu requirements">
                      <div className="space-y-2">
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
                        {form.menuRequirements.includes("Other") && (
                          <Input value={form.menuDetails} onChange={(event) => setForm({ ...form, menuDetails: event.target.value })} placeholder="Optional: describe menu needs" />
                        )}
                      </div>
                    </Field>
                    <Field label="Equipment hire">
                      <div className="space-y-2">
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
                        {form.equipmentRequirements.includes("Other") && (
                          <Input value={form.equipmentDetails} onChange={(event) => setForm({ ...form, equipmentDetails: event.target.value })} placeholder="Optional: list equipment needed" />
                        )}
                      </div>
                    </Field>
                    <Field label="AV and production"><Input value={form.avRequirements} onChange={(event) => setForm({ ...form, avRequirements: event.target.value })} placeholder="Optional" /></Field>
                    <Field label="Additional notes"><Textarea rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Anything else the events team should know?" /></Field>
                  </div>
                </section>}
              </form>}
            </TabsContent>

            <TabsContent value="tour" className="mt-0 min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
              <h3 className="font-display text-lg font-semibold">Explore the venue</h3>
              <p className="mt-1 text-sm text-muted-foreground">Preview the event spaces, then continue with your quote request.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {venueTour.spaces.slice(0, 4).map((space) => (
                  <div key={space.id} className="overflow-hidden rounded-md border">
                    <img src={space.image} alt={`Union Station ${space.name}`} className="aspect-[4/3] w-full object-cover" />
                    <div className="p-3"><h4 className="text-sm font-medium">{space.name}</h4><p className="mt-1 text-xs text-muted-foreground">{space.capacity ?? space.description}</p></div>
                  </div>
                ))}
              </div>
              <Button className="mt-4 gap-2" onClick={() => setVirtualTourOpen(true)}><Play className="size-4" />Start interactive tour</Button>
            </TabsContent>

            <TabsContent value="visit" className="mt-0 min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 text-sm font-medium text-brand"><MapPin className="size-4" />Hosted venue visit</div>
                <h3 className="mt-3 font-display text-2xl font-semibold">See the spaces in person.</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Share your details and choose a preferred date and time for a guided Union Station walkthrough. The venue team will confirm your visit.</p>
                <Button asChild className="mt-5 gap-2"><Link to="/tour-request" search={{ branch: "union-station" }}>Choose a visit time<CalendarHeart className="size-4" /></Link></Button>
              </div>
            </TabsContent>

            {activeTab === "quote" && !requestReference && (
              <div className="flex items-center justify-between gap-4 border-t px-5 py-3 sm:px-7">
                <span className="hidden text-xs text-muted-foreground sm:inline">Pricing and availability are confirmed after review.</span>
                {formStep === 1 ? (
                  <Button type="button" className="ml-auto gap-2" onClick={continueToEventPlan}>
                    Continue to event plan<ArrowRight className="size-4" />
                  </Button>
                ) : (
                  <div className="ml-auto flex gap-2">
                    <Button type="button" variant="outline" className="gap-2" onClick={() => setFormStep(1)}>
                      <ArrowLeft className="size-4" />Back
                    </Button>
                    <Button type="submit" form="union-station-quote-form" className="gap-2" disabled={!requestIsComplete || submitting}>
                      <CalendarHeart className="size-4" />{submitting ? "Sending…" : "Request a quote"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>

      <VirtualTour
        tour={venueTour}
        open={virtualTourOpen}
        onOpenChange={setVirtualTourOpen}
        onRequestTour={() => {
          setVirtualTourOpen(false);
          setActiveTab("quote");
        }}
      />
    </>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}{required ? <span className="ml-1 text-destructive">*</span> : null}</Label>
      {children}
    </div>
  );
}