import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { formatZAR, branches, type CafeProduct, type Invoice, createInvoice, PAYSTACK_PUBLIC_KEY, loadInvoices, saveInvoices, downloadInvoicePdf, getRoleBranch, getRoleTenant } from "@/lib/mock";
import { useRole } from "@/lib/role-context";
import { BellRing, CheckCircle2, Coffee, Plus, ShoppingBag, Minus, Trash2, ChefHat, Store, History, ReceiptText, CreditCard, Wallet, LoaderCircle, RefreshCw, Package, Download, Upload, Volume2, VolumeX } from "lucide-react";
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
  validateSearch: (search: Record<string, unknown>): { view?: "kitchen" } => ({
    ...(search.view === "kitchen" ? { view: "kitchen" } : {}),
  }),
  component: Cafe,
});

const liveBranches = branches.filter(b => b.status === "live").map(b => b.name);
const kitchenColumns = [
  { status: "queued", label: "New orders", action: "Accept order" },
  { status: "accepted", label: "Accepted", action: "Start preparing" },
  { status: "preparing", label: "Preparing", action: "Mark ready" },
  { status: "ready", label: "Ready", action: "Mark collected" },
  { status: "collected", label: "Collected", action: null },
];

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
  const { view } = Route.useSearch();
  const isCafeManager = role.id === "cafe-manager";
  const isAdmin = ["branch-manager", "cafe-manager", "community-manager", "lydia-admin"].includes(role.id);
  const canManagePantry = ["branch-manager", "cafe-manager"].includes(role.id);
  const canReviewRestockRequests = role.id === "branch-manager";
  const defaultTab = isAdmin ? "admin" : "shop";
  const initialTab = view === "kitchen" && isAdmin ? "kitchen" : defaultTab;
  const [tab, setTab] = useState(initialTab);
  const [workBranch, setWorkBranch] = useState("");
  const branch = role.branch ?? (isCafeManager ? "" : workBranch || getRoleBranch(role.id) || "Bryanston");
  const shopBranch = workBranch || branch;
  const tenant = role.tenant ?? getRoleTenant(role.id);
  const [products, setProducts] = useState<CafeProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setTab(view === "kitchen" && isAdmin ? "kitchen" : defaultTab);
  }, [defaultTab, isAdmin, view]);

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
          {canManagePantry && <TabsTrigger value="pantry" className="gap-1.5"><Package className="size-3.5" />Pantry &amp; inventory</TabsTrigger>}
          <TabsTrigger value="shop" className="gap-1.5"><Store className="size-3.5" />Shop</TabsTrigger>
          <TabsTrigger value="orders" className="gap-1.5"><History className="size-3.5" />My orders</TabsTrigger>
        </TabsList>

        {isCafeManager && !branch && <p role="alert" className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">This Café Manager account has no branch assigned. Ask an administrator to assign the correct branch before managing café stock.</p>}
        {productsError && <p role="alert" className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">Café catalog unavailable: {productsError}</p>}
        {isAdmin && <TabsContent value="admin"><AdminPanel defaultBranch={branch} canPickBranch={!isCafeManager} products={products} loading={productsLoading} onReload={() => setReloadKey((key) => key + 1)} /></TabsContent>}
        {isAdmin && <TabsContent value="kitchen"><KitchenBoard defaultBranch={branch} canPickBranch={!isCafeManager} /></TabsContent>}
        {canManagePantry && <TabsContent value="pantry"><PantryBoard defaultBranch={branch} canPickBranch={role.id === "branch-manager"} canReviewRequests={canReviewRestockRequests} /></TabsContent>}
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

type CafePantryItem = {
  id: string;
  branch_id: string;
  name: string;
  category: string;
  unit: string;
  quantity_on_hand: number;
  reorder_level: number;
  reorder_quantity: number;
  vendor: string | null;
  notes: string | null;
};

type CafeRestockRequest = {
  id: string;
  item_id: string;
  branch_id: string;
  requested_by: string;
  quantity: number;
  note: string | null;
  status: string;
  created_at: string;
};

type PantryImportRow = {
  name: string;
  category: string;
  unit: string;
  quantity: string;
  reorderLevel: string;
  reorderQuantity: string;
  vendor: string;
  notes: string;
};

const pantryCsvHeaders = ["name", "category", "unit", "on_hand", "reorder_level", "reorder_quantity", "supplier", "notes"];

function parsePantryCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"' && quoted && source[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted field.");
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function escapeCsvValue(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function PantryBoard({
  defaultBranch,
  canPickBranch,
  canReviewRequests,
}: {
  defaultBranch: string;
  canPickBranch: boolean;
  canReviewRequests: boolean;
}) {
  const [branch, setBranch] = useState(defaultBranch);
  const [branchOptions, setBranchOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [items, setItems] = useState<CafePantryItem[]>([]);
  const [requests, setRequests] = useState<CafeRestockRequest[]>([]);
  const [stockInputs, setStockInputs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingItem, setSavingItem] = useState(false);
  const [savingStockId, setSavingStockId] = useState<string | null>(null);
  const [requestingItemId, setRequestingItemId] = useState<string | null>(null);
  const [updatingRequestId, setUpdatingRequestId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvRows, setCsvRows] = useState<PantryImportRow[]>([]);
  const [csvError, setCsvError] = useState("");
  const [importingCsv, setImportingCsv] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    category: "Ingredients",
    unit: "kg",
    quantity: "0",
    reorderLevel: "1",
    reorderQuantity: "5",
    vendor: "",
    notes: "",
  });

  useEffect(() => setBranch(defaultBranch), [defaultBranch]);

  useEffect(() => {
    let active = true;
    const loadPantry = async () => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError("Pantry data is not configured.");
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data: availableBranches, error: branchError } = await supabase
        .from("branches")
        .select("id,name")
        .eq("status", "live")
        .order("name");
      if (!active) return;
      if (branchError) {
        setError(branchError.message);
        setLoading(false);
        return;
      }
      const options = availableBranches ?? [];
      setBranchOptions(options);
      const branchId = options.find((option) => option.name === branch)?.id;
      if (!branchId) {
        setItems([]);
        setRequests([]);
        setError(branch ? "This account has no pantry access for the selected branch." : "Assign a branch to this account to manage its pantry.");
        setLoading(false);
        return;
      }

      const [itemResult, requestResult] = await Promise.all([
        supabase
          .from("cafe_pantry_items")
          .select("id,branch_id,name,category,unit,quantity_on_hand,reorder_level,reorder_quantity,vendor,notes")
          .eq("branch_id", branchId)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("cafe_restock_requests")
          .select("id,item_id,branch_id,requested_by,quantity,note,status,created_at")
          .eq("branch_id", branchId)
          .order("created_at", { ascending: false })
          .limit(100),
      ]);
      if (!active) return;
      if (itemResult.error || requestResult.error) {
        setError(itemResult.error?.message ?? requestResult.error?.message ?? "Pantry data could not be loaded.");
        setItems([]);
        setRequests([]);
      } else {
        setItems((itemResult.data ?? []) as CafePantryItem[]);
        setRequests((requestResult.data ?? []) as CafeRestockRequest[]);
        setError("");
      }
      setLoading(false);
    };

    void loadPantry();
    return () => { active = false; };
  }, [branch, reloadKey]);

  const selectedBranchId = branchOptions.find((option) => option.name === branch)?.id;
  const lowStockItems = items.filter((item) => Number(item.quantity_on_hand) <= Number(item.reorder_level));
  const outstandingRequests = requests.filter((request) => ["requested", "approved", "ordered"].includes(request.status));
  const itemName = (itemId: string) => items.find((item) => item.id === itemId)?.name ?? "Pantry item";
  const csvRowErrors = csvRows.flatMap((row, index) => {
    const rowNumber = index + 2;
    const errors: string[] = [];
    if (!row.name.trim()) errors.push(`Row ${rowNumber}: item name is required.`);
    if (!row.unit.trim()) errors.push(`Row ${rowNumber}: unit is required.`);
    const quantity = Number(row.quantity);
    const reorderLevel = Number(row.reorderLevel);
    const reorderQuantity = Number(row.reorderQuantity);
    if (!row.quantity.trim() || !Number.isFinite(quantity) || quantity < 0) errors.push(`Row ${rowNumber}: on-hand quantity must be zero or more.`);
    if (!row.reorderLevel.trim() || !Number.isFinite(reorderLevel) || reorderLevel < 0) errors.push(`Row ${rowNumber}: reorder level must be zero or more.`);
    if (!row.reorderQuantity.trim() || !Number.isFinite(reorderQuantity) || reorderQuantity <= 0) errors.push(`Row ${rowNumber}: reorder quantity must be greater than zero.`);
    const normalizedName = row.name.trim().toLocaleLowerCase();
    if (normalizedName && items.some((item) => item.name.trim().toLocaleLowerCase() === normalizedName)) errors.push(`Row ${rowNumber}: ${row.name.trim()} already exists in this branch.`);
    if (normalizedName && csvRows.slice(0, index).some((previous) => previous.name.trim().toLocaleLowerCase() === normalizedName)) errors.push(`Row ${rowNumber}: duplicate item name in this file.`);
    return errors;
  });

  const downloadCsvTemplate = () => {
    const rows = [
      pantryCsvHeaders,
      ["Full-cream milk", "Dairy", "L", "8", "3", "12", "Local supplier", "Keep refrigerated"],
    ];
    const csv = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "pantry-inventory-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const loadPantryCsv = async (file?: File) => {
    setCsvError("");
    setCsvRows([]);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setCsvError("CSV files must be 5 MB or smaller.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setCsvError("Choose a .csv file.");
      return;
    }
    try {
      const records = parsePantryCsv(await file.text());
      if (records.length < 2) throw new Error("The CSV needs a header row and at least one pantry item.");
      const headers = records[0].map((header) => header.trim().toLowerCase().replace(/[\s-]+/g, "_"));
      const headerIndex = new Map(headers.map((header, index) => [header, index]));
      const findColumn = (record: string[], ...names: string[]) => {
        for (const name of names) {
          const index = headerIndex.get(name);
          if (index !== undefined) return record[index] ?? "";
        }
        return "";
      };
      const parsedRows = records.slice(1).map((record): PantryImportRow => ({
        name: findColumn(record, "name", "item", "item_name"),
        category: findColumn(record, "category") || "Ingredients",
        unit: findColumn(record, "unit", "uom"),
        quantity: findColumn(record, "on_hand", "quantity_on_hand", "stock_quantity"),
        reorderLevel: findColumn(record, "reorder_level", "reorder_point", "low_stock_threshold"),
        reorderQuantity: findColumn(record, "reorder_quantity", "restock_quantity"),
        vendor: findColumn(record, "supplier", "vendor"),
        notes: findColumn(record, "notes", "description"),
      }));
      if (parsedRows.length > 500) throw new Error("Import at most 500 pantry rows at a time.");
      setCsvFileName(file.name);
      setCsvRows(parsedRows);
    } catch (error) {
      setCsvError(error instanceof Error ? error.message : "Could not read this CSV file.");
    }
  };

  const importPantryCsv = async () => {
    if (!selectedBranchId || csvRows.length === 0 || csvRowErrors.length > 0) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setImportingCsv(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from("cafe_pantry_items").insert(csvRows.map((row) => ({
      branch_id: selectedBranchId,
      name: row.name.trim(),
      category: row.category.trim() || "Ingredients",
      unit: row.unit.trim(),
      quantity_on_hand: Number(row.quantity),
      reorder_level: Number(row.reorderLevel),
      reorder_quantity: Number(row.reorderQuantity),
      vendor: row.vendor.trim() || null,
      notes: row.notes.trim() || null,
      created_by: auth.user?.id ?? null,
    })));
    setImportingCsv(false);
    if (insertError) {
      setCsvError(insertError.message);
      return;
    }
    const importedCount = csvRows.length;
    setCsvImportOpen(false);
    setCsvRows([]);
    setCsvFileName("");
    setCsvError("");
    setReloadKey((key) => key + 1);
    toast.success(`${importedCount} pantry ${importedCount === 1 ? "item" : "items"} imported.`);
  };

  const addItem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedBranchId) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSavingItem(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from("cafe_pantry_items").insert({
      branch_id: selectedBranchId,
      name: draft.name.trim(),
      category: draft.category.trim() || "Ingredients",
      unit: draft.unit.trim() || "unit",
      quantity_on_hand: Number(draft.quantity),
      reorder_level: Number(draft.reorderLevel),
      reorder_quantity: Number(draft.reorderQuantity),
      vendor: draft.vendor.trim() || null,
      notes: draft.notes.trim() || null,
      created_by: auth.user?.id ?? null,
    });
    setSavingItem(false);
    if (insertError) {
      toast.error(insertError.message);
      return;
    }
    setDraft({ name: "", category: "Ingredients", unit: "kg", quantity: "0", reorderLevel: "1", reorderQuantity: "5", vendor: "", notes: "" });
    setItemDialogOpen(false);
    setReloadKey((key) => key + 1);
    toast.success("Pantry item added.");
  };

  const saveStockCount = async (item: CafePantryItem) => {
    const quantity = Number(stockInputs[item.id] ?? item.quantity_on_hand);
    if (!Number.isFinite(quantity) || quantity < 0) {
      toast.error("On-hand quantity must be zero or more.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSavingStockId(item.id);
    const { error: updateError } = await supabase
      .from("cafe_pantry_items")
      .update({ quantity_on_hand: quantity })
      .eq("id", item.id)
      .eq("branch_id", item.branch_id);
    setSavingStockId(null);
    if (updateError) {
      toast.error(updateError.message);
      return;
    }
    setStockInputs((current) => ({ ...current, [item.id]: String(quantity) }));
    setReloadKey((key) => key + 1);
    toast.success(`${item.name} stock count updated.`);
  };

  const requestRestock = async (item: CafePantryItem) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setRequestingItemId(item.id);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setRequestingItemId(null);
      toast.error("Sign in to request replenishment.");
      return;
    }
    const { error: insertError } = await supabase.from("cafe_restock_requests").insert({
      item_id: item.id,
      branch_id: item.branch_id,
      requested_by: auth.user.id,
      quantity: item.reorder_quantity,
      note: `Low stock: ${item.quantity_on_hand} ${item.unit} remaining; reorder level is ${item.reorder_level} ${item.unit}.`,
    });
    setRequestingItemId(null);
    if (insertError) {
      toast.error(insertError.message);
      return;
    }
    setReloadKey((key) => key + 1);
    toast.success(`Restock request sent for ${item.name}.`);
  };

  const updateRequestStatus = async (request: CafeRestockRequest, status: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    setUpdatingRequestId(request.id);
    const { error: updateError } = await supabase
      .from("cafe_restock_requests")
      .update({ status, reviewed_by: auth.user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq("id", request.id);
    setUpdatingRequestId(null);
    if (updateError) {
      toast.error(updateError.message);
      return;
    }
    setReloadKey((key) => key + 1);
    toast.success(status === "received" ? `${itemName(request.item_id)} marked received; pantry stock updated.` : "Restock request updated.");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <Label className="block text-xs">Pantry branch</Label>
          {canPickBranch ? (
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="w-55"><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>{branchOptions.map((option) => <SelectItem key={option.id} value={option.name}>{option.name}</SelectItem>)}</SelectContent>
            </Select>
          ) : <Badge variant="outline" className="h-9 px-3">{branch || "No branch assigned"}</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => setReloadKey((key) => key + 1)}><RefreshCw className={`mr-1 size-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</Button>
          <Button type="button" size="sm" variant="outline" onClick={downloadCsvTemplate}><Download className="mr-1 size-4" />Download CSV template</Button>
          <Dialog open={csvImportOpen} onOpenChange={setCsvImportOpen}>
            <Button type="button" size="sm" variant="outline" onClick={() => setCsvImportOpen(true)} disabled={!selectedBranchId}><Upload className="mr-1 size-4" />Import CSV</Button>
            <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Import pantry items</DialogTitle>
                <DialogDescription>Upload the editable template for {branch || "this branch"}, review the rows, and correct any errors before importing.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pantry-csv-file">Pantry CSV file</Label>
                  <Input id="pantry-csv-file" type="file" accept=".csv,text/csv" onChange={(event) => void loadPantryCsv(event.target.files?.[0])} />
                  <p className="text-xs text-muted-foreground">Required columns: name, unit, on_hand, reorder_level, reorder_quantity. Category, supplier, and notes are optional.</p>
                  {csvFileName && <p className="text-xs text-muted-foreground">{csvFileName} · {csvRows.length} rows ready</p>}
                </div>
                {csvError && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{csvError}</p>}
                {csvRowErrors.length > 0 && <div role="alert" className="max-h-28 overflow-y-auto rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-warning"><ul className="list-disc space-y-1 pl-4">{csvRowErrors.map((rowError) => <li key={rowError}>{rowError}</li>)}</ul></div>}
                {csvRows.length > 0 && <div className="overflow-x-auto rounded-md border">
                  <Table className="min-w-[1100px]">
                    <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Unit</TableHead><TableHead>On hand</TableHead><TableHead>Reorder level</TableHead><TableHead>Reorder qty</TableHead><TableHead>Supplier</TableHead><TableHead>Notes</TableHead><TableHead><span className="sr-only">Remove</span></TableHead></TableRow></TableHeader>
                    <TableBody>{csvRows.map((row, index) => {
                      const updateRow = (field: keyof PantryImportRow, value: string) => setCsvRows((current) => current.map((item, rowIndex) => rowIndex === index ? { ...item, [field]: value } : item));
                      return <TableRow key={`${row.name}-${index}`}>
                        <TableCell><Input aria-label={`Imported item name ${index + 1}`} className="h-8 min-w-32" maxLength={160} value={row.name} onChange={(event) => updateRow("name", event.target.value)} /></TableCell>
                        <TableCell><Input aria-label={`Imported category ${index + 1}`} className="h-8 min-w-28" value={row.category} onChange={(event) => updateRow("category", event.target.value)} /></TableCell>
                        <TableCell><Input aria-label={`Imported unit ${index + 1}`} className="h-8 w-20" value={row.unit} onChange={(event) => updateRow("unit", event.target.value)} /></TableCell>
                        <TableCell><Input aria-label={`Imported on-hand quantity ${index + 1}`} className="h-8 w-24" type="number" min="0" step="0.01" value={row.quantity} onChange={(event) => updateRow("quantity", event.target.value)} /></TableCell>
                        <TableCell><Input aria-label={`Imported reorder level ${index + 1}`} className="h-8 w-24" type="number" min="0" step="0.01" value={row.reorderLevel} onChange={(event) => updateRow("reorderLevel", event.target.value)} /></TableCell>
                        <TableCell><Input aria-label={`Imported reorder quantity ${index + 1}`} className="h-8 w-24" type="number" min="0.01" step="0.01" value={row.reorderQuantity} onChange={(event) => updateRow("reorderQuantity", event.target.value)} /></TableCell>
                        <TableCell><Input aria-label={`Imported supplier ${index + 1}`} className="h-8 min-w-28" value={row.vendor} onChange={(event) => updateRow("vendor", event.target.value)} /></TableCell>
                        <TableCell><Input aria-label={`Imported notes ${index + 1}`} className="h-8 min-w-36" value={row.notes} onChange={(event) => updateRow("notes", event.target.value)} /></TableCell>
                        <TableCell><Button type="button" size="icon" variant="ghost" aria-label={`Remove ${row.name || `row ${index + 1}`}`} onClick={() => setCsvRows((current) => current.filter((_, rowIndex) => rowIndex !== index))}><Trash2 className="size-4" /></Button></TableCell>
                      </TableRow>;
                    })}</TableBody>
                  </Table>
                </div>}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setCsvImportOpen(false)} disabled={importingCsv}>Cancel</Button>
                <Button type="button" onClick={() => void importPantryCsv()} disabled={importingCsv || csvRows.length === 0 || csvRowErrors.length > 0}>{importingCsv ? "Importing…" : `Import ${csvRows.length || ""} items`}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
            <Button type="button" size="sm" onClick={() => setItemDialogOpen(true)} disabled={!selectedBranchId}><Plus className="mr-1 size-4" />Add pantry item</Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add pantry item</DialogTitle>
                <DialogDescription>Track ingredients and supplies for {branch || "this branch"}.</DialogDescription>
              </DialogHeader>
              <form onSubmit={(event) => void addItem(event)} className="space-y-3">
                <div className="space-y-1.5"><Label htmlFor="pantry-item-name">Item name</Label><Input id="pantry-item-name" required maxLength={160} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Full-cream milk" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label htmlFor="pantry-category">Category</Label><Input id="pantry-category" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="Ingredients" /></div>
                  <div className="space-y-1.5"><Label htmlFor="pantry-unit">Unit</Label><Input id="pantry-unit" required value={draft.unit} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} placeholder="kg, L, pack" /></div>
                  <div className="space-y-1.5"><Label htmlFor="pantry-quantity">On hand</Label><Input id="pantry-quantity" type="number" min="0" step="0.01" required value={draft.quantity} onChange={(event) => setDraft({ ...draft, quantity: event.target.value })} /></div>
                  <div className="space-y-1.5"><Label htmlFor="pantry-reorder-level">Reorder level</Label><Input id="pantry-reorder-level" type="number" min="0" step="0.01" required value={draft.reorderLevel} onChange={(event) => setDraft({ ...draft, reorderLevel: event.target.value })} /></div>
                  <div className="space-y-1.5"><Label htmlFor="pantry-reorder-quantity">Reorder quantity</Label><Input id="pantry-reorder-quantity" type="number" min="0.01" step="0.01" required value={draft.reorderQuantity} onChange={(event) => setDraft({ ...draft, reorderQuantity: event.target.value })} /></div>
                  <div className="space-y-1.5"><Label htmlFor="pantry-vendor">Supplier</Label><Input id="pantry-vendor" value={draft.vendor} onChange={(event) => setDraft({ ...draft, vendor: event.target.value })} /></div>
                </div>
                <div className="space-y-1.5"><Label htmlFor="pantry-notes">Notes</Label><Textarea id="pantry-notes" rows={2} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Storage or handling notes" /></div>
                <DialogFooter><Button type="button" variant="outline" onClick={() => setItemDialogOpen(false)} disabled={savingItem}>Cancel</Button><Button type="submit" disabled={savingItem}>{savingItem ? "Saving…" : "Save item"}</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Pantry items" value={loading ? "—" : String(items.length)} />
        <StatCard label="Low stock" value={loading ? "—" : String(lowStockItems.length)} accent={lowStockItems.length ? "warning" : "success"} hint="At or below reorder level" />
        <StatCard label="Open restock requests" value={loading ? "—" : String(outstandingRequests.length)} accent={outstandingRequests.length ? "brand" : "success"} />
      </div>

      {error && <p role="alert" className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">Pantry unavailable: {error}</p>}
      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b p-4"><h2 className="font-display text-base font-semibold">Pantry inventory</h2><p className="mt-1 text-xs text-muted-foreground">Update counts as ingredients are used. Low-stock items can be sent to the branch manager for replenishment.</p></div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Item</TableHead><TableHead>Category</TableHead><TableHead>On hand</TableHead><TableHead>Reorder point</TableHead><TableHead>Supplier</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground"><LoaderCircle className="mr-2 inline size-4 animate-spin" />Loading pantry</TableCell></TableRow> : items.map((item) => {
                const lowStock = Number(item.quantity_on_hand) <= Number(item.reorder_level);
                const hasOpenRequest = requests.some((request) => request.item_id === item.id && ["requested", "approved", "ordered"].includes(request.status));
                return <TableRow key={item.id}>
                  <TableCell><div className="font-medium">{item.name}</div>{item.notes && <div className="text-xs text-muted-foreground">{item.notes}</div>}</TableCell>
                  <TableCell>{item.category}</TableCell>
                  <TableCell><div className="flex items-center gap-2"><Input aria-label={`On-hand quantity for ${item.name}`} type="number" min="0" step="0.01" className="h-8 w-24 tabular-nums" value={stockInputs[item.id] ?? String(item.quantity_on_hand)} onChange={(event) => setStockInputs((current) => ({ ...current, [item.id]: event.target.value }))} /><span className="text-xs text-muted-foreground">{item.unit}</span>{lowStock && <Badge variant="outline" className="text-warning">Low</Badge>}</div></TableCell>
                  <TableCell className="tabular-nums">{item.reorder_level} {item.unit}<div className="text-[11px] text-muted-foreground">Restock {item.reorder_quantity} {item.unit}</div></TableCell>
                  <TableCell>{item.vendor || "—"}</TableCell>
                  <TableCell className="text-right"><div className="inline-flex flex-wrap justify-end gap-1"><Button type="button" size="sm" variant="outline" disabled={savingStockId === item.id} onClick={() => void saveStockCount(item)}>{savingStockId === item.id ? "Saving…" : "Save count"}</Button><Button type="button" size="sm" disabled={!lowStock || hasOpenRequest || requestingItemId === item.id || canReviewRequests} onClick={() => void requestRestock(item)}>{requestingItemId === item.id ? "Sending…" : hasOpenRequest ? "Requested" : "Request restock"}</Button></div></TableCell>
                </TableRow>;
              })}
              {!loading && !error && items.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No pantry items for {branch}. Add ingredients and supplies to start tracking stock.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b p-4"><h2 className="font-display text-base font-semibold">Restock requests</h2><p className="mt-1 text-xs text-muted-foreground">Kitchen requests notify the branch manager. Mark a request received to add its quantity to on-hand stock.</p></div>
        {requests.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No replenishment requests for this branch.</p> : <div className="divide-y">
          {requests.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div><div className="font-medium text-sm">{itemName(request.item_id)} · {request.quantity} {items.find((item) => item.id === request.item_id)?.unit ?? "unit"}</div><div className="mt-1 text-xs text-muted-foreground">{request.note || "No note"} · {new Date(request.created_at).toLocaleString()}</div></div>
            {canReviewRequests ? <Select value={request.status} disabled={updatingRequestId === request.id || ["received", "declined"].includes(request.status)} onValueChange={(status) => void updateRequestStatus(request, status)}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>{["requested", "approved", "ordered", "received", "declined"].map((status) => <SelectItem key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</SelectItem>)}</SelectContent></Select> : <Badge variant={request.status === "received" ? "secondary" : "outline"}>{request.status}</Badge>}
          </div>)}
        </div>}
      </section>
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

type CafeKitchenOrder = {
  id: string;
  branch_id: string;
  item: string;
  amount_zar: number;
  method: string;
  status: string;
  organization_name: string | null;
  purchaser_name: string | null;
  created_at: string;
};

function playCafeOrderAlertSound(context: AudioContext) {
  if (context.state !== "running") return;
  const startAt = context.currentTime;
  [784, 988, 1174].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const noteStart = startAt + index * 0.16;
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.14, noteStart + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.24);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + 0.25);
  });
}

function KitchenBoard({ defaultBranch, canPickBranch }: { defaultBranch: string; canPickBranch: boolean }) {
  const [branch, setBranch] = useState(defaultBranch);
  const [branchNames, setBranchNames] = useState<Record<string, string>>({});
  const [branchOptions, setBranchOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [orders, setOrders] = useState<CafeKitchenOrder[]>([]);
  const [newOrderAlertIds, setNewOrderAlertIds] = useState<string[]>([]);
  const [orderSoundEnabled, setOrderSoundEnabled] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const seenOrderIds = useRef(new Set<string>());
  const hasLoadedOrderSnapshot = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setBranch(defaultBranch);
  }, [defaultBranch]);

  const selectedBranchId = branchOptions.find((option) => option.name === branch)?.id;

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();
    const loadOrders = async () => {
      if (!supabase) {
        setError("Supabase is not configured.");
        setLoading(false);
        return;
      }

      setLoading(true);
      const [orderResult, branchResult] = await Promise.all([
        supabase
          .from("cafe_orders")
          .select("id,branch_id,item,amount_zar,method,status,organization_name,purchaser_name,created_at")
          .order("created_at", { ascending: false }),
        supabase.from("branches").select("id,name").eq("status", "live").order("name"),
      ]);
      if (!active) return;
      if (orderResult.error || branchResult.error) {
        setError(orderResult.error?.message ?? branchResult.error?.message ?? "Could not load café orders.");
        setOrders([]);
      } else {
        const options = branchResult.data ?? [];
        const loadedOrders = (orderResult.data ?? []) as CafeKitchenOrder[];
        const incomingOrders = hasLoadedOrderSnapshot.current
          ? loadedOrders.filter((order) => order.status.toLowerCase() === "queued" && !seenOrderIds.current.has(order.id))
          : [];
        loadedOrders.forEach((order) => seenOrderIds.current.add(order.id));
        hasLoadedOrderSnapshot.current = true;
        if (incomingOrders.length) {
          setNewOrderAlertIds((current) => [...new Set([...current, ...incomingOrders.map((order) => order.id)])]);
        }
        setBranchOptions(options);
        setBranchNames(Object.fromEntries(options.map(({ id, name }) => [id, name])));
        setOrders((current) => {
          const merged = new Map(current.map((order) => [order.id, order]));
          loadedOrders.forEach((order) => merged.set(order.id, order));
          return [...merged.values()].sort((first, second) => second.created_at.localeCompare(first.created_at));
        });
        setError("");
      }
      setLoading(false);
    };

    void loadOrders();
    const interval = window.setInterval(() => void loadOrders(), 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [refreshKey]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase || !selectedBranchId) return;
    const channel = supabase
      .channel(`cafe-orders-${selectedBranchId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "cafe_orders",
        filter: `branch_id=eq.${selectedBranchId}`,
      }, (payload) => {
        const order = payload.new as CafeKitchenOrder;
        if (!order?.id) return;
        seenOrderIds.current.add(order.id);
        setOrders((current) => current.some((existing) => existing.id === order.id) ? current : [order, ...current]);
        setNewOrderAlertIds((current) => current.includes(order.id) ? current : [...current, order.id]);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [selectedBranchId]);

  const branchOrders = branch
    ? orders.filter((order) => Boolean(selectedBranchId) && order.branch_id === selectedBranchId)
    : orders;
  const incomingOrder = branchOrders.find((order) => newOrderAlertIds.includes(order.id) && order.status.toLowerCase() === "queued");
  useEffect(() => {
    if (!incomingOrder || !orderSoundEnabled) return;
    const playAlert = () => {
      const context = audioContextRef.current;
      if (context) playCafeOrderAlertSound(context);
    };
    playAlert();
    const interval = window.setInterval(playAlert, 15_000);
    return () => window.clearInterval(interval);
  }, [incomingOrder?.id, orderSoundEnabled]);

  const waitingForAcceptance = branchOrders.filter((order) => order.status.toLowerCase() === "queued");
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const ordersToday = branchOrders.filter((order) => order.created_at.startsWith(today));
  const ordersThisMonth = branchOrders.filter((order) => order.created_at.startsWith(month));
  const accountOrders = ordersThisMonth.filter((order) => order.method.toLowerCase() === "charge to account").length;
  const accountShare = ordersThisMonth.length ? `${Math.round((accountOrders / ordersThisMonth.length) * 100)}%` : "0%";

  const toggleOrderSound = async (enabled: boolean) => {
    if (!enabled) {
      setOrderSoundEnabled(false);
      return;
    }
    if (typeof window.AudioContext === "undefined") {
      toast.error("This browser does not support kitchen alert sounds.");
      return;
    }
    try {
      const context = audioContextRef.current ?? new window.AudioContext();
      audioContextRef.current = context;
      await context.resume();
      setOrderSoundEnabled(true);
      if (!incomingOrder) playCafeOrderAlertSound(context);
    } catch {
      toast.error("Could not enable kitchen alert sound. Check your browser audio settings.");
    }
  };

  const advanceOrder = async (order: CafeKitchenOrder, nextStatus: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setUpdatingId(order.id);
    const { data, error: updateError } = await supabase.rpc("advance_cafe_order_status", {
      _order_id: order.id,
      _next_status: nextStatus,
    });
    if (updateError || !data) {
      toast.error(updateError?.message ?? "Order status could not be updated.");
    } else {
      setOrders((current) => current.map((item) => item.id === order.id ? { ...item, status: nextStatus } : item));
      if (nextStatus === "accepted") {
        setNewOrderAlertIds((current) => current.filter((id) => id !== order.id));
      }
      toast.success(`Order moved to ${nextStatus}.`);
    }
    setUpdatingId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label className="mb-1.5 block text-xs font-medium">Kitchen branch</label>
          {canPickBranch ? (
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="w-55"><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>{branchOptions.map((option) => <SelectItem key={option.id} value={option.name}>{option.name}</SelectItem>)}</SelectContent>
            </Select>
          ) : <Badge variant="outline" className="h-9 px-3">{branch || "No branch assigned"}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-9 items-center gap-2 rounded-md border px-3">
            {orderSoundEnabled ? <Volume2 className="size-4 text-success" /> : <VolumeX className="size-4 text-muted-foreground" />}
            <span className="text-xs">Order sound</span>
            <Switch checked={orderSoundEnabled} onCheckedChange={(enabled) => void toggleOrderSound(enabled)} aria-label="Enable new-order alert sound" />
          </div>
          <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={loading} onClick={() => setRefreshKey((key) => key + 1)}>
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />Refresh
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Waiting acceptance" value={String(waitingForAcceptance.length)} accent={waitingForAcceptance.length ? "warning" : "success"} />
        <StatCard label="Orders today" value={String(ordersToday.length)} accent="brand" />
        <StatCard label="Café revenue (month)" value={formatZAR(ordersThisMonth.reduce((sum, order) => sum + Number(order.amount_zar), 0))} accent="success" />
        <StatCard label="Charge to account" value={accountShare} hint="of this month's orders" />
      </div>
      {waitingForAcceptance.length > 0 && (
        <div role="status" aria-live="polite" className="flex items-center justify-between gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3">
          <div>
            <div className="text-sm font-semibold">{waitingForAcceptance.length} order{waitingForAcceptance.length === 1 ? "" : "s"} waiting for acceptance</div>
            <div className="mt-0.5 text-xs text-muted-foreground">Review each order and accept it before preparation begins.</div>
          </div>
          <Badge variant="outline" className="border-warning/40 text-warning">New</Badge>
        </div>
      )}
      {error && <p role="alert" className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">Kitchen orders unavailable: {error}</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {kitchenColumns.map((column) => {
          const columnOrders = branchOrders.filter((order) => order.status.toLowerCase() === column.status);
          return (
            <div key={column.status} className="rounded-lg bg-muted/40 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-foreground/70">{column.label}</div>
                <Badge variant="outline" className="text-[10px]">{columnOrders.length}</Badge>
              </div>
              <div className="space-y-2">
                {loading && orders.length === 0 ? (
                  <p className="py-4 text-center text-xs text-muted-foreground">Loading orders…</p>
                ) : columnOrders.map((order) => (
                  <div key={order.id} className={`card-soft space-y-3 p-3 ${newOrderAlertIds.includes(order.id) ? "border-warning/60 ring-1 ring-warning/20" : ""}`}>
                    <div className="flex items-start gap-2">
                      <div className="grid size-8 shrink-0 place-items-center rounded-md bg-warning/15 text-warning"><Coffee className="size-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium leading-tight">{order.item}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{order.purchaser_name || order.organization_name || "Café customer"} · {branchNames[order.branch_id] ?? "Unknown branch"}</div>
                        <div className="mt-1 flex justify-between gap-2 text-[10px] text-brand">
                          <span>{order.method}</span>
                          <span>{formatZAR(Number(order.amount_zar))} · {new Date(order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      </div>
                    </div>
                    {column.action && (
                      <Button type="button" size="sm" variant={column.status === "queued" ? "default" : "outline"} className="h-8 w-full" disabled={updatingId === order.id} onClick={() => void advanceOrder(order, kitchenColumns[kitchenColumns.findIndex((item) => item.status === column.status) + 1].status)}>
                        {updatingId === order.id ? "Updating…" : column.action}
                      </Button>
                    )}
                  </div>
                ))}
                {!loading && !error && columnOrders.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">No orders</p>}
              </div>
            </div>
          );
        })}
      </div>
      {incomingOrder && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="incoming-cafe-order-title" className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center overflow-y-auto bg-[#070a0e] px-4 py-8 text-white">
          <div className="w-full max-w-2xl">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300"><BellRing className="size-5" />New café order</div>
              <Badge className="border border-amber-300/30 bg-amber-300/10 text-amber-200">Needs acceptance</Badge>
            </div>
            <div className="text-sm font-medium text-white/55">ORDER NUMBER</div>
            <div className="mt-1 font-mono text-2xl font-semibold tracking-wider">#{incomingOrder.id.slice(0, 8).toUpperCase()}</div>
            <h1 id="incoming-cafe-order-title" className="mt-8 font-display text-4xl font-semibold sm:text-5xl">Incoming order</h1>
            <p className="mt-3 text-base text-white/65">{incomingOrder.purchaser_name || incomingOrder.organization_name || "Café customer"} · {branchNames[incomingOrder.branch_id] ?? branch}</p>
            <section className="mt-8 border-y border-white/15 py-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50">Items ordered</h2>
              <p className="mt-3 whitespace-pre-wrap text-2xl font-medium leading-relaxed sm:text-3xl">{incomingOrder.item}</p>
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/60">
                <span>{incomingOrder.method}</span>
                <span>{formatZAR(Number(incomingOrder.amount_zar))}</span>
                <span>{new Date(incomingOrder.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            </section>
            <Button type="button" size="lg" disabled={updatingId === incomingOrder.id} onClick={() => void advanceOrder(incomingOrder, "accepted")} className="mt-8 h-14 w-full gap-2 bg-emerald-400 text-base font-semibold text-black hover:bg-emerald-300">
              <CheckCircle2 className="size-5" />{updatingId === incomingOrder.id ? "Accepting order…" : "Accept order"}
            </Button>
            <button type="button" onClick={() => setNewOrderAlertIds((current) => current.filter((id) => id !== incomingOrder.id))} className="mt-4 w-full py-3 text-sm text-white/50 hover:text-white/80">Dismiss alert · keep in New orders</button>
          </div>
        </div>
      )}
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
      toast.error("Charge to account is for registered tenant members. Choose Cash on Delivery or Paystack to place this order.");
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
