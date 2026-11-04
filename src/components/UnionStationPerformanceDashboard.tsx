import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, FileText, Landmark, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
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
import { getSupabaseClient } from "@/lib/supabase";
import { useRole } from "@/lib/role-context";
import { toast } from "sonner";

type VenueRequest = {
  id: string;
  reference: string;
  client_company: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  alternate_phone: string | null;
  event_type: string;
  event_date: string;
  starts_time: string;
  ends_time: string;
  attendees: number;
  layout: string;
  catering: string;
  menu_requirements: string;
  equipment_requirements: string;
  av_addons: string[];
  notes: string | null;
  status: string;
  estimate_zar: number;
  contract_sent: boolean;
  contract_signed: boolean;
};

type QuoteLineItem = {
  id: string;
  item: string;
  description: string;
  quantity: string;
  rate: string;
  discount: string;
  serviceFee: string;
};

const VAT_RATE = 0.15;

const money = (amount: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(amount);

const newQuoteLine = (item = "", description = "", quantity = "1"): QuoteLineItem => ({
  id: crypto.randomUUID(),
  item,
  description,
  quantity,
  rate: "",
  discount: "0",
  serviceFee: "0",
});

const equipmentOptions = [
  "No equipment required",
  "Projector and screen",
  "Microphone and PA system",
  "Video conferencing equipment",
  "Flip chart or whiteboard",
  "Additional tables or chairs",
  "Other",
];

const equipmentQuoteLines = (requirements: string): QuoteLineItem[] => {
  if (!requirements.trim()) return [];

  const parts = requirements.split(/\s*[:,]\s*/).filter(Boolean);
  const selected = parts.filter((part) => equipmentOptions.includes(part));
  if (selected.includes("No equipment required")) return [];
  if (!selected.length) return [newQuoteLine("Equipment hire", requirements)];

  const details = parts.filter((part) => !equipmentOptions.includes(part)).join(": ");
  return selected.map((option) => newQuoteLine(
    option === "Other" ? "Other equipment" : option,
    option === "Other" ? details || "As requested" : "Selected by visitor",
  ));
};

const initialQuoteLines = (request: VenueRequest): QuoteLineItem[] => [
  newQuoteLine(
    "Venue hire",
    `${request.event_type} · ${request.layout || "Layout to be confirmed"} · ${request.attendees} guests`,
  ),
  ...(request.catering ? [newQuoteLine(
    "Catering",
    [request.catering, request.menu_requirements, `For ${request.attendees} guests`].filter(Boolean).join(" · "),
  )] : []),
  ...equipmentQuoteLines(request.equipment_requirements),
  ...(request.av_addons.length ? [newQuoteLine("AV and production", request.av_addons.join(", "))] : []),
];

export function UnionStationPerformanceDashboard() {
  const { role } = useRole();
  const [requests, setRequests] = useState<VenueRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [quoteRequest, setQuoteRequest] = useState<VenueRequest | null>(null);
  const [quoteRecipientAddress, setQuoteRecipientAddress] = useState("");
  const [quoteItems, setQuoteItems] = useState<QuoteLineItem[]>([]);
  const [quoteNotes, setQuoteNotes] = useState("");
  const [savingQuote, setSavingQuote] = useState(false);
  const [issuingInvoiceId, setIssuingInvoiceId] = useState<string | null>(null);
  const canQuote = ["branch-manager", "crm-manager", "sales-manager", "group-admin", "group-ceo", "superadmin"].includes(role.id);
  const canIssueInvoice = ["branch-manager", "crm-manager", "sales-manager", "group-admin", "group-ceo", "superadmin", "finance"].includes(role.id);
  const pricedItems = quoteItems.map((item) => {
    const quantity = Number(item.quantity) || 0;
    const rate = Number(item.rate) || 0;
    const discountRate = Number(item.discount) || 0;
    const serviceFeeRate = Number(item.serviceFee) || 0;
    const subtotal = Math.round(quantity * rate);
    const discountAmount = Math.round(subtotal * discountRate / 100);
    const serviceFeeAmount = Math.round(quantity * serviceFeeRate);
    return { ...item, subtotal, discountAmount, serviceFeeAmount, amount: subtotal - discountAmount };
  });
  const quoteSubtotal = pricedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const quoteDiscount = pricedItems.reduce((sum, item) => sum + item.discountAmount, 0);
  const quoteServiceFees = pricedItems.reduce((sum, item) => sum + item.serviceFeeAmount, 0);
  const quoteTaxableAmount = quoteSubtotal - quoteDiscount + quoteServiceFees;
  const quoteVat = Math.round(quoteTaxableAmount * VAT_RATE);
  const quoteTotal = quoteTaxableAmount + quoteVat;

  const updateQuoteItem = (id: string, field: keyof Omit<QuoteLineItem, "id">, value: string) => {
    setQuoteItems((items) => items.map((item) => item.id === id ? { ...item, [field]: value } : item));
  };

  const loadRequests = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Workspace event data is not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: queryError } = await supabase
      .from("union_station_requests")
      .select(
        "id,reference,client_company,contact_name,contact_email,contact_phone,alternate_phone,event_type,event_date,starts_time,ends_time,attendees,layout,catering,menu_requirements,equipment_requirements,av_addons,notes,status,estimate_zar,contract_sent,contract_signed",
      )
      .order("event_date", { ascending: false })
      .limit(500);
    if (queryError) {
      setError(queryError.message);
      setRequests([]);
    } else {
      setError("");
      setRequests((data ?? []) as VenueRequest[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const saveQuote = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!quoteRequest) return;
    const amount = quoteTotal;
    if (!quoteRecipientAddress.trim()) {
      toast.error("Add the visitor's billing address to the quotation.");
      return;
    }
    if (!Number.isInteger(amount) || amount < 1 || amount > 10_000_000) {
      toast.error("Enter line-item rates for a total between R1 and R10,000,000.");
      return;
    }
    const quoteBreakdown = [
      `OFFICE & CO | UNION STATION QUOTATION ${quoteRequest.reference}`,
      `Prepared for: ${quoteRequest.client_company} · ${quoteRequest.contact_name} · ${quoteRequest.contact_email}`,
      `Visitor address: ${quoteRecipientAddress.trim()}`,
      `Event: ${quoteRequest.event_type} · ${quoteRequest.event_date} · ${quoteRequest.starts_time.slice(0, 5)}-${quoteRequest.ends_time.slice(0, 5)} · ${quoteRequest.attendees} guests`,
      "Items | Description | Qty | Rate / unit (ZAR) | Discount (%) | Service fee / unit (ZAR) | Amount (ZAR)",
      ...pricedItems.map((item) => `${item.item} | ${item.description} | ${item.quantity} | ${item.rate} | ${item.discount}% | ${item.serviceFee} | ${item.amount}`),
      `Subtotal: ${quoteSubtotal}`,
      `Discount: -${quoteDiscount}`,
      `Service fees: ${quoteServiceFees}`,
      `VAT (${VAT_RATE * 100}%): ${quoteVat}`,
      `Total: ${amount}`,
      quoteNotes.trim() ? `Terms / notes: ${quoteNotes.trim()}` : "",
    ].filter(Boolean).join("\n");
    if (quoteBreakdown.length > 2000) {
      toast.error("Shorten the quote descriptions or notes so the quotation can be saved.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSavingQuote(true);
    const { error: quoteError } = await supabase.rpc("submit_union_station_quote", {
      p_request_id: quoteRequest.id,
      p_quote_amount_zar: amount,
      p_quote_notes: quoteBreakdown,
    });
    setSavingQuote(false);
    if (quoteError) {
      toast.error(`Could not save Union Station quote: ${quoteError.message}`);
      return;
    }
    setRequests((current) => current.map((request) => request.id === quoteRequest.id
      ? { ...request, estimate_zar: amount, status: "quoted" }
      : request));
    setQuoteRequest(null);
    setQuoteRecipientAddress("");
    setQuoteItems([]);
    setQuoteNotes("");
    toast.success("Union Station quote saved.");
  };

  const issueInvoice = async (request: VenueRequest) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setIssuingInvoiceId(request.id);
    const { data, error: invoiceError } = await supabase.rpc("issue_union_station_invoice", {
      p_request_id: request.id,
    });
    setIssuingInvoiceId(null);
    if (invoiceError) {
      toast.error(`Could not issue Union Station invoice: ${invoiceError.message}`);
      return;
    }
    setRequests((current) => current.map((item) => item.id === request.id
      ? { ...item, status: "invoiced" }
      : item));
    const result = data as { invoice_reference: string };
    toast.success(`Invoice ${result.invoice_reference} issued.`);
  };

  const activeRequests = requests.filter(
    (request) => !["completed", "declined"].includes(request.status),
  );
  const confirmed = requests.filter((request) =>
    ["confirmed", "invoiced", "completed"].includes(request.status),
  );
  const pipeline = requests.filter((request) =>
    ["submitted", "in_review", "quoted"].includes(request.status),
  );
  const confirmedEstimate = confirmed.reduce((sum, request) => sum + request.estimate_zar, 0);
  const pipelineEstimate = pipeline.reduce((sum, request) => sum + request.estimate_zar, 0);
  const expectedAttendees = activeRequests.reduce((sum, request) => sum + request.attendees, 0);
  const monthlyActivity = useMemo(() => {
    const current = new Date();
    return Array.from({ length: 6 }, (_, index) => {
      const month = new Date(current.getFullYear(), current.getMonth() - 5 + index, 1);
      const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
      const monthRequests = requests.filter((request) => request.event_date.startsWith(key));
      return {
        label: new Intl.DateTimeFormat("en-ZA", { month: "short", year: "2-digit" }).format(month),
        count: monthRequests.length,
        estimate: monthRequests.reduce((sum, request) => sum + request.estimate_zar, 0),
      };
    });
  }, [requests]);

  return (
    <div className="mx-auto max-w-350 space-y-5">
      <PageHeader
        eyebrow={
          role.id === "group-ceo"
            ? "Group Operations · Union Station"
            : "Union Station · Venue operations"
        }
        title={role.id === "group-ceo" ? "Union Station performance" : "Union Station admin"}
        description="Internal venue operations: review event enquiries, prepare quotes, and track contract status. This is separate from the visitor booking page."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/union-station">
                Visitor booking page <ArrowUpRight className="ml-1 size-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadRequests()}
              disabled={loading}
              aria-label="Refresh venue requests"
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </>
        }
      />
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          Venue data unavailable: {error}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Confirmed estimate"
          value={loading ? "—" : money(confirmedEstimate)}
          hint="Confirmed, invoiced, completed"
          accent="success"
        />
        <StatCard
          label="Open pipeline estimate"
          value={loading ? "—" : money(pipelineEstimate)}
          hint={`${pipeline.length} active requests`}
          accent="brand"
        />
        <StatCard
          label="Active requests"
          value={loading ? "—" : String(activeRequests.length)}
          hint="Live venue workflow"
        />
        <StatCard
          label="Expected attendees"
          value={loading ? "—" : new Intl.NumberFormat("en-ZA").format(expectedAttendees)}
          hint="Active requests"
          accent="brand"
        />
      </div>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b p-4">
          <h2 className="font-display text-base font-semibold">Recent venue activity</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Request estimates are not collected revenue; invoices and payments remain the accounting
            source.
          </p>
        </div>
        {loading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading venue records…</p>
        ) : requests.length === 0 ? (
          <div className="grid justify-items-center gap-2 p-8 text-center">
            <Landmark className="size-7 text-muted-foreground/60" />
            <p className="text-sm font-medium">No venue requests found</p>
            <p className="text-xs text-muted-foreground">
              Request and event performance will appear when records exist.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Client</th>
                  <th className="px-4 py-3 font-medium">Event</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 text-right font-medium">Attendees</th>
                  <th className="px-4 py-3 text-right font-medium">Estimate</th>
                  <th className="px-4 py-3 text-right font-medium">Contract</th>
                  <th className="px-4 py-3 text-right font-medium">Status</th>
                  {canQuote || canIssueInvoice ? <th className="px-4 py-3 text-right font-medium">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y">
                {requests.map((request) => (
                  <tr key={request.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs">{request.reference}</td>
                    <td className="px-4 py-3 font-medium">{request.client_company}</td>
                    <td className="px-4 py-3">
                      {request.event_type} · {request.layout}
                    </td>
                    <td className="px-4 py-3">
                      {request.event_date} · {request.starts_time.slice(0, 5)}–
                      {request.ends_time.slice(0, 5)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3.5 text-muted-foreground" />
                        {request.attendees}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {money(request.estimate_zar)}
                    </td>
                    <td className="px-4 py-3 text-right text-xs">
                      {request.contract_signed
                        ? "Signed"
                        : request.contract_sent
                          ? "Sent"
                          : "Not sent"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge
                        variant={
                          ["declined", "completed"].includes(request.status)
                            ? "secondary"
                            : ["confirmed", "invoiced"].includes(request.status)
                              ? "default"
                              : "outline"
                        }
                      >
                        {request.status.replaceAll("_", " ")}
                      </Badge>
                    </td>
                    {canQuote || canIssueInvoice ? (
                      <td className="px-4 py-3 text-right">
                        {canQuote && ["submitted", "in_review"].includes(request.status) ? (
                          <Button size="sm" variant="outline" onClick={() => {
                            setQuoteRequest(request);
                            setQuoteRecipientAddress("");
                            setQuoteItems(initialQuoteLines(request));
                            setQuoteNotes("");
                          }}>
                            <FileText className="mr-1.5 size-4" />Prepare quote
                          </Button>
                        ) : request.status === "quoted" && canIssueInvoice ? (
                          <Button size="sm" onClick={() => void issueInvoice(request)} disabled={issuingInvoiceId === request.id}>
                            <FileText className="mr-1.5 size-4" />{issuingInvoiceId === request.id ? "Issuing…" : "Issue invoice"}
                          </Button>
                        ) : request.status === "quoted" ? (
                          <span className="text-xs text-muted-foreground">Quote saved</span>
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

      <section className="rounded-lg border bg-card p-4 sm:p-5">
        <div className="mb-3">
          <h2 className="font-display text-base font-semibold">Six-month request activity</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Based on event dates and stored estimates.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {monthlyActivity.map((month) => (
            <div key={month.label} className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">{month.label}</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{month.count}</div>
              <div className="text-xs tabular-nums text-muted-foreground">
                {money(month.estimate)}
              </div>
            </div>
          ))}
        </div>
      </section>
      <Dialog open={quoteRequest !== null} onOpenChange={(open) => !open && setQuoteRequest(null)}>
        <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Prepare Union Station quotation</DialogTitle>
            <DialogDescription>Review the visitor details, add itemized pricing, and save the quotation.</DialogDescription>
          </DialogHeader>
          {quoteRequest && <form onSubmit={(event) => void saveQuote(event)} className="space-y-4">
            <section className="space-y-5 border bg-background p-4 sm:p-6">
              <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
                <div className="flex items-center gap-3">
                  <BrandLogo className="size-12 rounded-md bg-primary p-1.5 object-contain" />
                  <div>
                    <div className="font-display text-lg font-semibold">Office &amp; Co</div>
                    <div className="text-xs text-muted-foreground">Union Station · Johannesburg</div>
                  </div>
                </div>
                <div className="text-left sm:text-right">
                  <div className="text-xs font-semibold uppercase tracking-wide text-brand">Quotation</div>
                  <div className="mt-1 text-sm font-semibold">{quoteRequest.reference}</div>
                  <div className="text-xs text-muted-foreground">Prepared {new Date().toLocaleDateString("en-ZA")}</div>
                </div>
              </header>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Prepared for</div>
                  <div className="text-sm font-semibold">{quoteRequest.client_company}</div>
                  <div className="text-sm">{quoteRequest.contact_name}</div>
                  <div className="text-sm text-muted-foreground">{quoteRequest.contact_email}</div>
                  <div className="text-sm text-muted-foreground">{quoteRequest.contact_phone || "No phone provided"}</div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="union-quote-address">Visitor / billing address</Label>
                  <Textarea
                    id="union-quote-address"
                    rows={3}
                    maxLength={250}
                    required
                    placeholder="Street address, suburb, city, postal code"
                    value={quoteRecipientAddress}
                    onChange={(event) => setQuoteRecipientAddress(event.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-2 border-y py-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div><span className="font-medium">Event:</span> {quoteRequest.event_type}</div>
                <div><span className="font-medium">Date:</span> {quoteRequest.event_date}</div>
                <div><span className="font-medium">Time:</span> {quoteRequest.starts_time.slice(0, 5)}–{quoteRequest.ends_time.slice(0, 5)}</div>
                <div><span className="font-medium">Guests:</span> {quoteRequest.attendees}</div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Items and pricing</h3>
                  <Button type="button" size="sm" variant="outline" onClick={() => setQuoteItems((items) => [...items, newQuoteLine()])}>
                    <Plus className="mr-1 size-4" />Add item
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full min-w-[1020px] border-collapse text-sm">
                    <thead className="bg-muted/70 text-left text-xs">
                      <tr>
                        <th className="border-b px-2 py-2">Item</th>
                        <th className="border-b px-2 py-2">Description</th>
                        <th className="border-b px-2 py-2 text-right">Qty</th>
                        <th className="border-b px-2 py-2 text-right">Rate / unit (ZAR)</th>
                        <th className="border-b px-2 py-2 text-right">Discount %</th>
                        <th className="border-b px-2 py-2 text-right">Service fee / unit (ZAR)</th>
                        <th className="border-b px-2 py-2 text-right">Amount</th>
                        <th className="w-10 border-b px-2 py-2"><span className="sr-only">Remove item</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pricedItems.map((item) => (
                        <tr key={item.id}>
                          <td className="border-b p-1.5"><Input aria-label="Item" className="h-8 min-w-28" maxLength={80} required value={item.item} onChange={(event) => updateQuoteItem(item.id, "item", event.target.value)} /></td>
                          <td className="border-b p-1.5"><Input aria-label="Description" className="h-8 min-w-40" maxLength={140} required value={item.description} onChange={(event) => updateQuoteItem(item.id, "description", event.target.value)} /></td>
                          <td className="border-b p-1.5"><Input aria-label="Quantity" className="h-8 w-20 text-right tabular-nums" type="number" min="1" step="1" required value={item.quantity} onChange={(event) => updateQuoteItem(item.id, "quantity", event.target.value)} /></td>
                          <td className="border-b p-1.5"><Input aria-label="Rate in ZAR" className="h-8 w-28 text-right tabular-nums" type="number" min="0" max="10000000" step="1" required value={item.rate} onChange={(event) => updateQuoteItem(item.id, "rate", event.target.value)} /></td>
                          <td className="border-b p-1.5"><Input aria-label="Discount percent" className="h-8 w-24 text-right tabular-nums" type="number" min="0" max="100" step="0.01" required value={item.discount} onChange={(event) => updateQuoteItem(item.id, "discount", event.target.value)} /></td>
                          <td className="border-b p-1.5"><Input aria-label="Service fee per unit in ZAR" className="h-8 w-32 text-right tabular-nums" type="number" min="0" max="10000000" step="1" required value={item.serviceFee} onChange={(event) => updateQuoteItem(item.id, "serviceFee", event.target.value)} /></td>
                          <td className="border-b px-2 py-1.5 text-right font-medium tabular-nums">{money(item.amount)}</td>
                          <td className="border-b p-1.5 text-center">
                            <Button type="button" size="icon" variant="ghost" aria-label={`Remove ${item.item || "line item"}`} disabled={quoteItems.length === 1} onClick={() => setQuoteItems((items) => items.filter((entry) => entry.id !== item.id))}>
                              <Trash2 className="size-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="ml-auto grid max-w-sm gap-1 border-t pt-3 text-sm">
                  <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{money(quoteSubtotal)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>Discount</span><span className="tabular-nums">−{money(quoteDiscount)}</span></div>
                  <div className="flex justify-between"><span>Service fees</span><span className="tabular-nums">{money(quoteServiceFees)}</span></div>
                  <div className="flex justify-between"><span>VAT ({VAT_RATE * 100}%)</span><span className="tabular-nums">{money(quoteVat)}</span></div>
                  <div className="flex justify-between border-t pt-2 text-base font-semibold"><span>Quote total (ZAR)</span><span className="tabular-nums">{money(quoteTotal)}</span></div>
                </div>
              </div>

              <div className="grid gap-4 border-t pt-4 md:grid-cols-2">
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div className="font-semibold uppercase tracking-wide text-foreground">Office &amp; Co · Union Station</div>
                  <p>Johannesburg, Gauteng, South Africa</p>
                  <p>Pricing and availability are subject to final review and written confirmation.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="union-quote-notes">Quote terms / notes</Label>
                  <Textarea id="union-quote-notes" rows={3} maxLength={1000} value={quoteNotes} onChange={(event) => setQuoteNotes(event.target.value)} placeholder="Validity period, payment terms, or additional details" />
                </div>
              </div>
            </section>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setQuoteRequest(null)}>Cancel</Button>
              <Button type="submit" disabled={savingQuote || quoteTotal < 1 || quoteTotal > 10_000_000}>
                {savingQuote ? "Saving…" : `Save quote · ${money(quoteTotal)}`}
              </Button>
            </DialogFooter>
          </form>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
