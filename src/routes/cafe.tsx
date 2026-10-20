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
import { cafeOrders, formatZAR, branches, type CafeProduct, type Invoice, createInvoice, PAYSTACK_PUBLIC_KEY, loadInvoices, saveInvoices, downloadInvoicePdf, getRoleBranch, getRoleTenant } from "@/lib/mock";
import { useRole } from "@/lib/role-context";
import { Coffee, Plus, ShoppingBag, Minus, Trash2, ChefHat, Store, History, ReceiptText, CreditCard, Wallet, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase";

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

type CafeProductRow = {
  id: string;
  branch_id: string;
  name: string;
  category: string;
  description: string;
  price_zar: number;
  image_url: string | null;
  vendor: string | null;
  is_available: boolean;
  is_popular: boolean;
  is_active: boolean;
  track_inventory: boolean;
  stock_quantity: number;
  low_stock_threshold: number;
};

function Cafe() {
  const { role } = useRole();
  const isCafeManager = role.id === "cafe-manager";
  const isAdmin = ["group-ceo", "branch-manager", "cafe-manager", "community-manager", "lydia-admin"].includes(role.id);
  const defaultTab = isAdmin ? "admin" : "shop";
  const [tab, setTab] = useState(defaultTab);
  const [workBranch, setWorkBranch] = useState("");
  const branch = role.branch ?? (isCafeManager ? "" : workBranch || getRoleBranch(role.id) || "Bryanston");
  const shopBranch = workBranch || branch;
  const tenant = role.tenant ?? getRoleTenant(role.id);
  const [products, setProducts] = useState<CafeProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    let active = true;
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("work_branch_id")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!active || !profile?.work_branch_id) return;
      const { data: branchResult } = await supabase
        .from("branches")
        .select("name")
        .eq("id", profile.work_branch_id)
        .maybeSingle();
      if (active) setWorkBranch(branchResult?.name ?? "");
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setProductsError("Supabase is not configured.");
      setProductsLoading(false);
      return;
    }

    let active = true;
    setProductsLoading(true);
    void Promise.all([
      supabase
        .from("cafe_products")
        .select("id,branch_id,name,category,description,price_zar,image_url,vendor,is_available,is_popular,is_active,track_inventory,stock_quantity,low_stock_threshold")
        .eq("is_active", true),
      supabase.from("branches").select("id,name"),
    ]).then(([productResult, branchResult]) => {
      if (!active) return;
      if (productResult.error || branchResult.error) {
        setProductsError(productResult.error?.message ?? branchResult.error?.message ?? "Could not load the café catalog.");
        setProducts([]);
      } else {
        const branchNames = new Map((branchResult.data ?? []).map(({ id, name }) => [id, name]));
        setProducts(((productResult.data ?? []) as CafeProductRow[]).map((product) => ({
          id: product.id,
          branch: branchNames.get(product.branch_id) ?? "Unknown branch",
          name: product.name,
          category: product.category as CafeProduct["category"],
          description: product.description,
          price: Number(product.price_zar),
          image: product.image_url ?? undefined,
          vendor: product.vendor ?? undefined,
          available: product.is_available,
          popular: product.is_popular,
          stockQuantity: product.stock_quantity,
          lowStockThreshold: product.low_stock_threshold,
          trackInventory: product.track_inventory,
        })));
        setProductsError(null);
      }
      setProductsLoading(false);
    });

    return () => {
      active = false;
    };
  }, [reloadKey]);

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

        {isCafeManager && !branch && <p role="alert" className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">This Café Manager account has no branch assigned. Ask an administrator to assign the correct branch before managing café stock.</p>}
        {productsError && <p role="alert" className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">Café catalog unavailable: {productsError}</p>}
        {isAdmin && <TabsContent value="admin"><AdminPanel defaultBranch={branch} canPickBranch={!isCafeManager} products={products} loading={productsLoading} onReload={() => setReloadKey((key) => key + 1)} /></TabsContent>}
        {isAdmin && <TabsContent value="kitchen"><KitchenBoard /></TabsContent>}
        <TabsContent value="shop"><Shop defaultBranch={shopBranch} canPickBranch={isAdmin && !isCafeManager} tenant={tenant} orderedBy={role.user} products={products} loading={productsLoading} /></TabsContent>
        <TabsContent value="orders"><MyOrders branch={branch} orderedBy={role.user} active={tab === "orders"} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ────────────────── Admin: product catalog per branch ──────────────────

function AdminPanel({
  defaultBranch,
  canPickBranch,
  products,
  loading,
  onReload,
}: {
  defaultBranch: string;
  canPickBranch: boolean;
  products: CafeProduct[];
  loading: boolean;
  onReload: () => void;
}) {
  const { role } = useRole();
  const [branch, setBranch] = useState(defaultBranch || liveBranches[0]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CafeProduct | null>(null);
  const [saving, setSaving] = useState(false);
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});

  const branchProducts = products.filter(p => p.branch === branch);
  const stats = {
    total: branchProducts.length,
    live: branchProducts.filter(p => p.available).length,
    lowStock: branchProducts.filter(p => p.trackInventory && (p.stockQuantity ?? 0) <= (p.lowStockThreshold ?? 0)).length,
  };

  const upsert = async (product: CafeProduct) => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Supabase is not configured.");
      return;
    }

    setSaving(true);
    try {
      const [{ data: branchRow, error: branchError }, { data: userData }] = await Promise.all([
        supabase.from("branches").select("id").eq("name", branch).maybeSingle(),
        supabase.auth.getUser(),
      ]);
      if (branchError || !branchRow) throw new Error(branchError?.message ?? "Branch not found.");

      const isExisting = products.some((item) => item.id === product.id);
      const payload = {
        branch_id: branchRow.id,
        name: product.name.trim(),
        category: product.category,
        description: product.description.trim(),
        price_zar: Math.round(product.price),
        image_url: product.image || null,
        vendor: product.vendor?.trim() || null,
        is_available: product.available,
        is_popular: Boolean(product.popular),
        track_inventory: product.trackInventory ?? true,
        low_stock_threshold: Math.max(0, product.lowStockThreshold ?? 5),
        updated_by: userData.user?.id ?? null,
      };

      const result = isExisting
        ? await supabase.from("cafe_products").update(payload).eq("id", product.id).eq("branch_id", branchRow.id).select("id").single()
        : await supabase.from("cafe_products").insert({ ...payload, created_by: userData.user?.id ?? null }).select("id").single();
      if (result.error) throw new Error(result.error.message);

      const initialStock = isExisting ? 0 : Math.max(0, Math.floor(product.stockQuantity ?? 0));
      if (initialStock > 0) {
        const { error: stockError } = await supabase.rpc("adjust_cafe_stock", {
          _product_id: result.data.id,
          _quantity_change: initialStock,
          _reason: "count_adjustment",
          _note: "Initial stock",
        });
        if (stockError) toast.error(`Product saved but initial stock was not recorded: ${stockError.message}`);
      }

      toast.success(isExisting ? `Updated ${product.name}` : `${product.name} added to ${branch}`);
      onReload();
      setEditing(null);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save café product.");
    } finally {
      setSaving(false);
    }
  };

  const archive = async (id: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.from("cafe_products").update({ is_active: false }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Product archived");
      onReload();
    }
  };

  const toggleAvailability = async (product: CafeProduct) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase
      .from("cafe_products")
      .update({ is_available: !product.available })
      .eq("id", product.id);
    if (error) toast.error(error.message);
    else onReload();
  };

  const restock = async (product: CafeProduct) => {
    const quantity = Number(stockInputs[product.id]);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      toast.error("Enter a positive whole number of units to restock.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.rpc("adjust_cafe_stock", {
      _product_id: product.id,
      _quantity_change: quantity,
      _reason: "restock",
      _note: `Restocked by ${role.user}`,
    });
    if (error) toast.error(error.message);
    else {
      toast.success(`${product.name} restocked by ${quantity}.`);
      setStockInputs((current) => ({ ...current, [product.id]: "" }));
      onReload();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <Label className="text-xs mb-1.5 block">Managing branch</Label>
            {canPickBranch ? (
              <Select value={branch} onValueChange={setBranch}>
                <SelectTrigger className="w-55"><SelectValue /></SelectTrigger>
                <SelectContent>{liveBranches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            ) : <Badge variant="outline" className="h-9 px-3">{branch || "No branch assigned"}</Badge>}
          </div>
          <div className="flex gap-2 ml-2">
            <Badge variant="outline">{stats.total} products</Badge>
            <Badge variant="outline" className="text-success border-success/30">{stats.live} live</Badge>
            <Badge variant="outline" className={stats.lowStock ? "text-warning border-warning/30" : "text-brand border-brand/30"}>{stats.lowStock} low stock</Badge>
          </div>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button size="sm" className="gap-1.5" disabled={saving || !branch}><Plus className="size-4" />New product</Button></DialogTrigger>
          <ProductDialog branch={branch} initial={editing} saving={saving} onSave={(product) => void upsert(product)} onClose={() => { setOpen(false); setEditing(null); }} />
        </Dialog>
      </div>

      <div className="card-soft overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground"><LoaderCircle className="mr-2 inline size-4 animate-spin" />Loading branch catalog</TableCell></TableRow>
            ) : branchProducts.map(p => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="font-medium text-sm flex items-center gap-2">{p.name}{p.popular && <Badge variant="secondary" className="text-[10px]">Popular</Badge>}</div>
                  <div className="text-[11px] text-muted-foreground line-clamp-1">{p.description}</div>
                </TableCell>
                <TableCell><Badge variant="outline" className="text-[10px]">{p.category}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{formatZAR(p.price)}</TableCell>
                <TableCell>
                  {p.trackInventory ? (
                    <div className="min-w-36 space-y-1">
                      <div className="flex items-center gap-2 text-xs"><span className="font-medium tabular-nums">{p.stockQuantity ?? 0} units</span>{(p.stockQuantity ?? 0) <= (p.lowStockThreshold ?? 0) && <Badge variant="outline" className="text-warning">Low</Badge>}</div>
                      <div className="flex gap-1"><Input type="number" min="1" step="1" aria-label={`Restock quantity for ${p.name}`} value={stockInputs[p.id] ?? ""} onChange={(event) => setStockInputs((current) => ({ ...current, [p.id]: event.target.value }))} className="h-7 w-16 px-2" /><Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => void restock(p)}>Restock</Button></div>
                    </div>
                  ) : <span className="text-xs text-muted-foreground">Not tracked</span>}
                </TableCell>
                <TableCell><div className="flex items-center gap-2"><Switch checked={p.available} onCheckedChange={() => void toggleAvailability(p)} /><span className="text-xs text-muted-foreground">{p.available ? "Available" : "Hidden"}</span></div></TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => { setEditing(p); setOpen(true); }}>Edit</Button>
                    <Button size="icon" variant="ghost" className="size-7 text-destructive hover:text-destructive" aria-label={`Archive ${p.name}`} onClick={() => void archive(p.id)}><Trash2 className="size-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!loading && branchProducts.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">No products yet for {branch}. Add the first one.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function createEmptyCafeProduct(branch: string): CafeProduct {
  return {
    id: "",
    branch, name: "", category: "Coffee", price: 35, description: "", available: true, popular: false,
    stockQuantity: 0, lowStockThreshold: 5, trackInventory: true,
  };
}

function ProductDialog({ branch, initial, saving, onSave, onClose }: { branch: string; initial: CafeProduct | null; saving: boolean; onSave: (p: CafeProduct) => void; onClose: () => void }) {
  const [form, setForm] = useState<CafeProduct>(initial ?? createEmptyCafeProduct(branch));

  useEffect(() => {
    setForm(initial ?? createEmptyCafeProduct(branch));
  }, [initial, branch]);

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
          <div className="space-y-1.5 col-span-2">
            <Label>Product image URL</Label>
            <Input type="url" value={form.image ?? ""} onChange={(event) => setForm({ ...form, image: event.target.value })} placeholder="https://…" />
            {form.image ? <img src={form.image} alt="Product preview" className="mt-2 h-24 w-full rounded-md object-cover border" /> : null}
          </div>
        </div>
        <div className="space-y-1.5"><Label>Description</Label><Textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm"><Switch checked={form.available} onCheckedChange={(v) => setForm({ ...form, available: v })} /> Available</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={!!form.popular} onCheckedChange={(v) => setForm({ ...form, popular: v })} /> Mark popular</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={form.trackInventory ?? true} onCheckedChange={(v) => setForm({ ...form, trackInventory: v })} /> Track stock</label>
        </div>
        {form.trackInventory && (
          <div className="grid grid-cols-2 gap-3">
            {!initial && <div className="space-y-1.5"><Label>Starting stock</Label><Input type="number" min="0" step="1" value={form.stockQuantity ?? 0} onChange={(event) => setForm({ ...form, stockQuantity: Number(event.target.value) })} /></div>}
            <div className="space-y-1.5"><Label>Low-stock alert at</Label><Input type="number" min="0" step="1" value={form.lowStockThreshold ?? 5} onChange={(event) => setForm({ ...form, lowStockThreshold: Number(event.target.value) })} /></div>
          </div>
        )}
        {initial && <p className="text-xs text-muted-foreground">Use the stock adjustment controls in the catalog to change on-hand quantity; each adjustment is recorded.</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button disabled={saving} onClick={() => { if (!form.name.trim()) { toast.error("Name is required"); return; } onSave({ ...form, branch }); }}>{saving ? "Saving…" : initial ? "Save" : "Add product"}</Button>
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

function Shop({ defaultBranch, canPickBranch, tenant, orderedBy, products, loading }: { defaultBranch: string; canPickBranch: boolean; tenant?: string; orderedBy: string; products: CafeProduct[]; loading: boolean }) {
  const [branch, setBranch] = useState(defaultBranch);
  const [cat, setCat] = useState<string>("All");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [paymentMode, setPaymentMode] = useState<"charge" | "cash_on_delivery" | "paystack">("charge");
  const [invoicePreview, setInvoicePreview] = useState<string | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [paystackReady, setPaystackReady] = useState(false);

  useEffect(() => {
    setBranch(defaultBranch);
  }, [defaultBranch]);

  const items = useMemo(() => products.filter(p => p.branch === branch && p.available && (!p.trackInventory || (p.stockQuantity ?? 0) > 0) && (cat === "All" || p.category === cat)), [products, branch, cat]);
  const cats = useMemo(() => {
    const set = new Set<string>(); products.filter(p => p.branch === branch && p.available && (!p.trackInventory || (p.stockQuantity ?? 0) > 0)).forEach(p => set.add(p.category));
    return ["All", ...set];
  }, [products, branch]);

  const inc = (id: string) => {
    const product = products.find((item) => item.id === id);
    if (!product?.available || (product.trackInventory && (cart[id] ?? 0) >= (product.stockQuantity ?? 0))) {
      toast.error("This item is no longer available in the requested quantity.");
      return;
    }
    setCart(current => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
  };
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
    const p = products.find(x => x.id === id)!;
    return { ...p, qty };
  });
  const subtotal = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const total = subtotal;
  const previewInvoice = invoicePreview
    ? loadInvoices().find((entry) => entry.id === invoicePreview) ?? null
    : null;

  const checkout = async (method: "Charge to account" | "Cash on Delivery" | "Paystack") => {
    if (cartItems.length === 0) return;
    if (method === "Charge to account" && !tenant) {
      toast.error("Charge to account is available to registered organization members.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Orders cannot be saved because Supabase is not configured.");
      return;
    }
    const [{ data: userResult, error: userError }, { data: branchResult, error: branchError }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("branches").select("id").eq("name", branch).maybeSingle(),
    ]);
    if (userError || !userResult.user) {
      toast.error(userError?.message ?? "Sign in before placing a café order.");
      return;
    }
    if (branchError || !branchResult) {
      toast.error(branchError?.message ?? "The selected café branch could not be found.");
      return;
    }
    let organizationId: string | null = null;
    if (tenant) {
      const { data: organization } = await supabase
        .from("organizations")
        .select("id")
        .eq("name", tenant)
        .maybeSingle();
      organizationId = organization?.id ?? null;
    }
    const invoice = createInvoice({
      tenant: tenant ?? "Public customer",
      orderedBy,
      amount: total,
      status: method === "Charge to account" ? "Sent" : method === "Paystack" ? "Pending verification" : "Unpaid",
      due: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      method,
      items: cartItems.map((item) => ({ name: item.name, qty: item.qty, price: item.price, image: item.image })),
      branch,
      kind: "cafe",
      note: `${branch} café order via ${method}`,
    });
    const { error: orderError } = await supabase.from("cafe_orders").insert({
      branch_id: branchResult.id,
      profile_id: userResult.user.id,
      item: cartItems.map((item) => `${item.qty}× ${item.name}`).join(", "),
      amount_zar: Math.round(total),
      method,
      status: "queued",
      invoice_id: invoice.id,
      organization_id: organizationId,
      organization_name: tenant ?? "Public customer",
      purchaser_name: orderedBy,
      items: invoice.items,
      payment_status: invoice.status,
      due_date: invoice.due,
    });
    if (orderError) {
      saveInvoices(loadInvoices().filter((entry) => entry.id !== invoice.id));
      setInvoicePreview(null);
      toast.error(`Order could not be saved: ${orderError.message}`);
      return;
    }
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
          saveInvoices(loadInvoices().map((entry) => entry.id === invoice.id ? { ...entry, status: "Paid" } : entry));
          void supabase.from("cafe_orders").update({ payment_status: "Paid" }).eq("invoice_id", invoice.id).eq("profile_id", userResult.user.id);
          toast.success(`Paystack payment completed · ${response.reference}`);
          setCart({});
        },
      });
      popup.openIframe();
      return;
    }
    toast.success(method === "Cash on Delivery" ? "Order placed. Pay cash on delivery." : `Charge to account confirmed · ${invoice.id}`);
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

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading café menu</div>
        ) : <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
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
                        <Button size="icon" variant="outline" className="size-7" disabled={p.trackInventory && cart[p.id] >= (p.stockQuantity ?? 0)} onClick={() => inc(p.id)}><Plus className="size-3" /></Button>
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
        </div>}
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
                  <div className="flex min-w-0 items-center gap-2.5">
                    <img src={i.image ?? createProductIllustration(i)} alt={i.name} className="size-12 shrink-0 rounded object-cover" />
                    <div className="min-w-0">
                      <div className="font-medium">{i.name}</div>
                      <div className="text-[11px] text-muted-foreground">{formatZAR(i.price)} × {i.qty}</div>
                    </div>
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
                <button type="button" onClick={() => setPaymentMode("cash_on_delivery")} className={`flex items-center justify-between rounded-md border px-3 py-2 ${paymentMode === "cash_on_delivery" ? "border-brand bg-brand/10 text-brand" : "hover:bg-muted/50"}`}>
                  <span className="flex items-center gap-2"><Wallet className="size-3.5" />Cash on Delivery</span>
                  <span className="text-[10px]">Pay on receipt</span>
                </button>
                <button type="button" onClick={() => setPaymentMode("paystack")} className={`flex items-center justify-between rounded-md border px-3 py-2 ${paymentMode === "paystack" ? "border-brand bg-brand/10 text-brand" : "hover:bg-muted/50"}`}>
                  <span className="flex items-center gap-2"><CreditCard className="size-3.5" />Pay now with Paystack</span>
                  <span className="text-[10px]">Sandbox</span>
                </button>
              </div>
            </div>
            <Button className="w-full mt-3" onClick={() => checkout(paymentMode === "paystack" ? "Paystack" : paymentMode === "cash_on_delivery" ? "Cash on Delivery" : "Charge to account")}>{paymentMode === "paystack" ? "Pay now with Paystack" : paymentMode === "cash_on_delivery" ? "Place order · Cash on Delivery" : "Charge to account"}</Button>
            {previewInvoice && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setViewingInvoice(previewInvoice)}>View invoice</Button>
                <Button variant="outline" onClick={() => downloadInvoicePdf(previewInvoice)}>Download PDF</Button>
              </div>
            )}
          </>
        )}
        <div className="mt-4 text-[11px] text-muted-foreground">Ready for pickup at the {branch} Café counter — average prep time 4 min.</div>
      </aside>
      <InvoicePreviewDialog invoice={viewingInvoice} onClose={() => setViewingInvoice(null)} />
    </div>
  );
}

// ────────────────── My orders ──────────────────
const STATUS_TONE: Record<string, string> = {
  Paid: "bg-success/15 text-success border-success/30",
  Sent: "bg-brand/15 text-brand border-brand/30",
  Unpaid: "bg-warning/15 text-warning border-warning/30",
  "Pending verification": "bg-warning/15 text-warning border-warning/30",
  Overdue: "bg-destructive/10 text-destructive border-destructive/30",
  Draft: "bg-muted text-foreground/70",
  Queued: "bg-muted text-foreground/70",
  Preparing: "bg-warning/15 text-warning border-warning/30",
  Ready: "bg-brand/15 text-brand border-brand/30",
  Collected: "bg-success/15 text-success border-success/30",
  Shipped: "bg-brand/15 text-brand border-brand/30",
  Delivered: "bg-success/15 text-success border-success/30",
};

type CafeOrderRow = {
  id: string;
  branch_id: string | null;
  invoice_id: string | null;
  organization_name: string | null;
  purchaser_name: string | null;
  items: unknown;
  amount_zar: number | null;
  method: string | null;
  payment_status: string;
  due_date: string | null;
  created_at: string;
};

function MyOrders({ branch, orderedBy, active }: { branch: string; orderedBy: string; active: boolean }) {
  const [viewingInvoice, setViewingInvoice] = useState<Invoice | null>(null);
  const [orders, setOrders] = useState<Invoice[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");

  useEffect(() => {
    if (!active) return;
    let current = true;
    setOrdersLoading(true);
    setOrdersError("");

    const loadOrders = async () => {
      const supabase = getSupabaseClient();
      const localOrders = loadInvoices().filter((invoice) => invoice.kind === "cafe" && invoice.orderedBy === orderedBy);
      if (!supabase) {
        if (current) {
          setOrders(localOrders);
          setOrdersError("Order history is unavailable because Supabase is not configured.");
          setOrdersLoading(false);
        }
        return;
      }

      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (userError || !userResult.user) {
        if (current) {
          setOrders(localOrders);
          setOrdersError(userError?.message ?? "Sign in to view your saved orders.");
          setOrdersLoading(false);
        }
        return;
      }

      const [{ data: orderRows, error: orderError }, { data: branchRows }] = await Promise.all([
        supabase
          .from("cafe_orders")
          .select("id,branch_id,invoice_id,organization_name,purchaser_name,items,amount_zar,method,payment_status,due_date,created_at")
          .eq("profile_id", userResult.user.id)
          .order("created_at", { ascending: false }),
        supabase.from("branches").select("id,name"),
      ]);
      if (!current) return;
      if (orderError) {
        setOrders(localOrders);
        setOrdersError(orderError.message);
        setOrdersLoading(false);
        return;
      }

      const branchNames = new Map((branchRows ?? []).map(({ id, name }) => [id, name]));
      const savedOrders = ((orderRows ?? []) as CafeOrderRow[]).map((row): Invoice => ({
        id: row.invoice_id ?? row.id,
        tenant: row.organization_name ?? "Public customer",
        amount: Number(row.amount_zar ?? 0),
        status: row.payment_status as Invoice["status"],
        due: row.due_date ?? row.created_at.slice(0, 10),
        method: (row.method ?? "—") as Invoice["method"],
        items: Array.isArray(row.items) ? row.items as Invoice["items"] : [],
        issuedAt: row.created_at,
        orderedBy: row.purchaser_name ?? undefined,
        branch: row.branch_id ? branchNames.get(row.branch_id) ?? branch : branch,
        kind: "cafe",
      }));
      const savedIds = new Set(savedOrders.map((invoice) => invoice.id));
      setOrders([
        ...savedOrders,
        ...localOrders.filter((invoice) => !savedIds.has(invoice.id)),
      ].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)));
      setOrdersLoading(false);
    };

    void loadOrders();
    return () => { current = false; };
  }, [active, branch, orderedBy]);

  const rows = orders.filter((invoice) => invoice.kind === "cafe");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Orders (30 days)" value={String(rows.length)} accent="brand" />
        <StatCard label="Spent this month" value={formatZAR(rows.reduce((s, r) => s + r.amount, 0))} accent="success" />
        <StatCard label="Charge to account" value={`${rows.filter(r => r.method === "Charge to account").length}`} hint="of total orders" />
        <StatCard label="Home branch" value={branch} />
      </div>
      <div className="card-soft overflow-hidden">
        {ordersError && <p role="alert" className="border-b border-warning/30 bg-warning/10 p-3 text-sm">Saved order history could not be refreshed: {ordersError}</p>}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Method</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordersLoading && <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground"><LoaderCircle className="mr-2 inline size-4 animate-spin" />Loading orders</TableCell></TableRow>}
            {rows.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell>
                  <div className="text-sm font-medium">{invoice.id}</div>
                  <div className="text-[11px] text-muted-foreground">{new Date(invoice.issuedAt).toLocaleString("en-ZA")}</div>
                  {invoice.orderedBy && <div className="text-[11px] text-muted-foreground">Ordered by {invoice.orderedBy}</div>}
                </TableCell>
                <TableCell className="text-xs">{invoice.branch ?? "—"}</TableCell>
                <TableCell>
                  <div className="space-y-1.5">
                    {invoice.items.map((item) => (
                      <div key={`${invoice.id}-${item.name}`} className="flex items-center gap-2 text-sm">
                        {item.image && <img src={item.image} alt="" className="size-9 rounded object-cover" />}
                        <span>{item.qty}× {item.name}</span>
                      </div>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-xs">{invoice.method}</TableCell>
                <TableCell className="text-right tabular-nums">{formatZAR(invoice.amount)}</TableCell>
                <TableCell><Badge variant="outline" className={STATUS_TONE[invoice.status]}>{invoice.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="outline" className="h-7" onClick={() => setViewingInvoice(invoice)}>View</Button>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => downloadInvoicePdf(invoice)}>Download PDF</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!ordersLoading && rows.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No café orders yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <InvoicePreviewDialog invoice={viewingInvoice} onClose={() => setViewingInvoice(null)} />
    </div>
  );
}

function InvoicePreviewDialog({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(invoice)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Invoice {invoice?.id}</DialogTitle>
          <DialogDescription>{invoice?.status} · {invoice?.method} · {invoice?.branch}</DialogDescription>
        </DialogHeader>
        {invoice && (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-md border p-3 text-sm sm:grid-cols-2">
              <div><div className="text-xs text-muted-foreground">Organization / customer</div><div className="font-medium">{invoice.tenant}</div></div>
              <div><div className="text-xs text-muted-foreground">Ordered by</div><div className="font-medium">{invoice.orderedBy ?? "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Date and time</div><div className="font-medium">{new Date(invoice.issuedAt).toLocaleString("en-ZA")}</div></div>
              <div><div className="text-xs text-muted-foreground">Payment method</div><div className="font-medium">{invoice.method}</div></div>
            </div>
            <div className="divide-y rounded-md border">
              {invoice.items.map((item) => (
                <div key={`${invoice.id}-${item.name}`} className="flex items-center justify-between gap-3 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {item.image && <img src={item.image} alt="" className="size-12 shrink-0 rounded object-cover" />}
                    <div className="min-w-0"><div className="font-medium">{item.name}</div><div className="text-xs text-muted-foreground">{item.qty} × {formatZAR(item.price)}</div></div>
                  </div>
                  <div className="font-medium tabular-nums">{formatZAR(item.qty * item.price)}</div>
                </div>
              ))}
              <div className="flex justify-between p-3 font-semibold"><span>Total</span><span>{formatZAR(invoice.amount)}</span></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => downloadInvoicePdf(invoice)}>Download PDF</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
