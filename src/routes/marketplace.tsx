import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { marketplace, tenantOrderHistory, ROLES, formatZAR } from "@/lib/mock";
import { useRole } from "@/lib/role-context";
import { Star, ShoppingBag, History, RotateCcw, Store } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/marketplace")({
  head: () => ({ meta: [{ title: "Marketplace — WorkspaceOS" }] }),
  component: Marketplace,
});

function tenantBranchFor(roleId: string): string {
  const r = ROLES.find(x => x.id === roleId);
  const m = r?.scope.match(/(Bryanston|Kyalami|Rosebank|Union Station)/);
  return m?.[1] ?? "Bryanston";
}

const STATUS_TONE: Record<string, string> = {
  Queued: "bg-muted text-foreground/70",
  Preparing: "bg-warning/15 text-warning border-warning/30",
  Ready: "bg-brand/15 text-brand border-brand/30",
  Shipped: "bg-brand/15 text-brand border-brand/30",
  Delivered: "bg-success/15 text-success border-success/30",
  Collected: "bg-success/15 text-success border-success/30",
};

function Marketplace() {
  const { role } = useRole();
  const isTenant = role.id === "tenant-admin";
  const branch = tenantBranchFor(role.id);
  const [tab, setTab] = useState(isTenant ? "shop" : "shop");
  const [cat, setCat] = useState("All");

  const cats = ["All", ...Array.from(new Set(marketplace.map(m => m.category)))];
  const items = marketplace.filter(m => cat === "All" || m.category === cat);
  const add = (title: string) => toast.success(`Added "${title}" to your order — charge to account`);

  return (
    <div className="mx-auto max-w-[1300px]">
      <PageHeader
        eyebrow="Marketplace"
        title="Office & Co Store + Tenant Marketplace"
        description={isTenant
          ? `Stationery, furniture and services delivered to ${branch}. Review your past orders or reorder in one tap.`
          : "Stationery, furniture and services from Office & Co, plus offerings from the tenant community."}
        actions={<Button size="sm">List a product</Button>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="GMV (month)" value={formatZAR(1_280_000)} delta="▲ 18%" accent="success" />
        <StatCard label="Active listings" value="412" />
        <StatCard label="Tenant sellers" value="38" delta="+5" accent="brand" />
        <StatCard label="Avg rating" value="4.7" hint="↑ from 4.6" />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="shop" className="gap-1.5"><Store className="size-3.5" />Shop</TabsTrigger>
          <TabsTrigger value="orders" className="gap-1.5"><History className="size-3.5" />My orders</TabsTrigger>
        </TabsList>

        <TabsContent value="shop">
          {isTenant && (
            <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="gap-1"><Store className="size-3" />Delivering to {branch}</Badge>
              <span>· Charge-to-account enabled for all Tundra Capital members</span>
            </div>
          )}
          <div className="flex gap-2 mb-4 flex-wrap">
            {cats.map(t => (
              <Badge key={t} variant={cat === t ? "default" : "outline"} className="cursor-pointer" onClick={() => setCat(t)}>{t}</Badge>
            ))}
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map((m) => (
              <div key={m.id} className="card-soft overflow-hidden hover:shadow-elevated transition-shadow">
                <div className="h-36 bg-gradient-to-br from-accent via-brand-soft to-muted grid place-items-center">
                  <ShoppingBag className="size-10 text-brand/60" />
                </div>
                <div className="p-4 flex flex-col h-full">
                  <Badge variant="outline" className="text-[10px] mb-1.5 self-start">{m.category}</Badge>
                  <div className="font-medium text-sm leading-tight">{m.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">by {m.seller}</div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="font-display text-lg font-semibold tabular-nums">{formatZAR(m.price)}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Star className="size-3 fill-warning text-warning" /> {m.rating}
                    </div>
                  </div>
                  <Button size="sm" className="w-full mt-3" onClick={() => add(m.title)}>Add to order</Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="orders">
          <MyMarketplaceOrders branch={branch} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MyMarketplaceOrders({ branch }: { branch: string }) {
  const rows = tenantOrderHistory.filter(o => o.branch === branch && o.kind === "marketplace");
  const reorder = (id: string) => toast.success(`Reordered ${id} — added to your cart`);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Marketplace orders" value={String(rows.length)} accent="brand" />
        <StatCard label="Spent (month)" value={formatZAR(rows.reduce((s, r) => s + r.total, 0))} accent="success" />
        <StatCard label="Delivering to" value={branch} />
        <StatCard label="Preferred method" value="Charge to account" />
      </div>
      <div className="card-soft overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Method</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(o => (
              <TableRow key={o.id}>
                <TableCell>
                  <div className="text-sm font-medium">{o.id}</div>
                  <div className="text-[11px] text-muted-foreground">{o.placedAt}</div>
                </TableCell>
                <TableCell><div className="text-sm">{o.items.map(i => `${i.qty}× ${i.name}`).join(" · ")}</div></TableCell>
                <TableCell className="text-xs">{o.method}</TableCell>
                <TableCell className="text-right tabular-nums">{formatZAR(o.total)}</TableCell>
                <TableCell><Badge variant="outline" className={STATUS_TONE[o.status]}>{o.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => reorder(o.id)}><RotateCcw className="size-3" />Reorder</Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">No marketplace orders yet at {branch}.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
