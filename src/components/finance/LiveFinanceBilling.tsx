import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRole } from "@/lib/role-context";
import { getSupabaseClient } from "@/lib/supabase";
import { loadLiveFinanceSnapshot, type LiveFinanceSnapshot } from "@/lib/finance-data";

const formatZAR = (amount: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(amount);

export function LiveFinanceBilling() {
  const { role, canSeeRevenue, canSeeInvoiceStatus } = useRole();
  const [snapshot, setSnapshot] = useState<LiveFinanceSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookingWorkflowUnavailable, setBookingWorkflowUnavailable] = useState(false);

  const loadBillingData = useCallback(async (currentRoleId: string) => {
    setLoading(true);
    try {
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
  const invoices = snapshot?.invoices ?? [];

  return (
    <div className="mx-auto max-w-350 space-y-6">
      <PageHeader
        eyebrow="Billing, Finance & Payments"
        title={canSeeRevenue ? "Revenue & Invoices" : "Invoices & Status"}
        description={
          canSeeRevenue
            ? "Live financial performance and invoice records from the connected workspace database."
            : `Invoice status for ${role.tenant ?? "your account"}.`
        }
        actions={
          canSeeRevenue ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadBillingData(role.id)}
              disabled={loading}
            >
              <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          ) : null
        }
      />

      <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300" />
          <div>
            <h2 className="text-sm font-semibold">Sage is not connected</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sage credentials are not configured in this workspace. Live sync must use server-side
              credentials; do not expose Sage keys or passwords through VITE variables.
            </p>
          </div>
        </div>
      </section>

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
                      invoice.metadata?.company_name ?? invoice.metadata?.tenant_name;
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
