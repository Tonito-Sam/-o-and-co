import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { invoices, formatZAR, loadInvoices, loadBillingDrafts, prepareMonthlyBilling, sendBillingInvoices, downloadInvoicePdf, type Invoice } from "@/lib/mock";

export const Route = createFileRoute("/billing")({
  head: () => ({ meta: [{ title: "Billing — WorkspaceOS" }] }),
  component: Billing,
});

function Billing() {
  const [invoiceRows, setInvoiceRows] = useState<Invoice[]>([]);
  const [draftRows, setDraftRows] = useState<Invoice[]>([]);
  const [billingMonth, setBillingMonth] = useState(() => new Date().toISOString().slice(0, 7));

  useEffect(() => {
    setInvoiceRows(loadInvoices());
    setDraftRows(loadBillingDrafts());
  }, []);

  const runBilling = () => {
    const drafts = prepareMonthlyBilling(billingMonth);
    setDraftRows(drafts);
    setInvoiceRows(loadInvoices());
  };

  const sendDrafts = () => {
    if (draftRows.length === 0) return;
    const sent = sendBillingInvoices(draftRows);
    setInvoiceRows(sent);
    setDraftRows([]);
  };

  return (
    <div className="mx-auto max-w-350">
      <PageHeader
        eyebrow="Billing, Finance & Payments"
        title="Invoices"
        description="Consolidated month-end billing — rent, bookings, café and marketplace charges on one invoice."
        actions={
          <>
            <Button variant="outline" size="sm">Statements</Button>
            <Button size="sm">Run billing</Button>
          </>
        }
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Billed this month" value={formatZAR(11_820_000)} delta="▲ 12.4%" accent="success" />
        <StatCard label="Collected" value={formatZAR(9_640_000)} hint="81.5% of issued" accent="brand" />
        <StatCard label="Overdue" value={formatZAR(412_000)} delta="6 invoices" accent="warning" />
        <StatCard label="Charged to account" value={formatZAR(184_300)} hint="Café + marketplace" />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Billing month</label>
          <Input type="month" value={billingMonth} onChange={(e) => setBillingMonth(e.target.value)} className="max-w-[180px]" />
        </div>
        <Button size="sm" onClick={runBilling}>Prepare draft billing</Button>
        <Button size="sm" variant="outline" onClick={sendDrafts} disabled={draftRows.length === 0}>Send draft invoices</Button>
      </div>

      {draftRows.length > 0 ? (
        <div className="card-soft mb-6">
          <div className="px-4 py-3 border-b">
            <div className="text-sm font-medium">Draft invoices ready for approval</div>
            <div className="text-[11px] text-muted-foreground">These drafts were generated from charge-to-account activity for {billingMonth} and are due at month-end.</div>
          </div>
          <div className="divide-y">
            <div className="grid grid-cols-12 px-4 py-2.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              <div className="col-span-3">Invoice</div>
              <div className="col-span-3">Tenant</div>
              <div className="col-span-2">Due</div>
              <div className="col-span-2">Amount</div>
              <div className="col-span-2">Status</div>
            </div>
            {draftRows.map((i) => (
              <div key={i.id} className="grid grid-cols-12 px-4 py-3.5 text-sm items-center hover:bg-muted/30">
                <div className="col-span-3 font-mono text-xs">{i.id}</div>
                <div className="col-span-3 font-medium">{i.tenant}</div>
                <div className="col-span-2 text-muted-foreground">{i.due}</div>
                <div className="col-span-2 text-right tabular-nums">{formatZAR(i.amount)}</div>
                <div className="col-span-2 text-right"><Badge variant="secondary" className="text-[10px]">Draft</Badge></div>
                <div className="col-span-12 mt-2 flex justify-end gap-2 md:col-span-12">
                  <Button size="sm" variant="outline" onClick={() => downloadInvoicePdf(i)}>PDF</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="card-soft">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="text-sm font-medium">Recent invoices</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">PayFast</Badge>
            <Badge variant="outline">Peach</Badge>
            <Badge variant="outline">Ozow</Badge>
            <Badge variant="outline">Stripe</Badge>
            <Badge variant="outline">EFT</Badge>
          </div>
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
          {invoiceRows.length === 0 ? <div className="px-4 py-8 text-sm text-muted-foreground">No invoices yet.</div> : invoiceRows.map((i) => (
            <div key={i.id} className="grid grid-cols-12 px-4 py-3.5 text-sm items-center hover:bg-muted/30">
              <div className="col-span-3 font-mono text-xs">{i.id}</div>
              <div className="col-span-3 font-medium">{i.tenant}</div>
              <div className="col-span-2 text-muted-foreground">{i.due}</div>
              <div className="col-span-2 text-muted-foreground">{i.method}</div>
              <div className="col-span-1 text-right tabular-nums">{formatZAR(i.amount)}</div>
              <div className="col-span-1 text-right">
                <Badge variant={i.status === "Paid" ? "default" : i.status === "Overdue" ? "destructive" : "secondary"} className="text-[10px]">
                  {i.status}
                </Badge>
              </div>
              <div className="col-span-12 mt-2 flex justify-end gap-2 md:col-span-12">
                <Button size="sm" variant="outline" onClick={() => downloadInvoicePdf(i)}>PDF</Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
