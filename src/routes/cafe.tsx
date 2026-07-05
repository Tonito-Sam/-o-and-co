import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cafeOrders, cafeProducts, tenantOrderHistory, formatZAR, branches, type CafeProduct, createInvoice, PAYSTACK_PUBLIC_KEY, loadInvoices, downloadInvoicePdf, getRoleBranch, getRoleTenant } from "@/lib/mock";
import { useRole } from "@/lib/role-context";
import { Coffee, Plus, ShoppingBag, Minus, Trash2, ChefHat, Store, History, RotateCcw, ReceiptText, CreditCard, Wallet } from "lucide-react";
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

function createProductIllustration(product: Pick<CafeProduct, "name" | "category" | "branch">) {
  const colors = ["#7c3aed", "#0f766e", "#ea580c", "#2563eb", "#b45309"];
  const color = colors[product.name.length % colors.length];
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
      <rect width="800" height="500" rx="36" fill="#f7f3ff"/>
      <rect x="42" y="42" width="716" height="416" rx="28" fill="${color}" fill-opacity="0.13"/>
      <circle cx="620" cy="180" r="120" fill="${color}" fill-opacity="0.2"/>
      <rect x="92" y="300" width="300" height="70" rx="18" fill="${color}" fill-opacity="0.22"/>
      <text x="92" y="190" font-family="Inter, Arial, sans-serif" font-size="44" font-weight="700" fill="#111827">${product.name}</text>
      <text x="92" y="240" font-family="Inter, Arial, sans-serif" font-size="24" fill="#374151">${product.category} · ${product.branch}</text>
    </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const Route = createFileRoute("/cafe")({
  head: () => ({ meta: [{ title: "Café — WorkspaceOS" }] }),
  component: Cafe,
});

const liveBranches = branches.filter(b => b.status === "live").map(b => b.name);
const columns = ["Queued", "Preparing", "Ready", "Collected"];

function Cafe() {
  const { role } = useRole();
  const isAdmin = ["group-ceo", "branch-manager", "community-manager", "lydia-admin"].includes(role.id);
  const defaultTab = isAdmin ? "admin" : "shop";
  const [tab, setTab] = useState(defaultTab);
  const branch = getRoleBranch(role.id) ?? "Bryanston";
  const tenant = getRoleTenant(role.id);

  return (
    <div className="mx-auto max-w-350">
      <PageHeader
        eyebrow="Café"
        title="Office &amp; Co Café"
        description={isAdmin
          ? "Manage products and the kitchen board per branch — what tenants see in their app updates instantly."
          : "Order from your branch café and have it ready when you walk in. Charge to your account or pay now."}
      />

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          {isAdmin && <TabsTrigger value="admin" className="gap-1.5"><ChefHat className="size-3.5" />Admin · Products</TabsTrigger>}
          {isAdmin && <TabsTrigger value="kitchen" className="gap-1.5"><Coffee className="size-3.5" />Kitchen board</TabsTrigger>}
          <TabsTrigger value="shop" className="gap-1.5"><Store className="size-3.5" />Shop</TabsTrigger>
          <TabsTrigger value="orders" className="gap-1.5"><History className="size-3.5" />My orders</TabsTrigger>
        </TabsList>

        {isAdmin && <TabsContent value="admin"><AdminPanel /></TabsContent>}
        {isAdmin && <TabsContent value="kitchen"><KitchenBoard /></TabsContent>}
        <TabsContent value="shop"><Shop defaultBranch={branch} canPickBranch={isAdmin} tenant={tenant} /></TabsContent>
        <TabsContent value="orders"><MyOrders branch={branch} tenant={tenant} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ────────────────── Admin: product catalog per branch ──────────────────

function AdminPanel() {
  const [branch, setBranch] = useState(liveBranches[0]);
  const [products, setProducts] = useState<CafeProduct[]>(cafeProducts);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CafeProduct | null>(null);

  const branchProducts = products.filter(p => p.branch === branch);
  const stats = {
    total: branchProducts.length,
    live: branchProducts.filter(p => p.available).length,
    popular: branchProducts.filter(p => p.popular).length,
  };

  const upsert = (p: CafeProduct) => {
    setProducts(prev => {
      const exists = prev.find(x => x.id === p.id);
      return exists ? prev.map(x => x.id === p.id ? p : x) : [p, ...prev];
    });
    toast.success(editing ? `Updated ${p.name}` : `${p.name} added to ${p.branch}`);
    setEditing(null); setOpen(false);
  };
  const remove = (id: string) => {
    setProducts(prev => prev.filter(p => p.id !== id));
    toast.success("Product removed");
  };
  const toggleAvail = (id: string) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, available: !p.available } : p));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <Label className="text-xs mb-1.5 block">Managing branch</Label>
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="w-55"><SelectValue /></SelectTrigger>
              <SelectContent>{liveBranches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 ml-2">
            <Badge variant="outline">{stats.total} products</Badge>
            <Badge variant="outline" className="text-success border-success/30">{stats.live} live</Badge>
            <Badge variant="outline" className="text-brand border-brand/30">{stats.popular} popular</Badge>
          </div>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button size="sm" className="gap-1.5"><Plus className="size-4" />New product</Button></DialogTrigger>
          <ProductDialog branch={branch} initial={editing} onSave={upsert} onClose={() => { setOpen(false); setEditing(null); }} />
        </Dialog>
      </div>

      <div className="card-soft overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {branchProducts.map(p => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium text-sm flex items-center gap-2">{p.name}{p.popular && <Badge variant="secondary" className="text-[10px]">Popular</Badge>}</div>
                  <div className="text-[11px] text-muted-foreground line-clamp-1">{p.description}</div>
                </TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{p.category}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{formatZAR(p.price)}</TableCell>
                <TableCell><div className="flex items-center gap-2"><Switch checked={p.available} onCheckedChange={() => toggleAvail(p.id)} /><span className="text-xs text-muted-foreground">{p.available ? "Available" : "Hidden"}</span></div></TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => { setEditing(p); setOpen(true); }}>Edit</Button>
                    <Button size="icon" variant="ghost" className="size-7 text-destructive hover:text-destructive" onClick={() => remove(p.id)}><Trash2 className="size-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {branchProducts.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">No products yet for {branch}. Add the first one.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ProductDialog({ branch, initial, onSave, onClose }: { branch: string; initial: CafeProduct | null; onSave: (p: CafeProduct) => void; onClose: () => void }) {
  const [form, setForm] = useState<CafeProduct>(initial ?? {
    id: `CP-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    branch, name: "", category: "Coffee", price: 35, description: "", available: true, popular: false,
  });
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{initial ? "Edit product" : "New product"}</DialogTitle>
        <DialogDescription>Visible only to tenants at <strong>{branch}</strong>.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5 col-span-2"><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Category</Label>
            <Select value={form.category} onValueChange={v => setForm({ ...form, category: v as CafeProduct["category"] })}>
              <SelectTrigger /><SelectContent>{["Coffee", "Tea", "Cold Drinks", "Bakery", "Breakfast", "Lunch", "Snacks"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="space-y-1.5"><Label>Price (ZAR)</Label><Input type="number" value={form.price} onChange={e => setForm({ ...form, price: Number(e.target.value) })} /></div>
          <div className="space-y-1.5 col-span-2"><Label>Vendor / seller</Label><Input value={form.vendor ?? ""} onChange={e => setForm({ ...form, vendor: e.target.value })} placeholder="Office & Co Café" /></div>
          <div className="space-y-1.5 col-span-2"><Label>Image URL</Label><Input value={form.image ?? ""} onChange={e => setForm({ ...form, image: e.target.value })} placeholder="https://example.com/image.jpg" /></div>
        </div>
        <div className="space-y-1.5"><Label>Description</Label><Textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm"><Switch checked={form.available} onCheckedChange={(v) => setForm({ ...form, available: v })} /> Available</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={!!form.popular} onCheckedChange={(v) => setForm({ ...form, popular: v })} /> Mark popular</label>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => { if (!form.name) { toast.error("Name is required"); return; } onSave({ ...form, branch }); }}>{initial ? "Save" : "Add product"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ────────────────── Kitchen board ──────────────────

function KitchenBoard() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Orders today" value="187" delta="▲ 14" accent="brand" />
        <StatCard label="Café revenue (mo)" value={formatZAR(284_000)} accent="success" />
        <StatCard label="Charge to account" value="62%" hint="of all orders" />
        <StatCard label="Avg prep time" value="4.2 min" />
      </div>
      <div className="grid md:grid-cols-4 gap-3">
        {columns.map((col) => (
          <div key={col} className="rounded-xl bg-muted/40 p-3">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-semibold uppercase tracking-wider text-foreground/70">{col}</div>
              <Badge variant="outline" className="text-[10px]">{cafeOrders.filter(o => o.status === col).length}</Badge>
            </div>
            <div className="space-y-2">
              {cafeOrders.filter(o => o.status === col).map(o => (
                <div key={o.id} className="card-soft p-3">
                  <div className="flex items-start gap-2">
                    <div className="grid size-8 place-items-center rounded-md bg-warning/15 text-warning shrink-0"><Coffee className="size-4" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-tight">{o.item}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{o.member} · {o.tenant}</div>
                      <div className="text-[10px] mt-1 text-brand">{o.method}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ────────────────── Tenant shop ──────────────────

function Shop({ defaultBranch, canPickBranch, tenant }: { defaultBranch: string; canPickBranch: boolean; tenant?: string }) {
  const [branch, setBranch] = useState(defaultBranch);
  const [cat, setCat] = useState<string>("All");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [paymentMode, setPaymentMode] = useState<"charge" | "paystack">("charge");
  const [invoicePreview, setInvoicePreview] = useState<string | null>(null);
  const [paystackReady, setPaystackReady] = useState(false);

  const items = useMemo(() => cafeProducts.filter(p => p.branch === branch && p.available && (cat === "All" || p.category === cat)), [branch, cat]);
  const cats = useMemo(() => {
    const set = new Set<string>(); cafeProducts.filter(p => p.branch === branch && p.available).forEach(p => set.add(p.category));
    return ["All", ...set];
  }, [branch]);

  const inc = (id: string) => setCart(c => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const dec = (id: string) => setCart(c => { const n = (c[id] ?? 0) - 1; const next = { ...c }; if (n <= 0) delete next[id]; else next[id] = n; return next; });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.PaystackPop) {
      setPaystackReady(true);
      return;
    }
    const existing = document.querySelector('script[src="https://js.paystack.co/v1/inline.js"]');
    if (existing) {
      existing.addEventListener("load", () => setPaystackReady(Boolean(window.PaystackPop)), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v1/inline.js";
    script.async = true;
    script.onload = () => setPaystackReady(Boolean(window.PaystackPop));
    script.onerror = () => toast.error("Paystack could not be loaded. Please try again shortly.");
    document.body.appendChild(script);
  }, []);

  const cartItems = Object.entries(cart).map(([id, qty]) => {
    const p = cafeProducts.find(x => x.id === id)!;
    return { ...p, qty };
  });
  const subtotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const total = subtotal;

  const checkout = (method: "Charge to account" | "Paystack") => {
    if (cartItems.length === 0) return;
    const invoice = createInvoice({
      tenant: tenant ?? "Tundra Capital",
      amount: total,
      status: method === "Charge to account" ? "Sent" : "Paid",
      due: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      method: method === "Charge to account" ? "Charge to account" : "Paystack",
      items: cartItems.map((item) => ({ name: item.name, qty: item.qty, price: item.price })),
      branch,
      kind: "cafe",
      note: `${branch} café order via ${method}`,
    });
    const invoices = loadInvoices();
    const latest = invoices.find((entry) => entry.id === invoice.id);
    setInvoicePreview(latest?.id ?? null);
    if (method === "Paystack") {
      if (typeof window === "undefined" || !window.PaystackPop || !paystackReady) {
        toast.info("Loading Paystack modal…");
        return;
      }
      const popup = window.PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: "tenant@example.com",
        amount: Math.round(total * 100),
        currency: "ZAR",
        ref: invoice.id,
        label: `${branch} café order`,
        onClose: () => {
          toast.info("Paystack payment closed before completion.");
        },
        callback: (response) => {
          toast.success(`Paystack payment completed · ${response.reference}`);
          setCart({});
        },
      });
      popup.openIframe();
      return;
    }
    toast.success(`Charge to account confirmed · ${invoice.id}`);
    setCart({});
  };

  return (
    <div className="grid xl:grid-cols-[1.2fr_360px] gap-4">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {canPickBranch ? (
              <Select value={branch} onValueChange={setBranch}>
                <SelectTrigger className="w-50"><SelectValue /></SelectTrigger>
                <SelectContent>{liveBranches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <Badge variant="outline" className="h-8 px-3"><Store className="size-3 mr-1.5" />{branch} Café</Badge>
            )}
            <div className="flex flex-wrap gap-1.5 ml-1">
              {cats.map(c => (
                <button key={c} onClick={() => setCat(c)} className={`px-2.5 py-1 rounded-full border text-xs ${cat === c ? "bg-brand-soft text-brand border-brand/30" : "hover:bg-muted/50"}`}>{c}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="gap-1"><ReceiptText className="size-3" />Invoice ready after checkout</Badge>
            <Badge variant="outline">Paystack sandbox: {PAYSTACK_PUBLIC_KEY}</Badge>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map(p => (
            <div key={p.id} className="card-soft overflow-hidden flex flex-col">
              <img src={p.image ?? createProductIllustration(p)} alt={p.name} className="h-40 w-full object-cover" />
              <div className="p-4 flex flex-col flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold">{p.name}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">by {p.vendor ?? `${p.branch} Café`}</div>
                    <Badge variant="outline" className="text-[10px] mt-1">{p.category}</Badge>
                  </div>
                  <div className="font-display text-base font-semibold tabular-nums">{formatZAR(p.price)}</div>
                </div>
                <p className="text-xs text-muted-foreground mt-2 flex-1">{p.description}</p>
                <div className="mt-3 flex items-center justify-between">
                  {p.popular ? <Badge variant="secondary" className="text-[10px]">⭐ Popular</Badge> : <span />}
                  <div className="ml-auto flex items-center gap-1.5">
                    {cart[p.id] ? (
                      <>
                        <Button size="icon" variant="outline" className="size-7" onClick={() => dec(p.id)}><Minus className="size-3" /></Button>
                        <span className="text-sm font-medium w-5 text-center tabular-nums">{cart[p.id]}</span>
                        <Button size="icon" variant="outline" className="size-7" onClick={() => inc(p.id)}><Plus className="size-3" /></Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => inc(p.id)}><Plus className="size-3" />Add</Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {items.length === 0 && <div className="col-span-full text-center text-sm text-muted-foreground py-12">No items in this category yet.</div>}
        </div>
      </div>

      <aside className="card-soft p-5 h-fit sticky top-20">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display font-semibold flex items-center gap-2"><ShoppingBag className="size-4 text-brand" />Your order</h3>
          <Badge variant="outline" className="text-[10px]">{cartItems.length} item{cartItems.length !== 1 ? "s" : ""}</Badge>
        </div>
        {cartItems.length === 0 ? (
          <p className="text-xs text-muted-foreground">Add items from the menu to start your order.</p>
        ) : (
          <>
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {cartItems.map(i => (
                <div key={i.id} className="flex items-start justify-between gap-2 text-sm border-b pb-2 last:border-0">
                  <div>
                    <div className="font-medium">{i.name}</div>
                    <div className="text-[11px] text-muted-foreground">{formatZAR(i.price)} × {i.qty}</div>
                  </div>
                  <div className="font-medium tabular-nums">{formatZAR(i.price * i.qty)}</div>
                </div>
              ))}
            </div>
            <div className="border-t pt-3 mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-medium tabular-nums">{formatZAR(subtotal)}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Service</span><span className="font-medium">Included</span></div>
            </div>
            <div className="mt-3 rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
              <label className="mb-2 flex items-center gap-2 font-medium text-foreground"><Wallet className="size-3.5" />Payment mode</label>
              <div className="grid gap-2">
                <button type="button" onClick={() => setPaymentMode("charge")} className={`flex items-center justify-between rounded-md border px-3 py-2 ${paymentMode === "charge" ? "border-brand bg-brand/10 text-brand" : "hover:bg-muted/50"}`}>
                  <span className="flex items-center gap-2"><ReceiptText className="size-3.5" />Charge to account</span>
                  <span className="text-[10px]">Invoice</span>
                </button>
                <button type="button" onClick={() => setPaymentMode("paystack")} className={`flex items-center justify-between rounded-md border px-3 py-2 ${paymentMode === "paystack" ? "border-brand bg-brand/10 text-brand" : "hover:bg-muted/50"}`}>
                  <span className="flex items-center gap-2"><CreditCard className="size-3.5" />Pay now with Paystack</span>
                  <span className="text-[10px]">Sandbox</span>
                </button>
              </div>
            </div>
            <Button className="w-full mt-3" onClick={() => checkout(paymentMode === "paystack" ? "Paystack" : "Charge to account")}>{paymentMode === "paystack" ? "Pay now with Paystack" : "Charge to account"}</Button>
            {invoicePreview && <Button variant="outline" className="w-full mt-2" onClick={() => {
              const invoice = loadInvoices().find((entry) => entry.id === invoicePreview);
              if (invoice) downloadInvoicePdf(invoice);
            }}>Download invoice PDF</Button>}
          </>
        )}
        <div className="mt-4 text-[11px] text-muted-foreground">Ready for pickup at the {branch} Café counter — average prep time 4 min.</div>
      </aside>
    </div>
  );
}

// ────────────────── My orders ──────────────────
const STATUS_TONE: Record<string, string> = {
  Queued: "bg-muted text-foreground/70",
  Preparing: "bg-warning/15 text-warning border-warning/30",
  Ready: "bg-brand/15 text-brand border-brand/30",
  Collected: "bg-success/15 text-success border-success/30",
  Shipped: "bg-brand/15 text-brand border-brand/30",
  Delivered: "bg-success/15 text-success border-success/30",
};

function MyOrders({ branch, tenant }: { branch: string; tenant?: string }) {
  const rows = tenantOrderHistory.filter((o) => o.branch === branch && o.kind === "cafe" && (tenant ? o.tenant === tenant : true));
  const reorder = (id: string) => toast.success(`Reordered ${id} — added to your cart`);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Orders (30 days)" value={String(rows.length)} accent="brand" />
        <StatCard label="Spent this month" value={formatZAR(rows.reduce((s, r) => s + r.total, 0))} accent="success" />
        <StatCard label="Charge to account" value={`${rows.filter(r => r.method === "Charge to account").length}`} hint="of total orders" />
        <StatCard label="Home branch" value={branch} />
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
                <TableCell>
                  <div className="text-sm">{o.items.map(i => `${i.qty}× ${i.name}`).join(" · ")}</div>
                </TableCell>
                <TableCell className="text-xs">{o.method}</TableCell>
                <TableCell className="text-right tabular-nums">{formatZAR(o.total)}</TableCell>
                <TableCell><Badge variant="outline" className={STATUS_TONE[o.status]}>{o.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => reorder(o.id)}><RotateCcw className="size-3" />Reorder</Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">No café orders yet at {branch}.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
