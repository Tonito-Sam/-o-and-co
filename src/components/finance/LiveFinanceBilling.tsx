import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Link2, RefreshCw } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRole } from "@/lib/role-context";
import { getSupabaseClient } from "@/lib/supabase";
import { loadLiveFinanceSnapshot, type LiveFinanceSnapshot, type LiveInvoiceRow } from "@/lib/finance-data";

const formatZAR = (amount: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(amount);

type SageStatus = SageApiResponse & {
  mode: string;
  oauthConfigured: boolean;
  apiKeyConfigured: boolean;
  connected: boolean;
  expiresAt: string | null;
  scope: string | null;
};

type SageApiResponse = {
  authorizationUrl?: string;
  success?: boolean;
  message?: string;
  error?: string;
};

const SAGE_MANAGER_ROLES = new Set(["superadmin", "group-admin", "group-ceo", "finance"]);

async function sageRequest<T extends SageApiResponse>(
  path: string,
  method = "GET",
): Promise<T> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Workspace authentication is not configured.");
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Sign in again to manage the Sage connection.");
  }

  const response = await fetch(path, {
    method,
    headers: { authorization: `Bearer ${data.session.access_token}` },
    cache: "no-store",
  });
  let result: SageApiResponse = {};
  try {
    result = (await response.json()) as SageApiResponse;
  } catch {
    if (response.ok) throw new Error("Sage returned an invalid response.");
  }
  if (!response.ok) {
    throw new Error(result.message ?? `Sage request failed (HTTP ${response.status}).`);
  }
  return result as T;
}

export function LiveFinanceBilling() {
  const { role, canSeeRevenue, canSeeInvoiceStatus } = useRole();
  const [snapshot, setSnapshot] = useState<LiveFinanceSnapshot | null>(null);
  const [branchInvoices, setBranchInvoices] = useState<LiveInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookingWorkflowUnavailable, setBookingWorkflowUnavailable] = useState(false);

  const loadBillingData = useCallback(async (currentRoleId: string) => {
    setLoading(true);
    try {
      if (currentRoleId === "branch-manager") {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error("Workspace data is not configured.");
        const { data, error: invoiceError } = await supabase
          .from("invoices")
          .select("id,reference,tenant_id,amount_zar,status,issued_at,due_at,paid_at,metadata")
          .order("issued_at", { ascending: false })
          .limit(500);
        if (invoiceError) throw new Error(invoiceError.message);
        setBranchInvoices((data ?? []) as LiveInvoiceRow[]);
        setSnapshot(null);
        setError("");
        return;
      }
      const liveSnapshot = await loadLiveFinanceSnapshot();
      setSnapshot(liveSnapshot);
      setError("");

      if (currentRoleId === "finance") {
        const supabase = getSupabaseClient();
        const { error: bookingError } = await supabase!
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .in("request_status", ["quoted", "invoice_sent", "confirmed"]);
        setBookingWorkflowUnavailable(Boolean(bookingError));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load billing data.");
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBillingData(role.id);
  }, [loadBillingData, role.id]);

  const totals = snapshot?.totals;
  const invoices = role.id === "branch-manager" ? branchInvoices : snapshot?.invoices ?? [];

  return (
    <div className="mx-auto max-w-350 space-y-6">
      <PageHeader
        eyebrow={role.id === "branch-manager" ? `${role.branch ?? "Branch"} · Billing` : "Billing, Finance & Payments"}
        title={canSeeRevenue ? "Revenue & Invoices" : role.id === "branch-manager" ? "Branch invoices" : "Invoices & Status"}
        description={
          canSeeRevenue
            ? "Live financial performance and invoice records from the connected workspace database."
            : role.id === "branch-manager"
              ? "Invoices for your assigned branch. Prepare quotes and issue booking invoices from branch bookings."
              : `Invoice status for ${role.tenant ?? "your account"}.`
        }
        actions={
          canSeeRevenue || role.id === "branch-manager" ? (
            <div className="flex items-center gap-2">
              {role.id === "branch-manager" ? (
                <Button asChild size="sm">
                  <Link to="/bookings">Manage booking invoices</Link>
                </Button>
              ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadBillingData(role.id)}
              disabled={loading}
            >
              <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            </div>
          ) : null
        }
      />

      {SAGE_MANAGER_ROLES.has(role.id) ? <SageConnectionPanel /> : null}

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          Live billing data unavailable: {error}
        </p>
      ) : null}

      {canSeeRevenue ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Monthly recurring"
              value={
                loading ? "—" : snapshot ? formatZAR(totals?.monthly_recurring ?? 0) : "Unavailable"
              }
              hint="Tenant lease records"
              accent="brand"
            />
            <StatCard
              label="Collected this month"
              value={
                loading
                  ? "—"
                  : snapshot
                    ? formatZAR(totals?.collected_this_month ?? 0)
                    : "Unavailable"
              }
              hint="Paid invoices"
              accent="success"
            />
            <StatCard
              label="Open receivables"
              value={
                loading ? "—" : snapshot ? formatZAR(totals?.open_receivables ?? 0) : "Unavailable"
              }
              hint={
                snapshot
                  ? `${formatZAR(totals?.overdue_receivables ?? 0)} overdue`
                  : "Invoice data unavailable"
              }
              accent={(totals?.overdue_receivables ?? 0) > 0 ? "warning" : "brand"}
            />
            <StatCard
              label="Active tenants"
              value={loading ? "—" : snapshot ? String(totals?.tenant_records ?? 0) : "Unavailable"}
              hint="Tenant records"
            />
          </div>

          <section className="overflow-hidden rounded-lg border bg-card">
            <div className="border-b p-4">
              <h2 className="font-display text-base font-semibold">Branch financials</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Amounts are calculated from live invoice and tenant records.
              </p>
            </div>
            {loading ? (
              <div className="p-5 text-sm text-muted-foreground">
                Loading live branch financials…
              </div>
            ) : !snapshot ? (
              <div className="p-5 text-sm text-muted-foreground">
                Branch financials are unavailable until the finance data service responds.
              </div>
            ) : snapshot.branches.length === 0 ? (
              <div className="p-5 text-sm text-muted-foreground">
                No branch financial records are available for this account.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Branch</th>
                      <th className="px-4 py-3 text-right font-medium">Tenants</th>
                      <th className="px-4 py-3 text-right font-medium">Monthly recurring</th>
                      <th className="px-4 py-3 text-right font-medium">Collected this month</th>
                      <th className="px-4 py-3 text-right font-medium">Open receivables</th>
                      <th className="px-4 py-3 text-right font-medium">Overdue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {snapshot.branches.map((branch) => (
                      <tr key={branch.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">{branch.name}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {branch.tenant_records}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatZAR(branch.monthly_recurring)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatZAR(branch.collected_this_month)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatZAR(branch.open_receivables)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatZAR(branch.overdue_receivables)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {role.id === "finance" && bookingWorkflowUnavailable ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-800 dark:text-amber-200">
              Booking quote tracking is unavailable until the latest booking workflow migration is
              applied to Supabase.
            </p>
          ) : null}
        </>
      ) : null}

      {canSeeInvoiceStatus ? (
        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b p-4">
            <h2 className="font-display text-base font-semibold">Recent invoices</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Live invoice records stored in the workspace database.
            </p>
          </div>
          {error ? (
            <p role="alert" className="p-4 text-sm text-destructive">Could not load invoices: {error}</p>
          ) : loading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading invoices…</p>
          ) : invoices.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No live invoices are available.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Reference</th>
                    <th className="px-4 py-3 font-medium">Account</th>
                    <th className="px-4 py-3 font-medium">Issued</th>
                    <th className="px-4 py-3 font-medium">Due</th>
                    <th className="px-4 py-3 text-right font-medium">Amount</th>
                    <th className="px-4 py-3 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {invoices.map((invoice) => {
                    const metadataAccount =
                      invoice.metadata?.company_name ??
                      invoice.metadata?.tenant_name ??
                      (invoice.metadata?.kind === "one_off_booking" && typeof invoice.metadata?.request_reference === "string"
                        ? `Booking ${invoice.metadata.request_reference}`
                        : undefined);
                    const account =
                      typeof metadataAccount === "string"
                        ? metadataAccount
                        : invoice.tenant_id
                          ? `Account ${invoice.tenant_id.slice(0, 8)}`
                          : "Unassigned";
                    return (
                      <tr key={invoice.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3 font-mono text-xs">{invoice.reference}</td>
                        <td className="px-4 py-3">{account}</td>
                        <td className="px-4 py-3">{invoice.issued_at}</td>
                        <td className="px-4 py-3">{invoice.due_at}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatZAR(invoice.amount_zar)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Badge
                            variant={
                              invoice.status === "paid"
                                ? "default"
                                : invoice.status === "overdue"
                                  ? "destructive"
                                  : "secondary"
                            }
                          >
                            {invoice.status.replaceAll("_", " ")}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function SageConnectionPanel() {
  const [status, setStatus] = useState<SageStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setStatus(await sageRequest<SageStatus>("/api/auth/sage/status"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load Sage connection status.");
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    const url = new URL(window.location.href);
    const outcome = url.searchParams.get("sage");
    const reason = url.searchParams.get("reason");
    if (outcome === "connected") {
      setMessage("Sage sandbox authorization completed.");
    } else if (outcome === "error") {
      setError(
        reason === "authorization_denied"
          ? "Sage authorization was cancelled or denied."
          : "Sage authorization did not complete. Try connecting again.",
      );
    }
    if (outcome) {
      url.searchParams.delete("sage");
      url.searchParams.delete("reason");
      window.history.replaceState(
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
  }, [loadStatus]);

  const connect = async () => {
    setConnecting(true);
    setError("");
    setMessage("");
    try {
      const result = await sageRequest<SageApiResponse>("/api/auth/sage/start", "POST");
      if (!result.authorizationUrl) throw new Error("Sage did not provide an authorization URL.");
      window.location.assign(result.authorizationUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start Sage authorization.");
      setConnecting(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setError("");
    setMessage("");
    try {
      const result = await sageRequest<SageApiResponse>("/api/auth/sage/test", "POST");
      setMessage(result.message ?? "Sage sandbox API connection succeeded.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not test Sage connection.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          {status?.connected ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
          )}
          <div>
            <h2 className="text-sm font-semibold">
              {loading
                ? "Checking Sage sandbox…"
                : status?.connected
                  ? "Sage sandbox connected"
                  : "Sage sandbox not connected"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              OAuth credentials and access tokens stay on the server. They are never sent to the
              browser.
            </p>
            {status?.connected && status.expiresAt ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Access token expires {new Date(status.expiresAt).toLocaleString()}.
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {status?.connected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void testConnection()}
              disabled={loading || testing || !status.apiKeyConfigured}
            >
              <RefreshCw className={`mr-2 size-4 ${testing ? "animate-spin" : ""}`} />
              {testing ? "Testing…" : "Test API"}
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={() => void connect()}
            disabled={
              loading ||
              connecting ||
              status?.mode !== "sandbox" ||
              !status.oauthConfigured
            }
          >
            <Link2 className="mr-2 size-4" />
            {connecting ? "Connecting…" : status?.connected ? "Reconnect Sage" : "Connect Sage"}
          </Button>
        </div>
      </div>
      {status && status.mode !== "sandbox" ? (
        <p className="mt-3 text-xs text-amber-800 dark:text-amber-200">
          Set server-side SAGE_MODE=sandbox to enable the sandbox authorization flow.
        </p>
      ) : null}
      {status && !status.oauthConfigured ? (
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
          Configure SAGE_CLIENT_ID, SAGE_CLIENT_SECRET, and the registered SAGE_REDIRECT_URI on the
          server.
        </p>
      ) : null}
      {status?.connected && !status.apiKeyConfigured ? (
        <p className="mt-2 text-xs text-amber-800 dark:text-amber-200">
          OAuth is connected. Configure SAGE_API_KEY on the server to test the reseller API.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">
          {message}
        </p>
      ) : null}
    </section>
  );
}
