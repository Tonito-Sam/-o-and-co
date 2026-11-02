import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSupabaseClient } from "@/lib/supabase";
import { useRole } from "@/lib/role-context";
import { formatZAR } from "@/lib/mock";
import { LoaderCircle, PackageOpen, Plus, RefreshCw, Star } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/marketplace")({
  head: () => ({ meta: [{ title: "Marketplace — WorkspaceOS" }] }),
  component: Marketplace,
});

type MarketplaceListing = {
  id: string;
  seller_id: string | null;
  seller_name: string | null;
  title: string;
  category: string | null;
  listing_type: string;
  price_zar: number | null;
  description: string | null;
  image_url: string | null;
  rating: number | string | null;
  is_active: boolean;
  created_at: string;
};

type ListingDraft = {
  title: string;
  category: string;
  listing_type: string;
  price: string;
  description: string;
  image_url: string;
};

const emptyDraft: ListingDraft = {
  title: "",
  category: "",
  listing_type: "product",
  price: "",
  description: "",
  image_url: "",
};

export function Marketplace() {
  const { role } = useRole();
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [tab, setTab] = useState("browse");
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ListingDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadListings = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Marketplace listings are unavailable because Supabase is not configured.");
      setLoading(false);
      return;
    }

    setLoading(true);
    const [{ data: userData, error: userError }, { data, error: queryError }] = await Promise.all([
      supabase.auth.getUser(),
      supabase
        .from("marketplace_listings")
        .select(
          "id,seller_id,seller_name,title,category,listing_type,price_zar,description,image_url,rating,is_active,created_at",
        )
        .order("created_at", { ascending: false }),
    ]);
    setUserId(userError ? null : (userData.user?.id ?? null));
    if (userError) {
      setError(userError.message);
      setListings([]);
    } else if (queryError) {
      setError(queryError.message);
      setListings([]);
    } else {
      setListings((data ?? []) as MarketplaceListing[]);
      setError("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  const categories = useMemo(
    () => [
      "All",
      ...new Set(
        listings
          .filter((item) => item.is_active)
          .map((item) => item.category)
          .filter((value): value is string => Boolean(value)),
      ),
    ],
    [listings],
  );
  const visibleListings = useMemo(
    () =>
      listings.filter((item) => {
        const isMine = Boolean(userId && item.seller_id === userId);
        const inCurrentTab = tab === "mine" ? isMine : item.is_active;
        const inCategory = category === "All" || item.category === category;
        const searchTarget =
          `${item.title} ${item.category ?? ""} ${item.seller_name ?? ""} ${item.description ?? ""}`.toLowerCase();
        return inCurrentTab && inCategory && searchTarget.includes(search.trim().toLowerCase());
      }),
    [category, listings, search, tab, userId],
  );
  const activeCount = listings.filter((item) => item.is_active).length;
  const myListings = listings.filter((item) => userId && item.seller_id === userId);

  const startNewListing = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setDialogOpen(true);
  };

  const startEditListing = (item: MarketplaceListing) => {
    setEditingId(item.id);
    setDraft({
      title: item.title,
      category: item.category ?? "",
      listing_type: item.listing_type,
      price: item.price_zar === null ? "" : String(item.price_zar),
      description: item.description ?? "",
      image_url: item.image_url ?? "",
    });
    setDialogOpen(true);
  };

  const saveListing = async () => {
    const price = Number(draft.price);
    if (!draft.title.trim() || !draft.category.trim() || !Number.isInteger(price) || price < 0) {
      toast.error("Enter a title, category, and valid whole-number price.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      toast.error(userError?.message ?? "Sign in to publish a listing.");
      return;
    }

    setSaving(true);
    const payload = {
      seller_id: userData.user.id,
      seller_name: role.user,
      title: draft.title.trim(),
      category: draft.category.trim(),
      listing_type: draft.listing_type,
      price_zar: price,
      description: draft.description.trim() || null,
      image_url: draft.image_url.trim() || null,
      is_active: true,
    };
    const result = editingId
      ? await supabase
          .from("marketplace_listings")
          .update(payload)
          .eq("id", editingId)
          .select(
            "id,seller_id,seller_name,title,category,listing_type,price_zar,description,image_url,rating,is_active,created_at",
          )
          .single()
      : await supabase
          .from("marketplace_listings")
          .insert({ ...payload, rating: 0 })
          .select(
            "id,seller_id,seller_name,title,category,listing_type,price_zar,description,image_url,rating,is_active,created_at",
          )
          .single();
    setSaving(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }

    const saved = result.data as MarketplaceListing;
    setListings((current) =>
      editingId
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [saved, ...current],
    );
    setCategory("All");
    setSearch("");
    setTab("mine");
    setDialogOpen(false);
    setEditingId(null);
    setDraft(emptyDraft);
    toast.success(editingId ? "Listing updated." : "Listing published.");
  };

  const setListingActive = async (item: MarketplaceListing, isActive: boolean) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error: updateError } = await supabase
      .from("marketplace_listings")
      .update({ is_active: isActive })
      .eq("id", item.id)
      .eq("seller_id", userId);
    if (updateError) {
      toast.error(updateError.message);
      return;
    }
    setListings((current) =>
      current.map((row) => (row.id === item.id ? { ...row, is_active: isActive } : row)),
    );
    toast.success(isActive ? "Listing republished." : "Listing unpublished.");
  };

  const openDialog = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingId(null);
      setDraft(emptyDraft);
    }
  };

  return (
    <div className="mx-auto max-w-350 space-y-5">
      <PageHeader
        eyebrow="Marketplace"
        title="Marketplace listings"
        description="Browse active community listings or manage items published from your account."
        actions={
          userId ? (
            <Dialog open={dialogOpen} onOpenChange={openDialog}>
              <Button size="sm" className="gap-1.5" onClick={startNewListing}>
                <Plus className="size-4" />
                Create listing
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingId ? "Edit listing" : "Create listing"}</DialogTitle>
                  <DialogDescription>
                    Changes are saved to the shared marketplace catalog.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="listing-title">Title</Label>
                    <Input
                      id="listing-title"
                      value={draft.title}
                      onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                      required
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="listing-category">Category</Label>
                      <Input
                        id="listing-category"
                        value={draft.category}
                        onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="listing-price">Price (ZAR)</Label>
                      <Input
                        id="listing-price"
                        type="number"
                        min="0"
                        step="1"
                        value={draft.price}
                        onChange={(event) => setDraft({ ...draft, price: event.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="listing-type">Listing type</Label>
                    <Select
                      value={draft.listing_type}
                      onValueChange={(listing_type) => setDraft({ ...draft, listing_type })}
                    >
                      <SelectTrigger id="listing-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="product">Product</SelectItem>
                        <SelectItem value="service">Service</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="listing-description">Description</Label>
                    <Textarea
                      id="listing-description"
                      rows={3}
                      value={draft.description}
                      onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="listing-image">Image URL</Label>
                    <Input
                      id="listing-image"
                      type="url"
                      value={draft.image_url}
                      onChange={(event) => setDraft({ ...draft, image_url: event.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => openDialog(false)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button type="button" onClick={() => void saveListing()} disabled={saving}>
                    {saving ? "Saving…" : editingId ? "Save listing" : "Publish listing"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Active listings" value={loading ? "—" : String(activeCount)} />
        <StatCard
          label="Your listings"
          value={loading ? "—" : String(myListings.length)}
          accent="brand"
        />
        <StatCard label="Categories" value={loading ? "—" : String(categories.length - 1)} />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          Marketplace unavailable: {error}
        </p>
      )}

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="browse">Browse</TabsTrigger>
            {userId && <TabsTrigger value="mine">My listings</TabsTrigger>}
          </TabsList>
          <div className="flex flex-wrap gap-2">
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-44" aria-label="Filter by category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search listings"
              className="w-48"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => void loadListings()}
              disabled={loading}
              aria-label="Refresh listings"
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <TabsContent value="browse">
          <ListingGrid
            items={visibleListings}
            loading={loading}
            isOwner={false}
            onEdit={startEditListing}
            onToggleActive={(item) => void setListingActive(item, !item.is_active)}
          />
        </TabsContent>
        <TabsContent value="mine">
          <ListingGrid
            items={visibleListings}
            loading={loading}
            isOwner
            onEdit={startEditListing}
            onToggleActive={(item) => void setListingActive(item, !item.is_active)}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ListingGrid({
  items,
  loading,
  isOwner,
  onEdit,
  onToggleActive,
}: {
  items: MarketplaceListing[];
  loading: boolean;
  isOwner: boolean;
  onEdit: (item: MarketplaceListing) => void;
  onToggleActive: (item: MarketplaceListing) => void;
}) {
  if (loading)
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        Loading listings
      </div>
    );
  if (items.length === 0)
    return (
      <div className="grid justify-items-center gap-2 border-y py-16 text-center">
        <PackageOpen className="size-8 text-muted-foreground/60" />
        <p className="text-sm font-medium">No listings found</p>
        <p className="text-xs text-muted-foreground">
          Listings will appear here when they are published.
        </p>
      </div>
    );

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const rating = Number(item.rating ?? 0);
        return (
          <article key={item.id} className="card-soft overflow-hidden">
            <div className="grid h-40 place-items-center bg-muted">
              {item.image_url ? (
                <img src={item.image_url} alt={item.title} className="h-full w-full object-cover" />
              ) : (
                <PackageOpen className="size-9 text-muted-foreground/60" />
              )}
            </div>
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                {item.category && (
                  <Badge variant="outline" className="text-[10px]">
                    {item.category}
                  </Badge>
                )}
                <Badge variant="secondary" className="text-[10px]">
                  {item.listing_type}
                </Badge>
                {!item.is_active && (
                  <Badge variant="outline" className="text-[10px]">
                    Unpublished
                  </Badge>
                )}
              </div>
              <div>
                <h2 className="text-sm font-semibold">{item.title}</h2>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {item.seller_name || "Seller name not provided"}
                </p>
              </div>
              {item.description && (
                <p className="line-clamp-3 text-xs text-muted-foreground">{item.description}</p>
              )}
              <div className="flex items-center justify-between border-t pt-3">
                <span className="font-display text-lg font-semibold tabular-nums">
                  {formatZAR(Number(item.price_zar ?? 0))}
                </span>
                {rating > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Star className="size-3 fill-warning text-warning" />
                    {rating.toFixed(1)}
                  </span>
                )}
              </div>
              {isOwner && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => onEdit(item)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onToggleActive(item)}>
                    {item.is_active ? "Unpublish" : "Republish"}
                  </Button>
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
