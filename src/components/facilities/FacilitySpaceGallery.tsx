import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Info,
  ImagePlus,
  Images,
  Pencil,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getSupabaseClient } from "@/lib/supabase";

type Branch = { id: string; name: string; slug: string };
type TenantRow = {
  id: string;
  branch_id: string;
  office_number: string | null;
  status: string;
  tier: string | null;
  desks: number | null;
  mrr_zar: number | null;
  since: string | null;
  lease_term: string | null;
  rental_end_date: string | null;
  office_size: number | null;
  office_details: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  next_escalation_date: string | null;
  organizations: { name?: string } | { name?: string }[] | null;
  companies: { name?: string } | { name?: string }[] | null;
};
type Photo = {
  id: string;
  object_path: string;
  source_filename: string;
  caption: string | null;
  sort_order: number;
  signedUrl: string | null;
};
type TourPhoto = {
  id: string;
  source_photo_id: string;
  object_path: string;
  sort_order: number;
};
type FacilitySpace = {
  id: string;
  branch_id: string;
  code: string;
  name: string;
  category: "office" | "meeting_room" | "communal" | "amenity";
  status: "occupied" | "vacant" | "shared" | "maintenance" | "needs_review";
  office_number: string | null;
  tenant_id: string | null;
  metadata: Record<string, unknown> | null;
  facility_space_photos: Photo[];
  facility_space_tour_photos: TourPhoto[];
};

const BUCKET = "facility-space-photos";
const TOUR_BUCKET = "facility-vacant-tour-photos";
const MAX_IMAGE_SIZE = 50 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const LEASE_EXPIRY_WARNING_DAYS = 30;

function leaseDateState(date: string | null) {
  if (!date) return null;
  const now = new Date();
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const daysUntilExpiry = Math.ceil(
    (new Date(`${date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) /
      (24 * 60 * 60 * 1000),
  );
  return {
    expired: date < today,
    expiringSoon: date >= today && daysUntilExpiry <= LEASE_EXPIRY_WARNING_DAYS,
    daysUntilExpiry,
    displayDate: new Date(`${date}T00:00:00`).toLocaleDateString("en-ZA"),
  };
}

function formatTenantDate(date: string | null) {
  return date ? new Date(`${date}T00:00:00`).toLocaleDateString("en-ZA") : "Not recorded";
}

function formatZar(amount: number | null) {
  return amount === null
    ? "Not recorded"
    : new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency: "ZAR",
        minimumFractionDigits: 2,
      }).format(amount);
}

function relatedName(value: TenantRow["organizations"] | TenantRow["companies"]) {
  const record = Array.isArray(value) ? value[0] : value;
  return record?.name?.trim() ?? "";
}

function safeFilename(filename: string) {
  return (
    filename
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(-120) || "space-photo"
  );
}

export function FacilitySpaceGallery({
  branches,
  branchFilter,
  search,
}: {
  branches: Branch[];
  branchFilter: string;
  search: string;
}) {
  const [spaces, setSpaces] = useState<FacilitySpace[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busySpaceId, setBusySpaceId] = useState<string | null>(null);
  const [editingSpace, setEditingSpace] = useState<FacilitySpace | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftStatus, setDraftStatus] = useState<FacilitySpace["status"]>("shared");
  const [draftTenantId, setDraftTenantId] = useState("");
  const [draftLeaseStartDate, setDraftLeaseStartDate] = useState("");
  const [draftRentalEndDate, setDraftRentalEndDate] = useState("");
  const [activePhoto, setActivePhoto] = useState<{ spaceId: string; index: number } | null>(null);
  const [tenantInfoSpace, setTenantInfoSpace] = useState<FacilitySpace | null>(null);
  const [vacancyConfirmationOpen, setVacancyConfirmationOpen] = useState(false);

  const scopedBranches = useMemo(
    () => branches.filter((branch) => branchFilter === "all" || branch.id === branchFilter),
    [branches, branchFilter],
  );
  const branchNames = useMemo(
    () => new Map(branches.map((branch) => [branch.id, branch.name])),
    [branches],
  );
  const tenantById = useMemo(
    () => new Map(tenants.map((tenant) => [tenant.id, tenant])),
    [tenants],
  );
  const tenantLabel = useCallback(
    (tenantId: string | null) => {
      if (!tenantId) return "";
      const tenant = tenantById.get(tenantId);
      if (!tenant) return "Tenant record unavailable";
      return relatedName(tenant.organizations) || relatedName(tenant.companies) || "Tenant";
    },
    [tenantById],
  );

  const loadSpaces = useCallback(async () => {
    if (scopedBranches.length === 0) {
      setSpaces([]);
      setTenants([]);
      setLoading(false);
      setError("");
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Workspace data is not configured.");
      setLoading(false);
      return;
    }

    setLoading(true);
    const branchIds = scopedBranches.map((branch) => branch.id);
    const [spaceResult, tenantResult] = await Promise.all([
      supabase
        .from("facility_spaces")
        .select(
          "id,branch_id,code,name,category,status,office_number,tenant_id,metadata,facility_space_photos(id,object_path,source_filename,caption,sort_order),facility_space_tour_photos(id,source_photo_id,object_path,sort_order)",
        )
        .in("branch_id", branchIds)
        .order("name"),
      supabase
        .from("tenants")
        .select(
          "id,branch_id,office_number,status,tier,desks,mrr_zar,since,lease_term,rental_end_date,office_size,office_details,primary_contact_name,primary_contact_email,next_escalation_date,organizations(name),companies(name)",
        )
        .in("branch_id", branchIds)
        .eq("status", "active"),
    ]);

    const failure = spaceResult.error ?? tenantResult.error;
    if (failure) {
      setError(failure.message);
      setSpaces([]);
      setTenants([]);
      setLoading(false);
      return;
    }

    const rows = (spaceResult.data ?? []) as FacilitySpace[];
    const photoPaths = [
      ...new Set(
        rows.flatMap((space) => space.facility_space_photos.map((photo) => photo.object_path)),
      ),
    ];
    const signedUrlByPath = new Map<string, string>();
    let signedUrlError = "";
    if (photoPaths.length > 0) {
      const { data: signedPhotos, error: signedError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(photoPaths, 60 * 60);
      if (signedError) {
        signedUrlError = signedError.message;
      } else {
        for (const photo of signedPhotos ?? []) {
          if (photo.path && photo.signedUrl) signedUrlByPath.set(photo.path, photo.signedUrl);
        }
        const missingSignedUrl = (signedPhotos ?? []).find((photo) => photo.error);
        if (missingSignedUrl?.error) signedUrlError = missingSignedUrl.error;
      }
    }

    setSpaces(
      rows.map((space) => ({
        ...space,
        facility_space_photos: [...space.facility_space_photos]
          .sort(
            (a, b) =>
              a.sort_order - b.sort_order || a.source_filename.localeCompare(b.source_filename),
          )
          .map((photo) => ({
            ...photo,
            signedUrl: signedUrlByPath.get(photo.object_path) ?? null,
          })),
      })),
    );
    setTenants((tenantResult.data ?? []) as TenantRow[]);
    setError(signedUrlError ? `Some facility photos could not be loaded: ${signedUrlError}` : "");
    setLoading(false);
  }, [scopedBranches]);

  useEffect(() => {
    void loadSpaces();
  }, [loadSpaces]);

  const unpublishTourPhoto = async (space: FacilitySpace, tourPhoto: TourPhoto) => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Workspace data is not configured.");
      return false;
    }

    const { error: storageError } = await supabase.storage
      .from(TOUR_BUCKET)
      .remove([tourPhoto.object_path]);
    if (storageError) {
      toast.error(`Could not remove the public tour photo: ${storageError.message}`);
      return false;
    }

    const { error: recordError } = await supabase
      .from("facility_space_tour_photos")
      .delete()
      .eq("id", tourPhoto.id)
      .eq("space_id", space.id);
    if (recordError) {
      toast.error(
        `Tour photo file was removed, but its listing could not be deleted: ${recordError.message}`,
      );
      return false;
    }
    return true;
  };

  const publishTourPhoto = async (space: FacilitySpace, photo: Photo) => {
    const branch = branches.find((item) => item.id === space.branch_id);
    const supabase = getSupabaseClient();
    if (!branch || !supabase) {
      toast.error(
        !branch ? "The space's branch could not be resolved." : "Workspace data is not configured.",
      );
      return false;
    }

    const { data: image, error: downloadError } = await supabase.storage
      .from(BUCKET)
      .download(photo.object_path);
    if (downloadError) {
      toast.error(`Could not open the private facility photo: ${downloadError.message}`);
      return false;
    }

    const objectPath = `${branch.slug}/${space.id}/${photo.id}-${safeFilename(photo.source_filename)}`;
    const { error: uploadError } = await supabase.storage
      .from(TOUR_BUCKET)
      .upload(objectPath, image, {
        contentType: image.type || "image/jpeg",
        upsert: false,
      });
    if (uploadError) {
      toast.error(`Could not publish the tour photo: ${uploadError.message}`);
      return false;
    }

    const { error: recordError } = await supabase.from("facility_space_tour_photos").insert({
      branch_id: space.branch_id,
      branch_slug: branch.slug,
      space_id: space.id,
      space_name: space.name,
      office_number: space.office_number,
      source_photo_id: photo.id,
      object_path: objectPath,
      sort_order: photo.sort_order,
    });
    if (recordError) {
      const { error: cleanupError } = await supabase.storage.from(TOUR_BUCKET).remove([objectPath]);
      if (cleanupError) {
        console.error("Could not clean up an unlisted public tour photo:", cleanupError.message);
      }
      toast.error(`Photo uploaded but could not be added to the tour: ${recordError.message}`);
      return false;
    }
    return true;
  };

  const visibleSpaces = useMemo(() => {
    const query = search.trim().toLowerCase();
    return spaces.filter((space) => {
      if (branchFilter !== "all" && space.branch_id !== branchFilter) return false;
      return (
        !query ||
        [
          space.name,
          space.code,
          space.office_number,
          space.category,
          tenantLabel(space.tenant_id),
          branchNames.get(space.branch_id),
        ].some((value) => value?.toLowerCase().includes(query))
      );
    });
  }, [branchFilter, branchNames, search, spaces, tenantLabel]);

  const openEdit = (space: FacilitySpace) => {
    setEditingSpace(space);
    setDraftName(space.name);
    setDraftStatus(space.status);
    setDraftTenantId(space.tenant_id ?? "");
    const tenant = tenantById.get(space.tenant_id ?? "");
    setDraftLeaseStartDate(tenant?.since ?? "");
    setDraftRentalEndDate(tenant?.rental_end_date ?? "");
  };

  const saveSpace = async (confirmedVacancy = false) => {
    if (!editingSpace) return;
    const name = draftName.trim();
    if (!name) {
      toast.error("Space name cannot be empty.");
      return;
    }
    if (
      draftStatus === "occupied" &&
      draftLeaseStartDate &&
      draftRentalEndDate &&
      draftLeaseStartDate > draftRentalEndDate
    ) {
      toast.error("The expiry or next renewal date must be on or after the lease start date.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Workspace data is not configured.");
      return;
    }
    const markingVacant = editingSpace.status === "occupied" && draftStatus === "vacant";
    if (markingVacant && !confirmedVacancy) {
      setVacancyConfirmationOpen(true);
      return;
    }

    setBusySpaceId(editingSpace.id);
    if (editingSpace.status === "vacant" && draftStatus !== "vacant") {
      for (const tourPhoto of editingSpace.facility_space_tour_photos) {
        const unpublished = await unpublishTourPhoto(editingSpace, tourPhoto);
        if (!unpublished) {
          setBusySpaceId(null);
          await loadSpaces();
          return;
        }
      }
    }

    if (draftStatus === "occupied" && draftTenantId) {
      const { error: leaseDateError } = await supabase
        .from("tenants")
        .update({
          since: draftLeaseStartDate || null,
          rental_end_date: draftRentalEndDate || null,
        })
        .eq("id", draftTenantId)
        .eq("branch_id", editingSpace.branch_id);
      if (leaseDateError) {
        setBusySpaceId(null);
        toast.error(`Could not update the tenant's lease expiry date: ${leaseDateError.message}`);
        return;
      }
    }

    const updateResult = markingVacant
      ? await supabase.rpc("mark_facility_space_vacant", {
          p_space_id: editingSpace.id,
          p_name: name,
        })
      : await supabase
          .from("facility_spaces")
          .update({
            name,
            status: draftStatus,
            tenant_id: draftStatus === "occupied" ? draftTenantId || null : null,
          })
          .eq("id", editingSpace.id);
    const updateError = updateResult.error;
    setBusySpaceId(null);
    if (updateError) {
      toast.error(`Could not update space: ${updateError.message}`);
      return;
    }
    toast.success("Facility space updated.");
    setVacancyConfirmationOpen(false);
    setEditingSpace(null);
    await loadSpaces();
  };

  const uploadPhotos = async (space: FacilitySpace, files: FileList | null) => {
    const selectedFiles = Array.from(files ?? []);
    if (!selectedFiles.length) return;
    const invalidFile = selectedFiles.find(
      (file) => !ALLOWED_IMAGE_TYPES.has(file.type) || file.size > MAX_IMAGE_SIZE,
    );
    if (invalidFile) {
      toast.error(`${invalidFile.name} must be a JPEG, PNG, or WebP under 50 MB.`);
      return;
    }

    const branch = branches.find((item) => item.id === space.branch_id);
    if (!branch) {
      toast.error("The space's branch could not be resolved.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Workspace data is not configured.");
      return;
    }

    setBusySpaceId(space.id);
    let addedCount = 0;
    for (const [index, file] of selectedFiles.entries()) {
      const objectPath = `${branch.slug}/${space.id}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(objectPath, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        setBusySpaceId(null);
        if (addedCount) await loadSpaces();
        toast.error(
          addedCount
            ? `${addedCount} photo${addedCount === 1 ? "" : "s"} added, but ${file.name} failed: ${uploadError.message}`
            : `Could not upload ${file.name}: ${uploadError.message}`,
        );
        return;
      }

      const { error: photoError } = await supabase.from("facility_space_photos").insert({
        branch_id: space.branch_id,
        space_id: space.id,
        object_path: objectPath,
        source_filename: file.name,
        sort_order: space.facility_space_photos.length + index,
      });
      if (photoError) {
        const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([objectPath]);
        if (cleanupError)
          console.error("Could not clean up an unlinked facility photo:", cleanupError.message);
        setBusySpaceId(null);
        if (addedCount) await loadSpaces();
        toast.error(
          addedCount
            ? `${addedCount} photo${addedCount === 1 ? "" : "s"} added, but ${file.name} could not be linked: ${photoError.message}`
            : `Photo uploaded but its record could not be saved: ${photoError.message}`,
        );
        return;
      }
      addedCount += 1;
    }
    setBusySpaceId(null);
    toast.success(`${selectedFiles.length} photo${selectedFiles.length === 1 ? "" : "s"} added.`);
    await loadSpaces();
  };

  const removePhoto = async (photo: Photo) => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Workspace data is not configured.");
      return;
    }
    const space = spaces.find((item) =>
      item.facility_space_photos.some((facilityPhoto) => facilityPhoto.id === photo.id),
    );
    const publishedPhoto = space?.facility_space_tour_photos.find(
      (tourPhoto) => tourPhoto.source_photo_id === photo.id,
    );
    if (space && publishedPhoto) {
      const unpublished = await unpublishTourPhoto(space, publishedPhoto);
      if (!unpublished) return;
    }
    const { error: removeError } = await supabase.storage.from(BUCKET).remove([photo.object_path]);
    if (removeError) {
      toast.error(`Could not remove photo file: ${removeError.message}`);
      return;
    }
    const { error: recordError } = await supabase
      .from("facility_space_photos")
      .delete()
      .eq("id", photo.id);
    if (recordError) {
      toast.error(
        `Photo file was removed, but its record could not be deleted: ${recordError.message}`,
      );
      await loadSpaces();
      return;
    }
    toast.success("Photo removed.");
    setActivePhoto(null);
    await loadSpaces();
  };

  const toggleTourPhoto = async (space: FacilitySpace, photo: Photo) => {
    if (space.status !== "vacant" || space.category !== "office") {
      toast.error("Only photos of vacant offices can be added to the public tour.");
      return;
    }
    setBusySpaceId(space.id);
    const publishedPhoto = space.facility_space_tour_photos.find(
      (tourPhoto) => tourPhoto.source_photo_id === photo.id,
    );
    const success = publishedPhoto
      ? await unpublishTourPhoto(space, publishedPhoto)
      : await publishTourPhoto(space, photo);
    setBusySpaceId(null);
    if (!success) return;
    toast.success(
      publishedPhoto
        ? "Photo removed from the vacant-office tour."
        : "Photo added to the vacant-office tour.",
    );
    await loadSpaces();
  };

  const beginVacancyUpdate = (space: FacilitySpace) => {
    setEditingSpace(space);
    setDraftName(space.name);
    setDraftStatus("vacant");
    setDraftTenantId("");
    setDraftLeaseStartDate("");
    setDraftRentalEndDate("");
    setVacancyConfirmationOpen(true);
  };

  const activeSpace = activePhoto
    ? (visibleSpaces.find((space) => space.id === activePhoto.spaceId) ?? null)
    : null;
  const activePhotoRecord = activeSpace?.facility_space_photos[activePhoto?.index ?? -1] ?? null;
  const tenantInfo = tenantInfoSpace
    ? tenantById.get(tenantInfoSpace.tenant_id ?? "") ?? null
    : null;

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">Spaces &amp; photo galleries</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Lease dates are informational. Confirm renewals before manually marking a space vacant;
            only photos explicitly added to the tour are public.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadSpaces()}
          disabled={loading}
          aria-label="Refresh facility spaces"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Loading facility spaces and photos…
        </p>
      ) : visibleSpaces.length === 0 ? (
        <div className="grid justify-items-center gap-2 rounded-md border border-dashed p-8 text-center">
          <Images className="size-7 text-muted-foreground/60" />
          <p className="text-sm font-medium">No facility spaces found</p>
          <p className="text-xs text-muted-foreground">
            Apply the facility gallery migration and import the Kyalami source folders to populate
            this view.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleSpaces.map((space) => {
            const cover = space.facility_space_photos.find((photo) => photo.signedUrl);
            const sourceConflicts = space.metadata?.source_conflicts;
            const hasSourceConflict = Array.isArray(sourceConflicts) && sourceConflicts.length > 0;
            return (
              <article key={space.id} className="overflow-hidden rounded-lg border bg-background">
                <button
                  type="button"
                  className="group relative block aspect-[16/10] w-full overflow-hidden bg-muted text-left"
                  onClick={() =>
                    cover &&
                    setActivePhoto({
                      spaceId: space.id,
                      index: space.facility_space_photos.indexOf(cover),
                    })
                  }
                  disabled={!cover}
                  aria-label={
                    cover ? `View photos of ${space.name}` : `No photos available for ${space.name}`
                  }
                >
                  {cover?.signedUrl ? (
                    <img
                      src={cover.signedUrl}
                      alt={`${space.name} facility`}
                      loading="lazy"
                      className="size-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <span className="grid size-full place-items-center text-muted-foreground">
                      <Images className="size-8" />
                    </span>
                  )}
                  <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2.5 py-1 text-xs text-white">
                    {space.facility_space_photos.length} photos
                  </span>
                </button>
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-medium">{space.name}</h3>
                      <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                        {space.category.replaceAll("_", " ")}
                        {space.office_number ? ` · Office ${space.office_number}` : ""}
                        {branches.length > 1
                          ? ` · ${branchNames.get(space.branch_id) ?? "Branch"}`
                          : ""}
                      </p>
                    </div>
                    <Badge
                      variant={
                        space.status === "needs_review"
                          ? "destructive"
                          : space.status === "occupied"
                            ? "secondary"
                            : "default"
                      }
                    >
                      {space.status.replaceAll("_", " ")}
                    </Badge>
                  </div>
                  {space.status === "occupied" ? (
                    <div className="space-y-1">
                      <p className="truncate text-sm text-muted-foreground">
                        Tenant: {tenantLabel(space.tenant_id) || "Not linked"}
                      </p>
                      {(() => {
                        const tenant = tenantById.get(space.tenant_id ?? "");
                        const lease = leaseDateState(tenant?.rental_end_date ?? null);
                        return (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                            <span className="text-muted-foreground">
                              Lease start: {formatTenantDate(tenant?.since ?? null)}
                            </span>
                            <span className="text-muted-foreground">
                              Expiry / renewal: {lease?.displayDate ?? "Not recorded"}
                            </span>
                            {lease?.expired ? (
                              <Badge variant="destructive">Expired · check renewal</Badge>
                            ) : lease?.expiringSoon ? (
                              <Badge variant="secondary">
                                Expires in {lease.daysUntilExpiry} day
                                {lease.daysUntilExpiry === 1 ? "" : "s"}
                              </Badge>
                            ) : null}
                          </div>
                        );
                      })()}
                    </div>
                  ) : null}
                  {hasSourceConflict ? (
                    <p className="flex gap-2 rounded-md bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">
                      <AlertTriangle className="size-4 shrink-0" />
                      Occupied and vacant source folders conflict; review the imported photo
                      selection.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {space.category === "office" && space.status === "vacant" ? (
                      <Badge variant="outline">
                        {space.facility_space_tour_photos.length} tour photo
                        {space.facility_space_tour_photos.length === 1 ? "" : "s"}
                      </Badge>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(space)}
                      disabled={busySpaceId === space.id}
                    >
                      <Pencil className="mr-1.5 size-3.5" /> Edit space
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        document.getElementById(`facility-upload-${space.id}`)?.click()
                      }
                      disabled={busySpaceId === space.id}
                    >
                      <ImagePlus className="mr-1.5 size-3.5" />
                      {busySpaceId === space.id ? "Uploading…" : "Add photos"}
                    </Button>
                    {space.status === "occupied" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setTenantInfoSpace(space)}
                        aria-label={`Tenant info for ${space.name}`}
                      >
                        <Info className="mr-1.5 size-3.5" /> Info
                      </Button>
                    ) : null}
                    {space.status === "occupied" &&
                    leaseDateState(tenantById.get(space.tenant_id ?? "")?.rental_end_date ?? null)
                      ?.expired ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => beginVacancyUpdate(space)}
                        disabled={busySpaceId === space.id}
                      >
                        Mark vacant
                      </Button>
                    ) : null}
                    <input
                      id={`facility-upload-${space.id}`}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="hidden"
                      onChange={(event) => {
                        void uploadPhotos(space, event.currentTarget.files);
                        event.currentTarget.value = "";
                      }}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog
        open={editingSpace !== null}
        onOpenChange={(open) => {
          if (!open) setEditingSpace(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit facility space</DialogTitle>
          </DialogHeader>
          {editingSpace ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="facility-space-name" className="text-sm font-medium">
                  Space name
                </label>
                <Input
                  id="facility-space-name"
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="facility-space-status" className="text-sm font-medium">
                  Occupancy / status
                </label>
                <select
                  id="facility-space-status"
                  value={draftStatus}
                  onChange={(event) =>
                    setDraftStatus(event.target.value as FacilitySpace["status"])
                  }
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="occupied">Occupied</option>
                  <option value="vacant">Vacant</option>
                  <option value="shared">Shared / communal</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="needs_review">Needs review</option>
                </select>
              </div>
              {draftStatus === "occupied" ? (
                <div className="space-y-1.5">
                  <label htmlFor="facility-space-tenant" className="text-sm font-medium">
                    Current tenant
                  </label>
                  <select
                    id="facility-space-tenant"
                    value={draftTenantId}
                    onChange={(event) => {
                      const tenantId = event.target.value;
                      setDraftTenantId(tenantId);
                      const tenant = tenantById.get(tenantId);
                      setDraftLeaseStartDate(tenant?.since ?? "");
                      setDraftRentalEndDate(tenant?.rental_end_date ?? "");
                    }}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="">Select a tenant</option>
                    {tenants
                      .filter((tenant) => tenant.branch_id === editingSpace.branch_id)
                      .map((tenant) => (
                        <option key={tenant.id} value={tenant.id}>
                          {relatedName(tenant.organizations) ||
                            relatedName(tenant.companies) ||
                            "Tenant"}
                          {tenant.office_number ? ` · Office ${tenant.office_number}` : ""}
                        </option>
                      ))}
                  </select>
                </div>
              ) : null}
              {draftStatus === "occupied" && draftTenantId ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label htmlFor="facility-space-lease-start" className="text-sm font-medium">
                      Lease start date
                    </label>
                    <Input
                      id="facility-space-lease-start"
                      type="date"
                      value={draftLeaseStartDate}
                      onChange={(event) => setDraftLeaseStartDate(event.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="facility-space-lease-expiry" className="text-sm font-medium">
                      Expiry / next renewal date
                    </label>
                    <Input
                      id="facility-space-lease-expiry"
                      type="date"
                      value={draftRentalEndDate}
                      onChange={(event) => setDraftRentalEndDate(event.target.value)}
                    />
                  </div>
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingSpace(null)}>
                  Cancel
                </Button>
                <Button onClick={() => void saveSpace()} disabled={busySpaceId === editingSpace.id}>
                  Save changes
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={vacancyConfirmationOpen}
        onOpenChange={(open) => {
          setVacancyConfirmationOpen(open);
          if (!open && editingSpace?.status === "occupied") setDraftStatus("occupied");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm this office is vacant?</AlertDialogTitle>
            <AlertDialogDescription>
              This does not happen automatically when a lease expires. Confirm the tenant has not
              renewed before continuing. The space will be marked vacant and its active tenant
              record will be marked ended.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busySpaceId !== null}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!editingSpace || busySpaceId === editingSpace.id}
              onClick={(event) => {
                event.preventDefault();
                void saveSpace(true);
              }}
            >
              Confirm vacancy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={tenantInfoSpace !== null}
        onOpenChange={(open) => {
          if (!open) setTenantInfoSpace(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Current tenant info</DialogTitle>
          </DialogHeader>
          {tenantInfoSpace ? (
            tenantInfo ? (
              <div className="space-y-4">
                <div>
                  <p className="font-display text-lg font-semibold">
                    {relatedName(tenantInfo.organizations) ||
                      relatedName(tenantInfo.companies) ||
                      "Tenant"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {branchNames.get(tenantInfo.branch_id) ?? "Branch"} · Office{" "}
                    {tenantInfo.office_number ?? tenantInfoSpace.office_number ?? "not assigned"}
                  </p>
                </div>
                <dl className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["Lease status", tenantInfo.status],
                    ["Monthly rent", formatZar(tenantInfo.mrr_zar)],
                    ["Lease start date", formatTenantDate(tenantInfo.since)],
                    ["Lease term", tenantInfo.lease_term || "Not recorded"],
                    ["Expiry / next renewal date", formatTenantDate(tenantInfo.rental_end_date)],
                    ["Next rent escalation", formatTenantDate(tenantInfo.next_escalation_date)],
                    ["Primary contact", tenantInfo.primary_contact_name || "Not recorded"],
                    ["Contact email", tenantInfo.primary_contact_email || "Not recorded"],
                    [
                      "Office size",
                      tenantInfo.office_size === null
                        ? "Not recorded"
                        : String(tenantInfo.office_size),
                    ],
                    [
                      "Desks",
                      tenantInfo.desks === null ? "Not recorded" : String(tenantInfo.desks),
                    ],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-md border bg-muted/20 p-3">
                      <dt className="text-xs text-muted-foreground">{label}</dt>
                      <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
                {tenantInfo.office_details ? (
                  <div className="rounded-md border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Office details</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{tenantInfo.office_details}</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No active tenant record is linked to this office.
              </p>
            )
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={activePhoto !== null}
        onOpenChange={(open) => {
          if (!open) setActivePhoto(null);
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{activeSpace?.name ?? "Facility photos"}</DialogTitle>
          </DialogHeader>
          {activePhotoRecord ? (
            <div className="space-y-3">
              <div className="relative grid min-h-64 place-items-center overflow-hidden rounded-md bg-black">
                {activePhotoRecord.signedUrl ? (
                  <img
                    src={activePhotoRecord.signedUrl}
                    alt={activePhotoRecord.caption || activePhotoRecord.source_filename}
                    className="max-h-[70vh] max-w-full object-contain"
                  />
                ) : (
                  <p className="p-8 text-sm text-white">This photo could not be opened.</p>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 truncate text-xs text-muted-foreground">
                  {activePhotoRecord.caption || activePhotoRecord.source_filename}
                  {" · "}
                  {(activePhoto?.index ?? 0) + 1} of{" "}
                  {activeSpace?.facility_space_photos.length ?? 0}
                </p>
                <div className="flex gap-2">
                  {activeSpace?.category === "office" && activeSpace.status === "vacant" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busySpaceId === activeSpace.id}
                      onClick={() =>
                        activePhotoRecord && void toggleTourPhoto(activeSpace, activePhotoRecord)
                      }
                    >
                      <CircleCheck className="mr-1.5 size-4" />
                      {activeSpace.facility_space_tour_photos.some(
                        (photo) => photo.source_photo_id === activePhotoRecord.id,
                      )
                        ? "Remove from tour"
                        : "Add to tour"}
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="Previous facility photo"
                    disabled={!activePhoto || activePhoto.index === 0}
                    onClick={() =>
                      setActivePhoto(
                        (current) => current && { ...current, index: current.index - 1 },
                      )
                    }
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="Next facility photo"
                    disabled={
                      !activePhoto ||
                      activePhoto.index >= (activeSpace?.facility_space_photos.length ?? 1) - 1
                    }
                    onClick={() =>
                      setActivePhoto(
                        (current) => current && { ...current, index: current.index + 1 },
                      )
                    }
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void removePhoto(activePhotoRecord)}
                    aria-label="Remove current facility photo"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setActivePhoto(null)}
                    aria-label="Close photo viewer"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
