import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  branches,
  bookings,
  events,
  spaces,
  unionStations,
  formatZAR,
  loadInvoices,
  loadBillingDrafts,
  prepareMonthlyBilling,
  sendBillingInvoices,
  downloadInvoicePdf,
  saveInvoices,
  tenantOrderHistory,
  PAYSTACK_PUBLIC_KEY,
  type Invoice,
  type InvoiceMethod,
} from "@/lib/mock";
import {
  getSageApiClient,
  getSageRuntimeMode,
  mapSageInvoiceToAppInvoice,
  isSageConfigured,
} from "@/lib/sage-api";
import { useRole } from "@/lib/role-context";
import { getSupabaseClient } from "@/lib/supabase";
import { toast } from "sonner";
import { SageStatusBanner } from "@/components/SageStatusBanner";
import { OrganizationBillingView } from "@/components/tenant/OrganizationViews";

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

export const Route = createFileRoute("/billing")({
  head: () => ({ meta: [{ title: "Billing — WorkspaceOS" }] }),
  component: Billing,
});

function Billing() {
  const { role } = useRole();
  if (role.id === "organization-admin" || role.id === "organization-member") {
    return <OrganizationBillingView />;
  }
  return <AdminBilling />;
}

type FinanceBookingQuote = {
  id: string;
  request_reference: string;
  request_status: string;
  invoice_reference: string | null;
  quote_amount_zar: number;
  quote_notes: string | null;
  space_name: string | null;
  starts_at: string;
  ends_at: string;
  guests: number | null;
  leads: { contact_name: string; company_name: string; contact_email: string } | { contact_name: string; company_name: string; contact_email: string }[] | null;
  branches: { name: string } | { name: string }[] | null;
};

function FinanceBookingQueue() {
  const { role } = useRole();
  const [requests, setRequests] = useState<FinanceBookingQuote[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const loadRequests = useCallback(async () => {
    if (role.id !== "finance") return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data, error: queryError } = await supabase
      .from("bookings")
      .select("id,request_reference,request_status,invoice_reference,quote_amount_zar,quote_notes,space_name,starts_at,ends_at,guests,leads(contact_name,company_name,contact_email),branches(name)")
      .in("request_status", ["quoted", "invoice_sent", "confirmed"])
      .order("quote_submitted_at", { ascending: true })
      .limit(100);
    if (queryError) setError(queryError.message);
    else {
      setError("");
      setRequests((data ?? []) as FinanceBookingQuote[]);
    }
  }, [role.id]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const issueInvoice = async (bookingId: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setBusyId(bookingId);
    const { data, error: issueError } = await supabase.rpc("issue_one_off_booking_invoice", {
      p_booking_id: bookingId,
    });
    if (issueError) {
      setBusyId("");
      toast.error(issueError.message);
      return;
    }
    const result = data as { invoice_reference: string; email_token: string };
    const { data: delivery, error: deliveryError } = await supabase.functions.invoke("deliver-booking-emails", {
      body: { booking_id: bookingId, email_token: result.email_token },
    });
    setBusyId("");
    if (deliveryError || delivery?.failed > 0) {
      toast.warning(`Invoice ${result.invoice_reference} was issued, but customer email delivery needs attention.`);
    } else {
      toast.success(`Invoice ${result.invoice_reference} issued and emailed to the customer.`);
    }
    await loadRequests();
  };

  const relation = <T,>(value: T | T[] | null) => Array.isArray(value) ? value[0] : value;

  if (role.id !== "finance") return null;

  return (
    <section className="mb-6 overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-3 border-b p-4">
        <div>
          <h2 className="font-display text-base font-semibold">Booking quotes awaiting Finance</h2>
          <p className="mt-1 text-xs text-muted-foreground">Review branch quotes and track issued invoices.</p>
        </div>
        <Badge variant="outline">{requests.length}</Badge>
      </div>
      {error ? <p role="alert" className="p-4 text-sm text-destructive">{error}</p> : requests.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No booking quotes are awaiting Finance.</p>
      ) : (
        <div className="divide-y">
          {requests.map((request) => {
            const lead = relation(request.leads);
            const branch = relation(request.branches);
            return (
              <div key={request.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{request.request_reference} · {request.space_name ?? "Space request"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {branch?.name ?? "Branch"} · {lead?.contact_name ?? "Contact"} · {lead?.company_name ?? "Company"} · {lead?.contact_email ?? "Email unavailable"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(request.starts_at).toLocaleString()}–{new Date(request.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {request.guests ?? 1} guests
                    {request.quote_notes ? ` · ${request.quote_notes}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums">{formatZAR(request.quote_amount_zar)}</span>
                  {request.request_status === "quoted" ? (
                    <Button size="sm" onClick={() => void issueInvoice(request.id)} disabled={busyId === request.id}>
                      {busyId === request.id ? "Issuing…" : "Issue invoice & email"}
                    </Button>
                  ) : (
                    <Badge variant="secondary">Invoice {request.invoice_reference ?? "issued"}</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AdminBilling() {
  const { role, canSeeRevenue, canSeeInvoiceStatus } = useRole();
  const [invoiceRows, setInvoiceRows] = useState<Invoice[]>([]);
  const [draftRows, setDraftRows] = useState<Invoice[]>([]);
  const [billingMonth, setBillingMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [activeRevenueTab, setActiveRevenueTab] = useState<
    "overview" | "tenants" | "bookings" | "events" | "cafe" | "marketplace" | "union"
  >("overview");
  const [rentalCheckoutMethod, setRentalCheckoutMethod] = useState<InvoiceMethod>("Paystack");
  const [showRentalCheckout, setShowRentalCheckout] = useState(false);
  const [paystackReady, setPaystackReady] = useState(false);
  const [eftModalOpen, setEftModalOpen] = useState(false);
  const [popAttachmentName, setPopAttachmentName] = useState("");
  const [popAttachmentPreview, setPopAttachmentPreview] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const rentalCheckoutRef = useRef<HTMLDivElement | null>(null);
  const isTenantAdmin = role.id === "tenant-admin";
  const sageClient = getSageApiClient();
  const sageReady = isSageConfigured();
  const sageMode = getSageRuntimeMode();
  const sageUiMode = sageReady ? (sageMode === "sandbox" ? "sandbox" : "live") : "demo";

  const tenantRevenue = spaces.reduce((sum, space) => sum + (space.monthlyRent ?? 0), 0);
  const bookingRevenue = bookings.reduce((sum, booking) => sum + booking.total, 0);
  const totalBookings = bookings.length;
  const eventRevenue = events.reduce((sum, event) => sum + (event.total ?? 0), 0);
  const totalEvents = events.length;
  const unionRevenue = unionStations.reduce((sum, station) => sum + station.revenue, 0);
  const totalUnionStations = unionStations.length;

  const branchPerformance = branches
    .filter((branch) => branch.status === "live")
    .map((branch) => {
      const branchSpaces = spaces.filter((space) => space.branch === branch.name);
      const branchCapacity = branchSpaces.reduce((sum, space) => sum + space.capacity, 0);
      const tenantRevenue = branchSpaces.reduce((sum, space) => sum + (space.monthlyRent ?? 0), 0);
      const cafeOrders = tenantOrderHistory.filter(
        (order) => order.kind === "cafe" && order.branch === branch.name,
      );
      const cafeSales = cafeOrders.reduce((sum, order) => sum + order.total, 0);
      const marketplaceOrders = tenantOrderHistory.filter(
        (order) => order.kind === "marketplace" && order.branch === branch.name,
      );
      const marketplaceSales = marketplaceOrders.reduce((sum, order) => sum + order.total, 0);
      const branchBookings = bookings.filter((booking) => booking.branch === branch.name);
      const bookingRevenue = branchBookings.reduce((sum, booking) => sum + booking.total, 0);
      const branchEvents = events.filter((event) => event.branch === branch.name);
      const eventRevenue = branchEvents.reduce((sum, event) => sum + (event.total ?? 0), 0);
      const branchUnion = unionStations.filter((station) => station.branch === branch.name);
      const unionRevenue = branchUnion.reduce((sum, station) => sum + station.revenue, 0);

      return {
        branch: branch.name,
        occupancy: branch.occupancy,
        capacity: branchCapacity,
        spaces: branchSpaces.length,
        tenantRevenue,
        cafeSales,
        marketplaceSales,
        bookingRevenue,
        eventRevenue,
        unionRevenue,
        totalRevenue:
          tenantRevenue +
          cafeSales +
          marketplaceSales +
          bookingRevenue +
          eventRevenue +
          unionRevenue,
        cafeOrderCount: cafeOrders.length,
        marketplaceOrderCount: marketplaceOrders.length,
        bookingCount: branchBookings.length,
        eventCount: branchEvents.length,
        unionCount: branchUnion.length,
      };
    })
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  const totalTenantRevenue = branchPerformance.reduce((sum, row) => sum + row.tenantRevenue, 0);
  const totalCafeSales = branchPerformance.reduce((sum, row) => sum + row.cafeSales, 0);
  const totalMarketplaceSales = branchPerformance.reduce(
    (sum, row) => sum + row.marketplaceSales,
    0,
  );
  const totalBookingRevenue = branchPerformance.reduce((sum, row) => sum + row.bookingRevenue, 0);
  const totalEventRevenue = branchPerformance.reduce((sum, row) => sum + row.eventRevenue, 0);
  const totalUnionRevenue = branchPerformance.reduce((sum, row) => sum + row.unionRevenue, 0);
  const totalBranchRevenue =
    totalTenantRevenue +
    totalCafeSales +
    totalMarketplaceSales +
    totalBookingRevenue +
    totalEventRevenue +
    totalUnionRevenue;

  const topBranch = branchPerformance[0];
  const totalCafeOrders = branchPerformance.reduce((sum, row) => sum + row.cafeOrderCount, 0);
  const totalMarketplaceOrders = branchPerformance.reduce(
    (sum, row) => sum + row.marketplaceOrderCount,
    0,
  );
  const totalBookingsCount = branchPerformance.reduce((sum, row) => sum + row.bookingCount, 0);
  const totalEventsCount = branchPerformance.reduce((sum, row) => sum + row.eventCount, 0);
  const totalUnionCount = branchPerformance.reduce((sum, row) => sum + row.unionCount, 0);

  const revenueMix = {
    tenants: totalBranchRevenue === 0 ? 0 : (totalTenantRevenue / totalBranchRevenue) * 100,
    bookings: totalBranchRevenue === 0 ? 0 : (totalBookingRevenue / totalBranchRevenue) * 100,
    events: totalBranchRevenue === 0 ? 0 : (totalEventRevenue / totalBranchRevenue) * 100,
    cafe: totalBranchRevenue === 0 ? 0 : (totalCafeSales / totalBranchRevenue) * 100,
    marketplace: totalBranchRevenue === 0 ? 0 : (totalMarketplaceSales / totalBranchRevenue) * 100,
    union: totalBranchRevenue === 0 ? 0 : (totalUnionRevenue / totalBranchRevenue) * 100,
  };

  const syncBillingWithSage = async (reason: "bootstrap" | "retry" = "bootstrap") => {
    const localInvoices = loadInvoices();
    setInvoiceRows(localInvoices);
    setDraftRows(loadBillingDrafts());

    if (!sageClient) {
      setSyncError(null);
      setLastSyncedAt(null);
      return;
    }

    try {
      setIsSyncing(true);
      setSyncError(null);
      const sageInvoices = await sageClient.getInvoices({ top: 100 });
      const mapped = sageInvoices.map(mapSageInvoiceToAppInvoice);

      if (mapped.length > 0) {
        setInvoiceRows(mapped);
      }

      setLastSyncedAt(new Date().toLocaleString());
      if (reason === "retry") {
        toast.success("Billing sync retried successfully.");
      }
    } catch (error) {
      console.error("Failed to sync billing with Sage:", error);
      const message = error instanceof Error ? error.message : "Could not sync with Sage.";
      setSyncError(`Could not sync billing with Sage. Showing local billing data. ${message}`);
      setInvoiceRows(localInvoices);
      toast.error("Billing sync failed. Local billing data remains visible.");
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    void syncBillingWithSage();
  }, [sageClient]);

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

  const scopedInvoiceRows = isTenantAdmin
    ? invoiceRows.filter((invoice) => invoice.tenant === role.tenant)
    : invoiceRows;

  const rentalInvoice =
    invoiceRows.find(
      (invoice) =>
        invoice.tenant === role.tenant &&
        invoice.note?.toLowerCase().includes("rental") &&
        invoice.status !== "Paid",
    ) ?? null;

  const visibleDraftRows = canSeeRevenue ? draftRows : [];
  const canOpenBillingControls = canSeeRevenue;

  const jumpToRentalCheckout = () => {
    setShowRentalCheckout(true);
    requestAnimationFrame(() => {
      rentalCheckoutRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const runBilling = async () => {
    if (!canOpenBillingControls) return;

    const drafts = prepareMonthlyBilling(billingMonth);
    setDraftRows(drafts);
    setInvoiceRows(loadInvoices());

    if (sageClient) {
      try {
        setIsSyncing(true);
        setSyncError(null);
        await sageClient.bulkCreateInvoices(
          drafts.map((draft) => ({
            tenant: draft.tenant,
            amount: draft.amount,
            due: draft.due,
            items: draft.items,
            note: draft.note,
            branch: draft.branch,
          })),
        );
        toast.success(`Successfully synced ${drafts.length} draft invoices to Sage.`);
      } catch (error) {
        console.error("Failed to sync billing drafts to Sage:", error);
        toast.error("Some billing drafts could not sync to Sage.");
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const sendDrafts = async () => {
    if (!canOpenBillingControls || visibleDraftRows.length === 0) return;

    if (sageClient) {
      try {
        setIsSyncing(true);
        setSyncError(null);
        await Promise.all(
          visibleDraftRows.map((draft) =>
            sageClient.createInvoice({
              tenant: draft.tenant,
              amount: draft.amount,
              due: draft.due,
              items: draft.items,
              note: draft.note,
              branch: draft.branch,
            }),
          ),
        );
        toast.success("Draft invoices sent and synced to Sage.");
      } catch (error) {
        console.error("Failed to send billing invoices to Sage:", error);
        toast.error("Failed to sync some invoices to Sage.");
      } finally {
        setIsSyncing(false);
      }
    }

    const sent = sendBillingInvoices(visibleDraftRows);
    setInvoiceRows(sent);
    setDraftRows([]);
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
    if (!rentalInvoice) return;

    const updated: Invoice[] = loadInvoices().map((invoice): Invoice => {
      if (invoice.id !== rentalInvoice.id) return invoice;

      return {
        ...invoice,
        status: "Pending verification",
        method: "EFT",
        note: `${invoice.note ?? "Rental invoice"} · EFT proof attached${popAttachmentName ? ` (${popAttachmentName})` : ""}`,
      };
    });

    saveInvoices(updated);
    setInvoiceRows(updated);
    setEftModalOpen(false);
    setPopAttachmentName("");
    setPopAttachmentPreview(null);
    toast.success("EFT proof submitted for verification.");
  };

  const launchRentalPayment = async () => {
    if (!rentalInvoice || typeof window === "undefined") return;

    if (rentalCheckoutMethod === "Paystack") {
      if (!window.PaystackPop || !paystackReady) {
        toast.info("Loading Paystack checkout…");
        return;
      }

      const popup = window.PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: "tenant@example.com",
        amount: Math.round(rentalInvoice.amount * 100),
        currency: "ZAR",
        ref: rentalInvoice.id,
        label: `${rentalInvoice.tenant} rental invoice`,
        onClose: () => toast.info("Paystack payment closed before completion."),
        callback: async (response) => {
          toast.success(`Paystack payment completed · ${response.reference}`);

          if (sageClient) {
            try {
              await sageClient.recordPayment(rentalInvoice.id, {
                amount: rentalInvoice.amount,
                method: "Paystack",
                reference: response.reference,
              });
              toast.success("Payment synced to Sage.");
            } catch (error) {
              console.error("Failed to sync payment to Sage:", error);
              toast.warning("Payment completed, but Sage sync failed.");
            }
          }
        },
      });

      popup.openIframe();
      return;
    }

    if (rentalCheckoutMethod === "EFT") {
      setEftModalOpen(true);
      return;
    }

    const invoiceRef = encodeURIComponent(rentalInvoice.id);
    const amount = Math.round(rentalInvoice.amount);
    const gatewayUrls: Record<InvoiceMethod, string> = {
      Paystack: `https://paystack.com/pay?invoice=${invoiceRef}&amount=${amount}`,
      PayFast: `https://www.payfast.co.za/portal/checkout?invoice=${invoiceRef}&amount=${amount}`,
      EFT: `https://www.payfast.co.za/portal/eft?invoice=${invoiceRef}&amount=${amount}`,
      "Cash on Delivery": "#",
      "Charge to account": `mailto:finance@officeandco.co?subject=${invoiceRef}%20charge%20to%20account`,
      "—": "#",
    };

    const target = gatewayUrls[rentalCheckoutMethod] ?? gatewayUrls["—"];
    if (target === "#") return;

    window.open(target, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="mx-auto max-w-350">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {isSyncing ? (
          <Badge variant="secondary" className="animate-pulse">
            Syncing with Sage…
          </Badge>
        ) : null}
        {syncError ? <Badge variant="destructive">⚠️ {syncError}</Badge> : null}
        {sageReady && !isSyncing && !syncError ? (
          <Badge variant="secondary">✅ Connected to Sage</Badge>
        ) : null}
        {!sageReady ? <Badge variant="outline">⚡ Local mode · Sage not configured</Badge> : null}
      </div>

      <PageHeader
        eyebrow="Billing, Finance & Payments"
        title={canSeeRevenue ? "Revenue & Invoices" : "Invoices & Status"}
        description={
          canSeeRevenue
            ? "Complete revenue dashboard tracking all revenue streams: Tenants, Bookings, Events, Cafe, Marketplace & Union Stations."
            : isTenantAdmin
              ? `Invoice and payment status for ${role.tenant}.`
              : "Billing access is restricted to approved finance and executive roles."
        }
        actions={
          <>
            <Button variant="outline" size="sm">
              Statements
            </Button>
            {canOpenBillingControls ? <Button size="sm">Run billing</Button> : null}
          </>
        }
      />

      <FinanceBookingQueue />

      {canSeeRevenue ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <StatCard
              label="Total Revenue"
              value={formatZAR(totalBranchRevenue)}
              delta="▲ 15.8%"
              accent="brand"
            />
            <StatCard
              label="Tenants"
              value={formatZAR(totalTenantRevenue)}
              hint={`${branchPerformance.reduce((sum, b) => sum + b.spaces, 0)} spaces`}
              accent="brand"
            />
            <StatCard
              label="Bookings"
              value={formatZAR(totalBookingRevenue)}
              hint={`${totalBookingsCount} bookings`}
            />
            <StatCard
              label="Events"
              value={formatZAR(totalEventRevenue)}
              hint={`${totalEventsCount} events`}
              accent="warning"
            />
            <StatCard
              label="Cafe"
              value={formatZAR(totalCafeSales)}
              hint={`${totalCafeOrders} orders`}
              accent="success"
            />
            <StatCard
              label="Marketplace"
              value={formatZAR(totalMarketplaceSales)}
              hint={`${totalMarketplaceOrders} orders`}
              accent="brand"
            />
          </div>

          <div className="grid gap-4 grid-cols-1 md:grid-cols-4 mb-6">
            <div className="card-soft p-4 md:col-span-3">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-display font-semibold text-sm">Revenue Mix</h3>
                  <p className="text-xs text-muted-foreground">Breakdown by revenue stream</p>
                </div>
                <Badge variant="outline">All branches</Badge>
              </div>
              <div className="space-y-2">
                {Object.entries(revenueMix).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-24 text-xs font-medium capitalize">{key}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-brand transition-all"
                        style={{ width: `${Math.max(value, 0.5)}%` }}
                      />
                    </div>
                    <span className="w-16 text-xs tabular-nums text-right">
                      {value.toFixed(1)}%
                    </span>
                    <span className="w-20 text-xs tabular-nums text-muted-foreground text-right">
                      {formatZAR(totalBranchRevenue * (value / 100))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card-soft p-4">
              <div className="text-xs text-muted-foreground mb-1">Top Performing Branch</div>
              <div className="font-display text-lg font-semibold">{topBranch?.branch || "—"}</div>
              <div className="text-sm tabular-nums">
                {topBranch ? formatZAR(topBranch.totalRevenue) : "No data"}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <Badge variant="secondary" className="text-[10px]">
                  {topBranch ? formatZAR(topBranch.tenantRevenue) : "0"} rent
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {topBranch ? formatZAR(topBranch.bookingRevenue) : "0"} bookings
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {topBranch ? formatZAR(topBranch.cafeSales) : "0"} cafe
                </Badge>
              </div>
            </div>
          </div>

          <div className="card-soft p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display font-semibold">Branch Revenue Breakdown</h3>
                <p className="text-xs text-muted-foreground">
                  Detailed view of all revenue streams by location
                </p>
              </div>
              <Badge variant="secondary">{branchPerformance.length} Active Branches</Badge>
            </div>

            <Tabs
              value={activeRevenueTab}
              onValueChange={(value) =>
                setActiveRevenueTab(
                  value as
                    | "overview"
                    | "tenants"
                    | "bookings"
                    | "events"
                    | "cafe"
                    | "marketplace"
                    | "union",
                )
              }
            >
              <TabsList className="mb-4 flex-wrap h-auto">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="tenants">Tenants</TabsTrigger>
                <TabsTrigger value="bookings">Bookings</TabsTrigger>
                <TabsTrigger value="events">Events</TabsTrigger>
                <TabsTrigger value="cafe">Cafe</TabsTrigger>
                <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
                <TabsTrigger value="union">Union Stations</TabsTrigger>
              </TabsList>

              <TabsContent value="overview">
                <div className="space-y-3">
                  {branchPerformance.map((row, index) => (
                    <div
                      key={row.branch}
                      className="rounded-lg border p-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                            {index + 1}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{row.branch}</div>
                            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                              <span>Occupancy {Math.round(row.occupancy * 100)}%</span>
                              <span>·</span>
                              <span>{row.spaces} spaces</span>
                              <span>·</span>
                              <span>Capacity {row.capacity}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold tabular-nums">
                            {formatZAR(row.totalRevenue)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {row.tenantRevenue > 0 && `${formatZAR(row.tenantRevenue)} rent`}
                            {row.bookingRevenue > 0 &&
                              ` · ${formatZAR(row.bookingRevenue)} bookings`}
                            {row.eventRevenue > 0 && ` · ${formatZAR(row.eventRevenue)} events`}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div className="flex h-full">
                          {row.tenantRevenue > 0 && (
                            <div
                              className="bg-blue-500 transition-all"
                              style={{ width: `${(row.tenantRevenue / row.totalRevenue) * 100}%` }}
                            />
                          )}
                          {row.bookingRevenue > 0 && (
                            <div
                              className="bg-purple-500 transition-all"
                              style={{ width: `${(row.bookingRevenue / row.totalRevenue) * 100}%` }}
                            />
                          )}
                          {row.eventRevenue > 0 && (
                            <div
                              className="bg-amber-500 transition-all"
                              style={{ width: `${(row.eventRevenue / row.totalRevenue) * 100}%` }}
                            />
                          )}
                          {row.cafeSales > 0 && (
                            <div
                              className="bg-green-500 transition-all"
                              style={{ width: `${(row.cafeSales / row.totalRevenue) * 100}%` }}
                            />
                          )}
                          {row.marketplaceSales > 0 && (
                            <div
                              className="bg-orange-500 transition-all"
                              style={{
                                width: `${(row.marketplaceSales / row.totalRevenue) * 100}%`,
                              }}
                            />
                          )}
                          {row.unionRevenue > 0 && (
                            <div
                              className="bg-pink-500 transition-all"
                              style={{ width: `${(row.unionRevenue / row.totalRevenue) * 100}%` }}
                            />
                          )}
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap justify-end gap-3 text-[10px] text-muted-foreground">
                        {row.tenantRevenue > 0 && (
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                            Rent {Math.round((row.tenantRevenue / row.totalRevenue) * 100)}%
                          </span>
                        )}
                        {row.bookingRevenue > 0 && (
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-full bg-purple-500" />
                            Bookings {Math.round((row.bookingRevenue / row.totalRevenue) * 100)}%
                          </span>
                        )}
                        {row.eventRevenue > 0 && (
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                            Events {Math.round((row.eventRevenue / row.totalRevenue) * 100)}%
                          </span>
                        )}
                        {row.cafeSales > 0 && (
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                            Cafe {Math.round((row.cafeSales / row.totalRevenue) * 100)}%
                          </span>
                        )}
                        {row.marketplaceSales > 0 && (
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-full bg-orange-500" />
                            Marketplace{" "}
                            {Math.round((row.marketplaceSales / row.totalRevenue) * 100)}%
                          </span>
                        )}
                        {row.unionRevenue > 0 && (
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-full bg-pink-500" />
                            Union {Math.round((row.unionRevenue / row.totalRevenue) * 100)}%
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {branchPerformance.length === 0 && (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      No branch data available
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="tenants">
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                    <div className="rounded-lg border bg-blue-50/50 dark:bg-blue-950/10 p-3">
                      <div className="text-xs text-muted-foreground">Total Rent Revenue</div>
                      <div className="text-xl font-semibold tabular-nums">
                        {formatZAR(totalTenantRevenue)}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-blue-50/50 dark:bg-blue-950/10 p-3">
                      <div className="text-xs text-muted-foreground">Total Spaces</div>
                      <div className="text-xl font-semibold tabular-nums">
                        {branchPerformance.reduce((sum, b) => sum + b.spaces, 0)}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-blue-50/50 dark:bg-blue-950/10 p-3">
                      <div className="text-xs text-muted-foreground">Average Rent per Space</div>
                      <div className="text-xl font-semibold tabular-nums">
                        {branchPerformance.reduce((sum, b) => sum + b.spaces, 0) > 0
                          ? formatZAR(
                              totalTenantRevenue /
                                branchPerformance.reduce((sum, b) => sum + b.spaces, 0),
                            )
                          : formatZAR(0)}
                      </div>
                    </div>
                  </div>
                  {branchPerformance.map((row) => (
                    <div
                      key={row.branch}
                      className="rounded-lg border p-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{row.branch}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.spaces} spaces · {Math.round(row.occupancy * 100)}% occupancy
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                            {formatZAR(row.tenantRevenue)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Avg{" "}
                            {row.spaces > 0
                              ? formatZAR(row.tenantRevenue / row.spaces)
                              : formatZAR(0)}{" "}
                            per space
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="bookings">
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                    <div className="rounded-lg border bg-purple-50/50 dark:bg-purple-950/10 p-3">
                      <div className="text-xs text-muted-foreground">Total Booking Revenue</div>
                      <div className="text-xl font-semibold tabular-nums">
                        {formatZAR(totalBookingRevenue)}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-purple-50/50 dark:bg-purple-950/10 p-3">
                      <div className="text-xs text-muted-foreground">Total Bookings</div>
                      <div className="text-xl font-semibold tabular-nums">{totalBookingsCount}</div>
                    </div>
                    <div className="rounded-lg border bg-purple-50/50 dark:bg-purple-950/10 p-3">
                      <div className="text-xs text-muted-foreground">Average Booking Value</div>
                      <div className="text-xl font-semibold tabular-nums">
                        {totalBookingsCount > 0
                          ? formatZAR(totalBookingRevenue / totalBookingsCount)
                          : formatZAR(0)}
                      </div>
                    </div>
                  </div>
                  {branchPerformance.map((row) => (
                    <div
                      key={row.branch}
                      className="rounded-lg border p-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{row.branch}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.bookingCount} bookings
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold tabular-nums text-purple-600 dark:text-purple-400">
                            {formatZAR(row.bookingRevenue)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Avg{" "}
                            {row.bookingCount > 0
                              ? formatZAR(row.bookingRevenue / row.bookingCount)
                              : formatZAR(0)}{" "}
                            per booking
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="events">
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                    <div className="rounded-lg border bg-amber-50/50 dark:bg-amber-950/10 p-3">
                      <div className="text-xs text-muted-foreground">Total Event Revenue</div>
                      <div className="text-xl font-semibold tabular-nums">
                        {formatZAR(totalEventRevenue)}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-amber-50/50 dark:bg-amber-950/10 p-3">
                      <div className="text-xs text-muted-foreground">Total Events</div>
                      <div className="text-xl font-semibold tabular-nums">{totalEventsCount}</div>
                    </div>
                    <div className="rounded-lg border bg-amber-50/50 dark:bg-amber-950/10 p-3">
                      <div className="text-xs text-muted-foreground">Average Event Value</div>
                      <div className="text-xl font-semibold tabular-nums">
                        {totalEventsCount > 0
                          ? formatZAR(totalEventRevenue / totalEventsCount)
                          : formatZAR(0)}
                      </div>
                    </div>
                  </div>
                  {branchPerformance.map((row) => (
                    <div
                      key={row.branch}
                      className="rounded-lg border p-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{row.branch}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.eventCount} events
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                            {formatZAR(row.eventRevenue)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Avg{" "}
                            {row.eventCount > 0
                              ? formatZAR(row.eventRevenue / row.eventCount)
                              : formatZAR(0)}{" "}
                            per event
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="cafe">
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                    <div className="rounded-lg border bg-green-50/50 dark:bg-green-950/10 p-3">
                      <div className="text-xs text-muted-foreground">Total Cafe Revenue</div>
                      <div className="text-xl font-semibold tabular-nums">
                        {formatZAR(totalCafeSales)}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-green-50/50 dark:bg-green-950/10 p-3">
                      <div className="text-xs text-muted-foreground">Total Orders</div>
                      <div className="text-xl font-semibold tabular-nums">{totalCafeOrders}</div>
                    </div>
                    <div className="rounded-lg border bg-green-50/50 dark:bg-green-950/10 p-3">
                      <div className="text-xs text-muted-foreground">Average Order Value</div>
                      <div className="text-xl font-semibold tabular-nums">
                        {totalCafeOrders > 0
                          ? formatZAR(totalCafeSales / totalCafeOrders)
                          : formatZAR(0)}
                      </div>
                    </div>
                  </div>
                  {branchPerformance.map((row) => (
                    <div
                      key={row.branch}
                      className="rounded-lg border p-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{row.branch}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.cafeOrderCount} orders
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold tabular-nums text-green-600 dark:text-green-400">
                            {formatZAR(row.cafeSales)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Avg{" "}
                            {row.cafeOrderCount > 0
                              ? formatZAR(row.cafeSales / row.cafeOrderCount)
                              : formatZAR(0)}{" "}
                            per order
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="marketplace">
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                    <div className="rounded-lg border bg-orange-50/50 dark:bg-orange-950/10 p-3">
                      <div className="text-xs text-muted-foreground">Total Marketplace Revenue</div>
                      <div className="text-xl font-semibold tabular-nums">
                        {formatZAR(totalMarketplaceSales)}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-orange-50/50 dark:bg-orange-950/10 p-3">
                      <div className="text-xs text-muted-foreground">Total Orders</div>
                      <div className="text-xl font-semibold tabular-nums">
                        {totalMarketplaceOrders}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-orange-50/50 dark:bg-orange-950/10 p-3">
                      <div className="text-xs text-muted-foreground">Average Order Value</div>
                      <div className="text-xl font-semibold tabular-nums">
                        {totalMarketplaceOrders > 0
                          ? formatZAR(totalMarketplaceSales / totalMarketplaceOrders)
                          : formatZAR(0)}
                      </div>
                    </div>
                  </div>
                  {branchPerformance.map((row) => (
                    <div
                      key={row.branch}
                      className="rounded-lg border p-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{row.branch}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.marketplaceOrderCount} orders
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold tabular-nums text-orange-600 dark:text-orange-400">
                            {formatZAR(row.marketplaceSales)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Avg{" "}
                            {row.marketplaceOrderCount > 0
                              ? formatZAR(row.marketplaceSales / row.marketplaceOrderCount)
                              : formatZAR(0)}{" "}
                            per order
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="union">
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                    <div className="rounded-lg border bg-pink-50/50 dark:bg-pink-950/10 p-3">
                      <div className="text-xs text-muted-foreground">
                        Total Union Station Revenue
                      </div>
                      <div className="text-xl font-semibold tabular-nums">
                        {formatZAR(totalUnionRevenue)}
                      </div>
                    </div>
                    <div className="rounded-lg border bg-pink-50/50 dark:bg-pink-950/10 p-3">
                      <div className="text-xs text-muted-foreground">Total Stations</div>
                      <div className="text-xl font-semibold tabular-nums">{totalUnionCount}</div>
                    </div>
                    <div className="rounded-lg border bg-pink-50/50 dark:bg-pink-950/10 p-3">
                      <div className="text-xs text-muted-foreground">Average Station Revenue</div>
                      <div className="text-xl font-semibold tabular-nums">
                        {totalUnionCount > 0
                          ? formatZAR(totalUnionRevenue / totalUnionCount)
                          : formatZAR(0)}
                      </div>
                    </div>
                  </div>
                  {branchPerformance.map((row) => (
                    <div
                      key={row.branch}
                      className="rounded-lg border p-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{row.branch}</div>
                          <div className="text-xs text-muted-foreground">
                            {row.unionCount} stations
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold tabular-nums text-pink-600 dark:text-pink-400">
                            {formatZAR(row.unionRevenue)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Avg{" "}
                            {row.unionCount > 0
                              ? formatZAR(row.unionRevenue / row.unionCount)
                              : formatZAR(0)}{" "}
                            per station
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Billing month</label>
              <Input
                type="month"
                value={billingMonth}
                onChange={(e) => setBillingMonth(e.target.value)}
                className="max-w-45"
              />
            </div>
            <Button size="sm" onClick={runBilling}>
              Prepare draft billing
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={sendDrafts}
              disabled={visibleDraftRows.length === 0}
            >
              Send draft invoices
            </Button>
          </div>

          {visibleDraftRows.length > 0 ? (
            <div className="card-soft mb-6">
              <div className="px-4 py-3 border-b">
                <div className="text-sm font-medium">Draft invoices ready for approval</div>
                <div className="text-[11px] text-muted-foreground">
                  These drafts were generated from charge-to-account activity for {billingMonth} and
                  are due at month-end.
                </div>
              </div>
              <div className="divide-y">
                <div className="grid grid-cols-12 px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  <div className="col-span-3">Invoice</div>
                  <div className="col-span-3">Tenant</div>
                  <div className="col-span-2">Due</div>
                  <div className="col-span-2">Amount</div>
                  <div className="col-span-2">Status</div>
                </div>
                {visibleDraftRows.map((i) => (
                  <div
                    key={i.id}
                    className="grid grid-cols-12 px-4 py-3.5 text-sm items-center hover:bg-muted/30"
                  >
                    <div className="col-span-3 font-mono text-xs">{i.id}</div>
                    <div className="col-span-3 font-medium">{i.tenant}</div>
                    <div className="col-span-2 text-muted-foreground">{i.due}</div>
                    <div className="col-span-2 text-right tabular-nums">{formatZAR(i.amount)}</div>
                    <div className="col-span-2 text-right">
                      <Badge variant="secondary" className="text-[10px]">
                        Draft
                      </Badge>
                    </div>
                    <div className="col-span-12 mt-2 flex justify-end gap-2 md:col-span-12">
                      <Button size="sm" variant="outline" onClick={() => downloadInvoicePdf(i)}>
                        PDF
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      <Dialog open={eftModalOpen} onOpenChange={setEftModalOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>EFT payment instructions</DialogTitle>
            <DialogDescription>
              Use the banking details below to settle the outstanding invoice, then attach your
              proof of payment for confirmation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Bank</span>
                <span className="font-medium">Standard Bank</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Account holder</span>
                <span className="font-medium">Office &amp; Co</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Account number</span>
                <span className="font-medium">101 083 9464</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Branch code</span>
                <span className="font-medium">051001</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Reference</span>
                <span className="font-medium">{rentalInvoice?.id ?? "INV-2026-0876"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium tabular-nums">
                  {rentalInvoice ? formatZAR(rentalInvoice.amount) : formatZAR(0)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Proof of payment
              </label>
              <label className="flex cursor-pointer items-center justify-between rounded-md border border-dashed px-3 py-3 text-sm hover:bg-muted/30">
                <span>
                  {popAttachmentName
                    ? popAttachmentName
                    : "Attach PoP screenshot or payment confirmation"}
                </span>
                <span className="text-brand">Upload</span>
                <Input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={handlePopUpload}
                />
              </label>
              {popAttachmentPreview ? (
                <div className="rounded-md border bg-card p-2">
                  <img
                    src={popAttachmentPreview}
                    alt="Uploaded proof of payment"
                    className="max-h-48 w-full rounded object-contain"
                  />
                </div>
              ) : null}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEftModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitEftProof}>Submit PoP</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canSeeInvoiceStatus ? (
        <div className="space-y-4">
          <div className="card-soft">
            <div className="px-4 py-3 border-b">
              <div className="text-sm font-medium">Recent invoices</div>
            </div>
            <div className="divide-y">
              <div className="grid grid-cols-12 px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                <div className="col-span-3">Invoice</div>
                <div className="col-span-3">Tenant</div>
                <div className="col-span-2">Due</div>
                <div className="col-span-2">Method</div>
                <div className="col-span-1 text-right">Amount</div>
                <div className="col-span-1 text-right">Status</div>
              </div>
              {scopedInvoiceRows.length === 0 ? (
                <div className="px-4 py-8 text-sm text-muted-foreground">No invoices yet.</div>
              ) : (
                scopedInvoiceRows.map((i) => (
                  <div
                    key={i.id}
                    className="grid grid-cols-12 px-4 py-3.5 text-sm items-center hover:bg-muted/30"
                  >
                    <div className="col-span-3 font-mono text-xs">{i.id}</div>
                    <div className="col-span-3 font-medium">{i.tenant}</div>
                    <div className="col-span-2 text-muted-foreground">{i.due}</div>
                    <div className="col-span-2 text-muted-foreground">{i.method}</div>
                    <div className="col-span-1 text-right tabular-nums">{formatZAR(i.amount)}</div>
                    <div className="col-span-1 text-right">
                      <Badge
                        variant={
                          i.status === "Paid"
                            ? "default"
                            : i.status === "Overdue"
                              ? "destructive"
                              : "secondary"
                        }
                        className="text-[10px]"
                      >
                        {i.status}
                      </Badge>
                    </div>
                    <div className="col-span-12 mt-2 flex justify-end gap-2 md:col-span-12">
                      <Button size="sm" variant="outline" onClick={() => downloadInvoicePdf(i)}>
                        PDF
                      </Button>
                      {i.status === "Overdue" && i.id === rentalInvoice?.id ? (
                        <Button size="sm" onClick={jumpToRentalCheckout}>
                          Pay Now
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {rentalInvoice && showRentalCheckout ? (
            <div ref={rentalCheckoutRef} className="card-soft overflow-hidden">
              <div className="border-b px-4 py-3">
                <div className="text-sm font-medium">Rental checkout</div>
                <div className="text-[11px] text-muted-foreground">
                  Current registered-tenant rental invoice and payment options.
                </div>
              </div>
              <div className="grid gap-4 p-4 lg:grid-cols-[1.4fr_0.9fr]">
                <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Invoice</span>
                    <span className="font-medium">{rentalInvoice.id}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tenant</span>
                    <span className="font-medium">{rentalInvoice.tenant}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Due</span>
                    <span className="font-medium">{rentalInvoice.due}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-medium tabular-nums">
                      {formatZAR(rentalInvoice.amount)}
                    </span>
                  </div>
                  <div className="rounded-md border bg-card p-3 text-xs text-muted-foreground">
                    {rentalInvoice.note ?? "Rental invoice detail"}
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/20 p-4">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground mb-3">
                    Payment page
                  </div>
                  <div className="space-y-2">
                    {(["Paystack", "PayFast", "EFT"] as InvoiceMethod[]).map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setRentalCheckoutMethod(method)}
                        className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition ${rentalCheckoutMethod === method ? "border-brand bg-brand/10 text-brand" : "hover:bg-muted/50"}`}
                      >
                        <span>{method}</span>
                        <span className="text-[10px] uppercase">
                          {rentalCheckoutMethod === method ? "Selected" : "Select"}
                        </span>
                      </button>
                    ))}
                  </div>
                  <Button className="w-full mt-4" onClick={launchRentalPayment}>
                    Pay {rentalCheckoutMethod} · {formatZAR(rentalInvoice.amount)}
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full mt-2"
                    onClick={() => downloadInvoicePdf(rentalInvoice)}
                  >
                    Download invoice PDF
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
