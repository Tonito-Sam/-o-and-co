import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ChangeEvent } from "react";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { marketplace, tenantOrderHistory, ROLES, formatZAR, createInvoice, PAYSTACK_PUBLIC_KEY, loadInvoices, downloadInvoicePdf, getRoleBranch, getRoleTenant, type MarketplaceListing, type RoleId } from "@/lib/mock";
import { useRole } from "@/lib/role-context";
import { Star, ShoppingBag, History, RotateCcw, Store, Plus, Minus, ReceiptText, Wallet, CreditCard } from "lucide-react";
import { toast } from "sonner";

type PaystackPopup = { openIframe: () => void };
type VendorAccessLevel = "listing" | "sales" | "full";
type MarketplaceVendor = {
  id: string;
  name: string;
  company: string;
  email: string;
  category: string;
  canList: boolean;
  accessLevel: VendorAccessLevel;
  addedAt: string;
};

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

export const Route = createFileRoute("/marketplace")({
  head: () => ({ meta: [{ title: "Marketplace — WorkspaceOS" }] }),
  component: Marketplace,
});

function tenantBranchFor(roleId: RoleId): string {
  return getRoleBranch(roleId) ?? "Bryanston";
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
  const isVendor = role.id === "external-vendor";
  const canManageVendors = ["group-ceo", "sales-manager", "rosebank-sales", "branch-manager", "community-manager", "finance", "lydia-admin"].includes(role.id);
  const branch = tenantBranchFor(role.id);
  const tenant = getRoleTenant(role.id);
  const [tab, setTab] = useState(isTenant ? "shop" : "shop");
  const [vendorTab, setVendorTab] = useState("listings");
  const [cat, setCat] = useState("All");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [paymentMode, setPaymentMode] = useState<"charge" | "paystack">("charge");
  const [invoicePreview, setInvoicePreview] = useState<string | null>(null);
  const [paystackReady, setPaystackReady] = useState(false);
  const [isListingOpen, setIsListingOpen] = useState(false);
  const [isVendorOpen, setIsVendorOpen] = useState(false);
  const [listings, setListings] = useState<MarketplaceListing[]>(marketplace);
  const [vendors, setVendors] = useState<MarketplaceVendor[]>([]);
  const [vendorForm, setVendorForm] = useState({ name: "", company: "", email: "", category: "Supplies", accessLevel: "full" as VendorAccessLevel });
  const [listingForm, setListingForm] = useState({
    title: "",
    category: "Supplies",
    listingType: "product" as "product" | "service",
    price: "",
    description: "",
    seller: role.user,
    image: "",
    galleryImages: [] as string[],
    isPromo: false,
    salePrice: "",
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedVendors = window.localStorage.getItem("oco-marketplace-vendors");
    if (storedVendors) {
      try {
        setVendors(JSON.parse(storedVendors) as MarketplaceVendor[]);
      } catch {
        window.localStorage.removeItem("oco-marketplace-vendors");
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("oco-marketplace-vendors", JSON.stringify(vendors));
  }, [vendors]);

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

  const cats = ["All", ...Array.from(new Set(listings.map(m => m.category)))];
  const items = listings.filter(m => cat === "All" || m.category === cat);
  const vendorListings = listings.filter((item) => item.seller === role.user || item.seller === vendorForm.name || item.seller.includes(role.user));
  const vendorSales = tenantOrderHistory.filter((order) => order.kind === "marketplace").slice(0, 4);
  const vendorInvoices = loadInvoices().filter((invoice) => invoice.kind === "marketplace").slice(0, 4);
  const inc = (id: string) => setCart(c => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const dec = (id: string) => setCart(c => { const n = (c[id] ?? 0) - 1; const next = { ...c }; if (n <= 0) delete next[id]; else next[id] = n; return next; });
  const cartItems = Object.entries(cart).map(([id, qty]) => {
    const p = listings.find(item => item.id === id)!;
    return { ...p, qty };
  });
  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.qty, 0);

  const checkout = (method: "Charge to account" | "Paystack") => {
    if (cartItems.length === 0) return;
    const invoice = createInvoice({
      tenant: tenant ?? role.user,
      amount: subtotal,
      status: method === "Charge to account" ? "Sent" : "Paid",
      due: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      method: method === "Charge to account" ? "Charge to account" : "Paystack",
      items: cartItems.map((item) => ({ name: item.title, qty: item.qty, price: item.price })),
      branch,
      kind: "marketplace",
      note: `${branch} marketplace order via ${method}`,
    });
    setInvoicePreview(invoice.id);
    if (method === "Paystack") {
      if (typeof window === "undefined" || !window.PaystackPop || !paystackReady) {
        toast.info("Loading Paystack modal…");
        return;
      }
      const popup = window.PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: "tenant@example.com",
        amount: Math.round(subtotal * 100),
        currency: "ZAR",
        ref: invoice.id,
        label: `${branch} marketplace order`,
        onClose: () => toast.info("Paystack payment closed before completion."),
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

  const handleImageSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setListingForm((prev) => ({ ...prev, image: typeof reader.result === "string" ? reader.result : "" }));
    };
    reader.readAsDataURL(file);
  };

  const handleGallerySelect = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const readers = files.map((file) => new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.readAsDataURL(file);
    }));

    Promise.all(readers).then((images) => {
      setListingForm((prev) => ({ ...prev, galleryImages: [...prev.galleryImages, ...images.filter(Boolean)] }));
    });
  };

  const submitVendor = () => {
    if (!vendorForm.name.trim() || !vendorForm.company.trim() || !vendorForm.email.trim()) {
      toast.error("Please add the vendor name, company, and email.");
      return;
    }
    const vendor: MarketplaceVendor = {
      id: `V-${Date.now()}`,
      name: vendorForm.name.trim(),
      company: vendorForm.company.trim(),
      email: vendorForm.email.trim(),
      category: vendorForm.category,
      canList: true,
      accessLevel: vendorForm.accessLevel,
      addedAt: new Date().toISOString(),
    };
    setVendors((prev) => [vendor, ...prev]);
    toast.success(`${vendor.name} from ${vendor.company} can now list on the marketplace.`);
    setVendorForm({ name: "", company: "", email: "", category: "Supplies", accessLevel: "full" });
    setIsVendorOpen(false);
  };

  const submitListing = () => {
    if (!listingForm.title.trim() || !listingForm.price) {
      toast.error("Please add a title and price for the listing.");
      return;
    }
    if (listingForm.isPromo && !listingForm.salePrice) {
      toast.error("Please add a sale price when running a promo.");
      return;
    }
    const nextItem = {
      id: `MP-${Date.now()}`,
      seller: listingForm.seller || role.user,
      title: listingForm.title.trim(),
      price: Number(listingForm.price),
      category: listingForm.category as "Furniture" | "Services" | "Supplies" | "Other",
      listingType: listingForm.listingType,
      rating: 4.7,
      description: listingForm.description.trim(),
      image: listingForm.image || undefined,
      galleryImages: listingForm.galleryImages,
      isPromo: listingForm.isPromo,
      salePrice: listingForm.isPromo ? Number(listingForm.salePrice) : undefined,
    };
    setListings((prev) => [nextItem, ...prev]);
    toast.success(`Your listing for ${nextItem.title} is now live.`);
    setIsListingOpen(false);
    setListingForm({
      title: "",
      category: "Supplies",
      listingType: "product",
      price: "",
      description: "",
      seller: role.user,
      image: "",
      galleryImages: [],
      isPromo: false,
      salePrice: "",
    });
  };

  const removeVendorListing = (id: string) => {
    setListings((prev) => prev.filter((item) => item.id !== id));
    toast.success("Listing removed from your catalog.");
  };

  return (
    <div className="mx-auto max-w-350">
      <PageHeader
        eyebrow="Marketplace"
        title="Office & Co Store + Tenant Marketplace"
        description={isTenant
          ? `Stationery, furniture and services delivered to ${branch}. Review your past orders or reorder in one tap.`
          : "Stationery, furniture and services from Office & Co, plus offerings from the tenant community."}
        actions={
          <Dialog open={isListingOpen} onOpenChange={setIsListingOpen}>
            <DialogTrigger asChild>
              <Button size="sm">List a product</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>List a marketplace product</DialogTitle>
                <DialogDescription>Any user can publish an item or service for the tenant community.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Title</Label>
                    <Input value={listingForm.title} onChange={(e) => setListingForm({ ...listingForm, title: e.target.value })} placeholder="e.g. Premium stationery bundle" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Category</Label>
                    <Select value={listingForm.category} onValueChange={(value) => setListingForm({ ...listingForm, category: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Supplies">Supplies</SelectItem>
                        <SelectItem value="Furniture">Furniture</SelectItem>
                        <SelectItem value="Services">Services</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Price (ZAR)</Label>
                    <Input type="number" value={listingForm.price} onChange={(e) => setListingForm({ ...listingForm, price: e.target.value })} placeholder="1500" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Listing type</Label>
                    <Select value={listingForm.listingType} onValueChange={(value) => setListingForm({ ...listingForm, listingType: value as "product" | "service" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="product">Physical product</SelectItem>
                        <SelectItem value="service">Service</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Seller / presenter</Label>
                    <Select value={listingForm.seller} onValueChange={(value) => setListingForm({ ...listingForm, seller: value })}>
                      <SelectTrigger><SelectValue placeholder="Choose a seller" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={role.user}>{role.user}</SelectItem>
                        {vendors.map((vendor) => (
                          <SelectItem key={vendor.id} value={vendor.name}>{`${vendor.name} · ${vendor.company}`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>{listingForm.listingType === "service" ? "Banner image" : "Main image"}</Label>
                    <Input type="file" accept="image/*" onChange={handleImageSelect} />
                    <p className="text-[11px] text-muted-foreground">{listingForm.listingType === "service" ? "Use this as the hero banner for your service offer." : "Use this image as the primary product photo."}</p>
                    {listingForm.image ? (
                      <div className="mt-2 overflow-hidden rounded-md border border-border/60">
                        <img src={listingForm.image} alt="Selected listing preview" className="h-28 w-full object-cover" />
                      </div>
                    ) : null}
                  </div>
                  {listingForm.listingType === "product" && (
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Optional gallery</Label>
                      <Input type="file" accept="image/*" multiple onChange={handleGallerySelect} />
                      <p className="text-[11px] text-muted-foreground">Add multiple product photos so buyers can see different angles or details.</p>
                      {listingForm.galleryImages.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {listingForm.galleryImages.map((image, index) => (
                            <img key={`${image}-${index}`} src={image} alt={`Gallery ${index + 1}`} className="h-16 w-16 rounded-md border object-cover" />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="space-y-1.5 sm:col-span-2 rounded-lg border border-dashed border-border/70 bg-muted/20 p-3">
                    <div className="flex items-center gap-2">
                      <input id="promo-toggle" type="checkbox" checked={listingForm.isPromo} onChange={(e) => setListingForm({ ...listingForm, isPromo: e.target.checked, salePrice: e.target.checked ? listingForm.salePrice : "" })} className="h-4 w-4 rounded border-border" />
                      <Label htmlFor="promo-toggle">Run a promo or sale</Label>
                    </div>
                    {listingForm.isPromo && (
                      <div className="mt-2 space-y-1.5">
                        <Label>Sale price (ZAR)</Label>
                        <Input type="number" value={listingForm.salePrice} onChange={(e) => setListingForm({ ...listingForm, salePrice: e.target.value })} placeholder="1200" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Description</Label>
                    <Textarea rows={3} value={listingForm.description} onChange={(e) => setListingForm({ ...listingForm, description: e.target.value })} placeholder="Tell buyers what makes this listing useful." />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsListingOpen(false)}>Cancel</Button>
                <Button onClick={submitListing}>Publish listing</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {isTenant ? null : canManageVendors ? (
        <div className="mb-6 rounded-xl border border-border/70 bg-card/70 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-display font-semibold">External vendors</div>
              <div className="text-sm text-muted-foreground">Approve vendors who can publish marketplace listings for Office & Co.</div>
            </div>
            <Dialog open={isVendorOpen} onOpenChange={setIsVendorOpen}>
              <DialogTrigger asChild>
                <Button size="sm">Add vendor</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add an external vendor</DialogTitle>
                  <DialogDescription>These vendors can be selected as sellers when publishing marketplace listings.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Vendor name</Label>
                      <Input value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })} placeholder="Alicia Ndlovu" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Company</Label>
                      <Input value={vendorForm.company} onChange={(e) => setVendorForm({ ...vendorForm, company: e.target.value })} placeholder="Northstar Studio" />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Email</Label>
                      <Input type="email" value={vendorForm.email} onChange={(e) => setVendorForm({ ...vendorForm, email: e.target.value })} placeholder="vendor@company.com" />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Primary category</Label>
                      <Select value={vendorForm.category} onValueChange={(value) => setVendorForm({ ...vendorForm, category: value })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Supplies">Supplies</SelectItem>
                          <SelectItem value="Furniture">Furniture</SelectItem>
                          <SelectItem value="Services">Services</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label>Access level</Label>
                      <Select value={vendorForm.accessLevel} onValueChange={(value) => setVendorForm({ ...vendorForm, accessLevel: value as VendorAccessLevel })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="listing">Listings only</SelectItem>
                          <SelectItem value="sales">Listings + sales</SelectItem>
                          <SelectItem value="full">Full vendor access</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsVendorOpen(false)}>Cancel</Button>
                  <Button onClick={submitVendor}>Approve vendor</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {vendors.length === 0 ? (
              <div className="text-sm text-muted-foreground">No external vendors added yet.</div>
            ) : vendors.map((vendor) => (
              <Badge key={vendor.id} variant="outline" className="gap-1">
                <span className="font-medium">{vendor.name}</span>
                <span className="text-[10px] text-muted-foreground">{vendor.company}</span>
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {isVendor && (
        <div className="mb-6 rounded-xl border border-brand/20 bg-brand/5 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-display font-semibold">Vendor portal</div>
              <div className="text-sm text-muted-foreground">Manage your listings, review sales, and keep invoices in one place.</div>
            </div>
            <Badge variant="outline" className="border-brand/30 bg-background text-brand">Vendor workspace</Badge>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border bg-background/80 p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Listings</div>
              <div className="mt-1 text-2xl font-semibold">{vendorListings.length}</div>
            </div>
            <div className="rounded-lg border bg-background/80 p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Sales</div>
              <div className="mt-1 text-2xl font-semibold">{vendorSales.length}</div>
            </div>
            <div className="rounded-lg border bg-background/80 p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Invoices</div>
              <div className="mt-1 text-2xl font-semibold">{vendorInvoices.length}</div>
            </div>
          </div>
          <Tabs value={vendorTab} onValueChange={setVendorTab} className="mt-4">
            <TabsList className="h-auto">
              <TabsTrigger value="listings">Listings</TabsTrigger>
              <TabsTrigger value="sales">Sales</TabsTrigger>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
            </TabsList>
            <TabsContent value="listings" className="mt-3 rounded-lg border bg-background/80 p-3">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-medium">Your catalog</div>
                <Button size="sm" onClick={() => setIsListingOpen(true)}>Add item</Button>
              </div>
              <div className="space-y-2">
                {vendorListings.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No listings published yet.</div>
                ) : vendorListings.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-md border p-2">
                    <div>
                      <div className="text-sm font-medium">{item.title}</div>
                      <div className="text-[11px] text-muted-foreground">{formatZAR(item.price)} · {item.category}</div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => removeVendorListing(item.id)}>Remove</Button>
                  </div>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="sales" className="mt-3 rounded-lg border bg-background/80 p-3">
              <div className="mb-3 font-medium">Recent sales</div>
              <div className="space-y-2">
                {vendorSales.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <span>{sale.id}</span>
                    <span className="text-muted-foreground">{sale.status}</span>
                  </div>
                ))}
              </div>
            </TabsContent>
            <TabsContent value="invoices" className="mt-3 rounded-lg border bg-background/80 p-3">
              <div className="mb-3 font-medium">Invoices</div>
              <div className="space-y-2">
                {vendorInvoices.map((invoice) => (
                  <div key={invoice.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <span>{invoice.id}</span>
                    <span className="text-muted-foreground">{formatZAR(invoice.amount)}</span>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {!isVendor ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="GMV (month)" value={formatZAR(1_280_000)} delta="▲ 18%" accent="success" />
          <StatCard label="Active listings" value={String(listings.length)} />
          <StatCard label="Tenant sellers" value="38" delta="+5" accent="brand" />
          <StatCard label="Avg rating" value="4.7" hint="↑ from 4.6" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <StatCard label="Your listings" value={String(vendorListings.length)} accent="brand" />
          <StatCard label="Recent sales" value={String(vendorSales.length)} accent="success" />
          <StatCard label="Pending invoices" value={String(vendorInvoices.length)} accent="warning" />
        </div>
      )}

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
          <div className="grid xl:grid-cols-[1.2fr_360px] gap-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((m) => (
                <div key={m.id} className="card-soft overflow-hidden hover:shadow-elevated transition-shadow">
                  <div className="h-36 bg-linear-to-br from-accent via-brand-soft to-muted grid place-items-center overflow-hidden">
                    {m.image ? (
                      <img src={m.image} alt={m.title} className="h-full w-full object-cover" />
                    ) : (
                      <ShoppingBag className="size-10 text-brand/60" />
                    )}
                  </div>
                  <div className="p-4 flex flex-col h-full">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px] self-start">{m.category}</Badge>
                      {m.isPromo ? <Badge className="text-[10px] bg-warning/15 text-warning border-warning/30">Promo</Badge> : null}
                      {m.listingType === "service" ? <Badge variant="secondary" className="text-[10px]">Service</Badge> : null}
                    </div>
                    <div className="font-medium text-sm leading-tight mt-2">{m.title}</div>
                    <div className="text-[11px] text-muted-foreground mt-1">by {m.seller}</div>
                    <div className="mt-3 flex items-center justify-between">
                      <div>
                        <div className="font-display text-lg font-semibold tabular-nums">{m.isPromo && typeof m.salePrice === "number" ? formatZAR(m.salePrice) : formatZAR(m.price)}</div>
                        {m.isPromo && typeof m.salePrice === "number" ? <div className="text-[10px] text-muted-foreground line-through">{formatZAR(m.price)}</div> : null}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Star className="size-3 fill-warning text-warning" /> {m.rating}
                      </div>
                    </div>
                    {m.listingType === "product" && Array.isArray(m.galleryImages) && m.galleryImages.length > 0 ? (
                      <div className="mt-3 flex gap-2 overflow-x-auto">
                        {m.galleryImages.slice(0, 4).map((image: string, index: number) => (
                          <img key={`${m.id}-${index}`} src={image} alt={`${m.title} gallery ${index + 1}`} className="h-10 w-10 rounded-md border object-cover" />
                        ))}
                      </div>
                    ) : m.listingType === "service" ? (
                      <div className="mt-3 text-[11px] text-muted-foreground">Service banner ready for buyers.</div>
                    ) : null}
                    <div className="mt-3 flex items-center justify-between">
                      {cart[m.id] ? (
                        <>
                          <Button size="icon" variant="outline" className="size-7" onClick={() => dec(m.id)}><Minus className="size-3" /></Button>
                          <span className="text-sm font-medium w-5 text-center tabular-nums">{cart[m.id]}</span>
                          <Button size="icon" variant="outline" className="size-7" onClick={() => inc(m.id)}><Plus className="size-3" /></Button>
                        </>
                      ) : (
                        <Button size="sm" className="w-full" onClick={() => inc(m.id)}>Add to order</Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <aside className="card-soft p-5 h-fit sticky top-20">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-semibold flex items-center gap-2"><ShoppingBag className="size-4 text-brand" />Your order</h3>
                <Badge variant="outline" className="text-[10px]">{cartItems.length} item{cartItems.length !== 1 ? "s" : ""}</Badge>
              </div>
              {cartItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">Add items from the marketplace to start your order.</p>
              ) : (
                <>
                  <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                    {cartItems.map(item => (
                      <div key={item.id} className="flex items-start justify-between gap-2 text-sm border-b pb-2 last:border-0">
                        <div>
                          <div className="font-medium">{item.title}</div>
                          <div className="text-[11px] text-muted-foreground">{formatZAR(item.price)} × {item.qty}</div>
                        </div>
                        <div className="font-medium tabular-nums">{formatZAR(item.price * item.qty)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="border-t pt-3 mt-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-medium tabular-nums">{formatZAR(subtotal)}</span></div>
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
              <div className="mt-4 text-[11px] text-muted-foreground">Delivery for {branch} · standard 2–3 business days.</div>
            </aside>
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
