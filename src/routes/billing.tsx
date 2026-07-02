import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { invoices, formatZAR } from "@/lib/mock";

export const Route = createFileRoute("/billing")({
  head: () => ({ meta: [{ title: "Billing — WorkspaceOS" }] }),
  component: Billing,
});

function Billing() {
  return (
    <div className="mx-auto max-w-[1400px]">
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
          {invoices.map((i) => (
            <div key={i.id} className="grid grid-cols-12 px-4 py-3.5 text-sm items-center hover:bg-muted/30 cursor-pointer">
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
