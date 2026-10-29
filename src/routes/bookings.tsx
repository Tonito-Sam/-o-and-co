import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Textarea } from "@/components/ui/textarea";
import {
  branches,
  createInvoice,
  downloadInvoicePdf,
  loadInvoices,
  saveInvoices,
  spaces,
  PAYSTACK_PUBLIC_KEY,
  formatZAR,
  type Invoice,
  type InvoiceMethod,
} from "@/lib/mock";
import { useRole } from "@/lib/role-context";
import { getSupabaseClient } from "@/lib/supabase";
import { OrganizationBookingsView } from "@/components/tenant/OrganizationViews";
import { CalendarDays, Clock3, MapPin, Sparkles } from "lucide-react";
import { toast } from "sonner";

type PaystackPopup = { openIframe: () => void };

declare global {
  interface Window {
    PaystackPop?: {
      setup: (options: {
        key: string;
        email: string;
        amount: number;
        currency: string;
        ref: string;
        label?: string;
        onClose?: () => void;
        callback?: (response: { reference: string }) => void;
      }) => PaystackPopup;
    };
  }
}

export const Route = createFileRoute("/bookings")({
  head: () => ({ meta: [{ title: "Bookings — WorkspaceOS" }] }),
  component: Bookings,
});

const slots = Array.from({ length: 10 }, (_, i) => `${8 + i}:00`);
const sample: {
  branch: string;
  room: string;
  tenant: string;
  start: number;
  span: number;
  kind: string;
}[] = [];

type OneOffBookingRequest = {
  id: string;
  branch_id: string | null;
  request_reference: string | null;
  request_status: string | null;
  quote_amount_zar: number | null;
  quote_notes: string | null;
  space_name: string | null;
  starts_at: string;
  ends_at: string;
  guests: number | null;
  status: string;
  invoice_reference: string | null;
  branches: { name: string } | { name: string }[] | null;
  leads: { contact_name: string; company_name: string; contact_email: string; contact_phone: string } | { contact_name: string; company_name: string; contact_email: string; contact_phone: string }[] | null;
};

function branchName(relation: OneOffBookingRequest["branches"]) {
  return Array.isArray(relation) ? relation[0]?.name : relation?.name;
}

function leadContact(relation: OneOffBookingRequest["leads"]) {
  return Array.isArray(relation) ? relation[0] : relation;
}

function Bookings() {
  const { role } = useRole();
  if (role.id === "organization-admin" || role.id === "organization-member") {
    return <OrganizationBookingsView />;
  }
  return <AdminBookings />;
}

function AdminBookings() {
  const { role } = useRole();
  const [oneOffRequests, setOneOffRequests] = useState<OneOffBookingRequest[]>([]);
  const [requestError, setRequestError] = useState("");
  const [updatingRequestId, setUpdatingRequestId] = useState("");
  const [quoteAmounts, setQuoteAmounts] = useState<Record<string, string>>({});
  const [quoteNotes, setQuoteNotes] = useState<Record<string, string>>({});
  const [selectedBranch, setSelectedBranch] = useState<string>("Bryanston");
  const [selectedDate, setSelectedDate] = useState<string>("2026-07-18");
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [reservationOpen, setReservationOpen] = useState(false);
  const [bookingTitle, setBookingTitle] = useState("Workspace booking");
  const [bookingNotes, setBookingNotes] = useState("Private workspace for leadership review.");
  const [bookingGuests, setBookingGuests] = useState("8");
  const [checkoutMethod, setCheckoutMethod] = useState<InvoiceMethod>("Charge to account");
  const [paystackReady, setPaystackReady] = useState(false);
  const [generatedInvoice, setGeneratedInvoice] = useState<Invoice | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [eftModalOpen, setEftModalOpen] = useState(false);
  const [popAttachmentName, setPopAttachmentName] = useState("");
  const [popAttachmentPreview, setPopAttachmentPreview] = useState<string | null>(null);
  const showInternalBookingPanels = [
    "group-ceo",
    "sales-manager",
    "rosebank-sales",
    "branch-manager",
    "community-manager",
    "finance",
    "lydia-admin",
  ].includes(role.id);
  const tourSlots = [
    { branch: "Bryanston", day: "Tue, 8 Jul", time: "09:00", note: "Private office tour" },
    { branch: "Rosebank", day: "Wed, 9 Jul", time: "11:30", note: "Hot desk + community tour" },
    { branch: "Kyalami", day: "Thu, 10 Jul", time: "14:00", note: "Boardroom and lounge tour" },
    { branch: "Union Station", day: "Fri, 11 Jul", time: "16:00", note: "Event venue walkthrough" },
  ];

  const branchChoices = branches.filter((branch) => branch.status === "live");
  const canReviewOneOffRequests = [
    "superadmin", "group-admin", "group-ceo", "crm-manager", "sales-manager", "rosebank-sales", "branch-manager", "finance",
  ].includes(role.id);

  const loadOneOffRequests = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !canReviewOneOffRequests) return;
    let requestQuery = supabase
      .from("bookings")
      .select("id,branch_id,request_reference,request_status,quote_amount_zar,quote_notes,space_name,starts_at,ends_at,guests,status,invoice_reference,branches(name),leads(contact_name,company_name,contact_email,contact_phone)")
      .not("request_status", "is", null)
      .order("starts_at", { ascending: true })
      .limit(50);
    if (role.id === "branch-manager" || role.id === "rosebank-sales") {
      requestQuery = requestQuery.in("branch_id", role.branchIds ?? []);
    }
    const { data, error } = await requestQuery;
    if (error) setRequestError(error.message);
    else {
      setRequestError("");
      setOneOffRequests((data ?? []) as OneOffBookingRequest[]);
    }
  }, [canReviewOneOffRequests, role.id, role.branchIds]);

  useEffect(() => {
    void loadOneOffRequests();
  }, [loadOneOffRequests]);

  const updateOneOffRequest = async (bookingId: string, status: "confirmed" | "cancelled") => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setUpdatingRequestId(bookingId);
    const { data: emailToken, error } = await supabase.rpc("update_one_off_booking_status", {
      p_booking_id: bookingId,
      p_status: status,
    });
    setUpdatingRequestId("");
    if (error) {
      toast.error(error.message);
      return;
    }
    const { data: delivery, error: deliveryError } = await supabase.functions.invoke("deliver-booking-emails", {
      body: { booking_id: bookingId, email_token: emailToken },
    });
    if (deliveryError || delivery?.failed > 0) {
      toast.warning(status === "confirmed" ? "Booking confirmed, but customer email delivery needs attention." : "Request declined, but customer email delivery needs attention.");
    } else {
      toast.success(status === "confirmed" ? "Booking confirmed and customer notified." : "Request declined and customer notified.");
    }
    await loadOneOffRequests();
  };

  const submitOneOffQuote = async (bookingId: string) => {
    const amount = Number.parseInt(quoteAmounts[bookingId] ?? "", 10);
    if (!Number.isSafeInteger(amount) || amount < 1) {
      toast.error("Enter a valid quote amount before sending it to Finance.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setUpdatingRequestId(bookingId);
    const { data: emailToken, error } = await supabase.rpc("submit_one_off_booking_quote", {
      p_booking_id: bookingId,
      p_quote_amount_zar: amount,
      p_quote_notes: quoteNotes[bookingId]?.trim() || null,
    });
    if (error) {
      setUpdatingRequestId("");
      toast.error(error.message);
      return;
    }
    const request = oneOffRequests.find((item) => item.id === bookingId);
    const { data: delivery, error: deliveryError } = await supabase.functions.invoke("deliver-booking-emails", {
      body: { booking_id: bookingId, email_token: emailToken },
    });
    setUpdatingRequestId("");
    if (deliveryError || delivery?.failed > 0) {
      toast.warning("Quote sent to Finance, but the Finance email needs attention.");
    } else {
      toast.success(`Quote for ${request?.request_reference ?? "the request"} sent to Finance.`);
    }
    await loadOneOffRequests();
  };
  const branchSpaces = useMemo(() => {
    return spaces.filter((space) => space.branch === selectedBranch);
  }, [selectedBranch]);
  const selectedSpace = useMemo(() => {
    return branchSpaces.find((space) => space.id === selectedSpaceId) ?? null;
  }, [branchSpaces, selectedSpaceId]);
  const bookingAmount = useMemo(() => {
    const guestCount = Number.parseInt(bookingGuests, 10) || 8;
    return Math.max(4500, Math.round(guestCount * 240));
  }, [bookingGuests]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.PaystackPop) {
      setPaystackReady(true);
      return;
    }
    const existing = document.querySelector('script[src="https://js.paystack.co/v1/inline.js"]');
    if (existing) {
      existing.addEventListener("load", () => setPaystackReady(Boolean(window.PaystackPop)), {
        once: true,
      });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v1/inline.js";
    script.async = true;
    script.onload = () => setPaystackReady(Boolean(window.PaystackPop));
    script.onerror = () => toast.error("Paystack could not be loaded. Please try again shortly.");
    document.body.appendChild(script);
  }, []);

  const openReservation = (spaceId: string) => {
    setSelectedSpaceId(spaceId);
    setReservationOpen(true);
  };

  const updateGeneratedInvoice = (invoiceId: string, updates: Partial<Invoice>) => {
    const current = loadInvoices();
    const updated = current.map((invoice) =>
      invoice.id === invoiceId ? { ...invoice, ...updates } : invoice,
    );
    saveInvoices(updated);
    const nextInvoice = updated.find((invoice) => invoice.id === invoiceId) ?? null;
    setGeneratedInvoice(nextInvoice);
  };

  const handlePopUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setPopAttachmentName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setPopAttachmentPreview(typeof reader.result === "string" ? reader.result : null);
    };
    reader.readAsDataURL(file);
  };

  const submitEftProof = () => {
    if (!generatedInvoice) return;

    updateGeneratedInvoice(generatedInvoice.id, {
      status: "Pending verification",
      method: "EFT",
      note: `${generatedInvoice.note ?? "Meeting room booking invoice"} · EFT proof attached${popAttachmentName ? ` (${popAttachmentName})` : ""}`,
    });
    setEftModalOpen(false);
    setPopAttachmentName("");
    setPopAttachmentPreview(null);
    setConfirmationOpen(true);
    toast.success("EFT proof submitted for verification.");
  };

  const handleConfirmBooking = () => {
    if (!selectedSpace) return;

    const invoice = createInvoice({
      tenant: role.tenant ?? bookingTitle,
      amount: bookingAmount,
      status: "Unpaid",
      due: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      method: checkoutMethod,
      items: [
        { name: `${selectedSpace.name} · ${selectedBranch} booking`, qty: 1, price: bookingAmount },
      ],
      branch: selectedBranch,
      kind: "marketplace",
      note: `${bookingTitle} · ${bookingGuests} guests · ${selectedDate} · ${bookingNotes}`,
    });

    setGeneratedInvoice(invoice);
    setReservationOpen(false);

    if (checkoutMethod === "Paystack") {
      if (!window.PaystackPop || !paystackReady) {
        toast.info("Loading Paystack checkout…");
        return;
      }

      const popup = window.PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: "tenant@example.com",
        amount: Math.round(invoice.amount * 100),
        currency: "ZAR",
        ref: invoice.id,
        label: `${invoice.tenant} booking invoice`,
        onClose: () => toast.info("Paystack payment closed before completion."),
        callback: (response) => {
          updateGeneratedInvoice(invoice.id, {
            status: "Paid",
            method: "Paystack",
            note: `${invoice.note ?? "Meeting room booking invoice"} · Paystack ref ${response.reference}`,
          });
          setConfirmationOpen(true);
          toast.success(`Paystack payment completed · ${response.reference}`);
        },
      });

      popup.openIframe();
      return;
    }

    if (checkoutMethod === "PayFast") {
      const invoiceRef = encodeURIComponent(invoice.id);
      const amount = Math.round(invoice.amount);
      const target = `https://www.payfast.co.za/portal/checkout?invoice=${invoiceRef}&amount=${amount}`;
      window.open(target, "_blank", "noopener,noreferrer");
      setConfirmationOpen(true);
      return;
    }

    if (checkoutMethod === "EFT") {
      setEftModalOpen(true);
      return;
    }

    setConfirmationOpen(true);
    toast.success(
      `Reservation confirmed for ${selectedSpace.name}. Invoice ${invoice.id} is ready to download.`,
    );
  };

  const downloadGeneratedInvoice = () => {
    if (!generatedInvoice) return;
    downloadInvoicePdf(generatedInvoice);
  };

  return (
    <div className="mx-auto max-w-375">
      <PageHeader
        eyebrow="Cross-Branch Bookings"
        title="Branch availability & bookings"
        description="Choose a branch and date to see which spaces are available for your own meeting, hot desk day, or event."
        actions={
          <>
            <Button variant="outline" size="sm">
              Calendar
            </Button>
            <Button asChild size="sm">
              <Link to="/union-station">Book Union Station</Link>
            </Button>
          </>
        }
      />
      {canReviewOneOffRequests && (
        <section className="mb-6 overflow-hidden rounded-lg border bg-card">
          <div className="flex items-center justify-between gap-3 border-b p-4">
            <div>
              <h2 className="font-display text-base font-semibold">One-off booking requests</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Review availability, submit a price to Finance, then confirm after invoicing.
              </p>
            </div>
            <Badge variant="outline">{oneOffRequests.length}</Badge>
          </div>
          {requestError ? (
            <p role="alert" className="p-4 text-sm text-destructive">{requestError}</p>
          ) : oneOffRequests.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No one-off booking requests yet.</p>
          ) : (
            <div className="divide-y">
              {oneOffRequests.map((request) => (
                <div key={request.id} className="grid gap-4 px-4 py-4 lg:grid-cols-[1fr_auto] lg:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">{request.space_name ?? "Space request"}</p>
                      <Badge variant={request.request_status === "confirmed" ? "default" : request.request_status === "declined" ? "secondary" : "outline"}>
                        {(request.request_status ?? "pending_review").replaceAll("_", " ")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {request.request_reference ?? "Request"} · {branchName(request.branches) ?? "Branch not set"} · {new Date(request.starts_at).toLocaleString()}–{new Date(request.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {request.guests ?? 1} guests
                    </p>
                    {(() => {
                      const contact = leadContact(request.leads);
                      return contact ? <p className="mt-1 text-xs text-muted-foreground">{contact.contact_name} · {contact.company_name} · {contact.contact_email} · {contact.contact_phone}</p> : null;
                    })()}
                    {request.quote_amount_zar ? <p className="mt-1 text-xs font-medium">Branch quote: {formatZAR(request.quote_amount_zar)}{request.quote_notes ? ` · ${request.quote_notes}` : ""}</p> : null}
                    {request.invoice_reference ? <p className="mt-1 text-xs text-muted-foreground">Invoice {request.invoice_reference}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                    {request.request_status === "pending_review" && role.id !== "finance" && (
                      <>
                        <Input
                          type="number"
                          min="1"
                          value={quoteAmounts[request.id] ?? ""}
                          onChange={(event) => setQuoteAmounts((current) => ({ ...current, [request.id]: event.target.value }))}
                          placeholder="Quote (ZAR)"
                          aria-label={`Quote amount for ${request.request_reference ?? "booking request"}`}
                          className="w-36"
                        />
                        <Input
                          value={quoteNotes[request.id] ?? ""}
                          onChange={(event) => setQuoteNotes((current) => ({ ...current, [request.id]: event.target.value }))}
                          placeholder="Quote notes"
                          aria-label={`Quote notes for ${request.request_reference ?? "booking request"}`}
                          className="w-44"
                        />
                        <Button size="sm" onClick={() => void submitOneOffQuote(request.id)} disabled={updatingRequestId === request.id}>Send to Finance</Button>
                        <Button size="sm" variant="outline" onClick={() => void updateOneOffRequest(request.id, "cancelled")} disabled={updatingRequestId === request.id}>Decline</Button>
                      </>
                    )}
                    {request.request_status === "invoice_sent" && role.id !== "finance" && (
                      <Button size="sm" onClick={() => void updateOneOffRequest(request.id, "confirmed")} disabled={updatingRequestId === request.id}>
                        Confirm booking
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      <div id="tenant-booking" className="card-soft p-5 mb-6 border-brand/20 bg-brand/5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-brand">Book Now</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Pick a live branch, choose a date, and review the rooms and spaces that are open for
              your team.
            </p>
          </div>
          <Button asChild size="sm">
            <Link to="/union-station">Book Union Station</Link>
          </Button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-[1.3fr_0.7fr]">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
              Branch
            </div>
            <div className="flex flex-wrap gap-2">
              {branchChoices.map((branch) => (
                <Button
                  key={branch.id}
                  type="button"
                  variant={selectedBranch === branch.name ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedBranch(branch.name)}
                >
                  {branch.name}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2 block">
              Date
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {branchSpaces.map((space) => {
            const isSelected = selectedSpaceId === space.id;
            const isSpaceAvailable = space.status === "Available" || space.status === "Partial";

            return (
              <div key={space.id} className="rounded-xl border bg-background/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{space.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {space.type} · {space.capacity} guests
                    </div>
                  </div>
                  <Badge variant={isSpaceAvailable ? "secondary" : "outline"}>{space.status}</Badge>
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3.5" />
                    {space.branch}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock3 className="size-3.5" />
                    {space.until === "—" ? "Open today" : `Until ${space.until}`}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={isSelected ? "default" : "outline"}
                  className="mt-4"
                  onClick={() => openReservation(space.id)}
                >
                  {isSelected ? "Review reservation" : "Choose this space"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={reservationOpen} onOpenChange={setReservationOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Confirm your booking request</DialogTitle>
            <DialogDescription>
              {selectedSpace
                ? `Request ${selectedSpace.name} in ${selectedBranch} for ${selectedDate}.`
                : "Choose a space to continue."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                Booking title
              </div>
              <Input
                value={bookingTitle}
                onChange={(event) => setBookingTitle(event.target.value)}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                  Guests
                </div>
                <Input
                  value={bookingGuests}
                  onChange={(event) => setBookingGuests(event.target.value)}
                />
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                  Date
                </div>
                <Input value={selectedDate} readOnly />
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                Notes
              </div>
              <Textarea
                value={bookingNotes}
                onChange={(event) => setBookingNotes(event.target.value)}
                rows={4}
              />
            </div>
            <div className="rounded-xl border bg-muted/40 p-3">
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
                Payment choice
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setCheckoutMethod("Charge to account")}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${checkoutMethod === "Charge to account" ? "border-brand bg-brand/10" : "bg-background"}`}
                >
                  <div className="font-medium">Charge to account</div>
                  <div className="text-xs text-muted-foreground">
                    Use the tenant billing account
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setCheckoutMethod("Paystack")}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${checkoutMethod === "Paystack" ? "border-brand bg-brand/10" : "bg-background"}`}
                >
                  <div className="font-medium">Pay now · Paystack</div>
                  <div className="text-xs text-muted-foreground">Open card payment in-app</div>
                </button>
                <button
                  type="button"
                  onClick={() => setCheckoutMethod("PayFast")}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${checkoutMethod === "PayFast" ? "border-brand bg-brand/10" : "bg-background"}`}
                >
                  <div className="font-medium">Pay now · PayFast</div>
                  <div className="text-xs text-muted-foreground">Secure checkout portal</div>
                </button>
                <button
                  type="button"
                  onClick={() => setCheckoutMethod("EFT")}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${checkoutMethod === "EFT" ? "border-brand bg-brand/10" : "bg-background"}`}
                >
                  <div className="font-medium">Pay now · EFT</div>
                  <div className="text-xs text-muted-foreground">Attach proof of payment</div>
                </button>
              </div>
              <div className="mt-3 text-sm text-muted-foreground">
                Booking amount:{" "}
                <span className="font-semibold text-foreground">{formatZAR(bookingAmount)}</span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setReservationOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleConfirmBooking}>
              Confirm booking
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thanks for your interest</DialogTitle>
            <DialogDescription>
              Your booking-space invoice has been generated. This room is only secured once payment
              or a deposit is received.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border bg-muted/40 p-4 text-sm">
            <div className="font-medium">{generatedInvoice?.id ?? "Invoice pending"}</div>
            <div className="mt-2 text-muted-foreground">
              Status: {generatedInvoice?.status ?? "Unpaid"}
            </div>
            <div className="mt-1 text-muted-foreground">
              Method: {generatedInvoice?.method ?? checkoutMethod}
            </div>
            <div className="mt-1 text-muted-foreground">
              Amount:{" "}
              {generatedInvoice ? formatZAR(generatedInvoice.amount) : formatZAR(bookingAmount)}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmationOpen(false)}>
              Close
            </Button>
            <Button type="button" onClick={downloadGeneratedInvoice}>
              Download invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={eftModalOpen} onOpenChange={setEftModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pay via EFT</DialogTitle>
            <DialogDescription>
              Use the banking details below to transfer payment, then attach your proof of payment
              for verification.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 text-sm">
            <div className="rounded-xl border bg-muted/40 p-4">
              <div className="font-medium">Office & Co</div>
              <div className="mt-1 text-muted-foreground">Bank: O7Co Business Account</div>
              <div className="mt-1 text-muted-foreground">Account holder: Office & Co</div>
              <div className="mt-1 text-muted-foreground">Account number: 1234 567 890</div>
              <div className="mt-1 text-muted-foreground">Branch code: 632005</div>
              <div className="mt-1 text-muted-foreground">
                Reference: {generatedInvoice?.id ?? "booking invoice"}
              </div>
            </div>
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Proof of payment upload
              </label>
              <Input type="file" onChange={handlePopUpload} />
              {popAttachmentName ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  Attached: {popAttachmentName}
                </div>
              ) : null}
              {popAttachmentPreview ? (
                <img
                  src={popAttachmentPreview}
                  alt="Proof of payment preview"
                  className="mt-3 max-h-40 rounded-md border"
                />
              ) : null}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setEftModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submitEftProof}>
              Submit EFT proof
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showInternalBookingPanels ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard label="Bookings today" value="324" delta="▲ 18 vs avg" accent="brand" />
            <StatCard label="Cross-branch" value="47" hint="14% of all" />
            <StatCard label="Peak utilization" value="11am" hint="84% rooms in use" />
            <StatCard label="Waiting lists" value="6" accent="warning" />
          </div>

          <div className="card-soft p-5 mb-6 border-brand/20 bg-brand/5">
            <div className="flex items-center gap-2 text-sm font-medium text-brand">
              <Sparkles className="size-4" /> Guided viewing request
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Your tour request is being managed with sales support. Choose a date and time below,
              and our team will confirm the best available viewing slot for your preferred branch.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 mb-6">
            {tourSlots.map((slot) => (
              <div key={`${slot.branch}-${slot.day}`} className="card-soft p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{slot.branch}</div>
                    <div className="text-sm text-muted-foreground">{slot.note}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    Sales assisted
                  </Badge>
                </div>
                <div className="mt-4 flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays className="size-4" />
                    {slot.day}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock3 className="size-4" />
                    {slot.time}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-4" />
                    {slot.branch}
                  </span>
                </div>
                <Button asChild size="sm" className="mt-4">
                  <Link to="/tour-calendar">Choose this slot</Link>
                </Button>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <div className="card-soft overflow-hidden">
        <div className="grid grid-cols-[180px_1fr] border-b bg-muted/30">
          <div className="px-4 py-2.5 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
            Branch / Room
          </div>
          <div className="grid grid-cols-10">
            {slots.map((s) => (
              <div key={s} className="px-2 py-2.5 text-[11px] text-muted-foreground border-l">
                {s}
              </div>
            ))}
          </div>
        </div>
        {branches.slice(0, 6).map((b) => {
          const rooms = sample.filter((s) => s.branch === b.name);
          if (rooms.length === 0)
            return (
              <div key={b.id} className="grid grid-cols-[180px_1fr] border-b">
                <div className="px-4 py-4">
                  <div className="text-sm font-medium">{b.name}</div>
                  <div className="text-[11px] text-muted-foreground">No bookings</div>
                </div>
                <div className="grid grid-cols-10">
                  {slots.map((s) => (
                    <div key={s} className="border-l h-12" />
                  ))}
                </div>
              </div>
            );
          return rooms.map((r, idx) => (
            <div key={`${b.id}-${idx}`} className="grid grid-cols-[180px_1fr] border-b">
              <div className="px-4 py-3">
                <div className="text-sm font-medium">{idx === 0 ? b.name : ""}</div>
                <div className="text-[11px] text-muted-foreground">{r.room}</div>
              </div>
              <div className="grid grid-cols-10 relative h-12">
                {slots.map((s, i) => (
                  <div key={s} className="border-l h-full" data-i={i} />
                ))}
                <div
                  className="absolute top-1.5 bottom-1.5 rounded-md bg-brand/15 border border-brand/40 px-2 flex items-center text-[11px] text-foreground/85"
                  style={{ left: `${(r.start / 10) * 100}%`, width: `${(r.span / 10) * 100}%` }}
                >
                  <span className="truncate font-medium">{r.tenant}</span>
                  <Badge variant="outline" className="ml-auto text-[9px] bg-card">
                    {r.kind}
                  </Badge>
                </div>
              </div>
            </div>
          ));
        })}
      </div>
    </div>
  );
}
