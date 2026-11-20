import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { VirtualTour } from "@/components/VirtualTour";
import { releaseTourOrientation, requestTourLandscape } from "@/lib/tour-orientation";
import { tours, type Tour, type TourSpace } from "@/lib/tours";
import { getSupabaseClient } from "@/lib/supabase";
import { toast } from "sonner";

type PublishedTourPhoto = {
  space_id: string;
  space_name: string;
  office_number: string | null;
  object_path: string;
  sort_order: number;
};

export const Route = createFileRoute("/virtual-tour/$branch")({
  head: () => ({
    meta: [{ title: "Virtual Tour — Office & Co" }],
  }),
  component: VirtualTourPage,
});

function VirtualTourPage() {
  const { branch } = Route.useParams();
  const navigate = useNavigate();
  const tour = Object.values(tours).find((candidate) => candidate.id === branch) ?? null;
  const [vacantSpaces, setVacantSpaces] = useState<TourSpace[]>([]);

  useEffect(() => {
    if (branch !== "kyalami") {
      setVacantSpaces([]);
      return;
    }
    setVacantSpaces([]);

    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Vacant office tour photos could not be loaded.");
      return;
    }

    let cancelled = false;
    void supabase
      .from("facility_space_tour_photos")
      .select("space_id,space_name,office_number,object_path,sort_order")
      .eq("branch_slug", branch)
      .order("sort_order")
      .order("created_at")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          toast.error(`Vacant office tour photos could not be loaded: ${error.message}`);
          return;
        }

        const photos = (data ?? []) as PublishedTourPhoto[];
        const grouped = new Map<
          string,
          { name: string; office: string | null; photos: string[] }
        >();
        for (const photo of photos) {
          const item = grouped.get(photo.space_id) ?? {
            name: photo.space_name,
            office: photo.office_number,
            photos: [],
          };
          item.photos.push(
            supabase.storage.from("facility-vacant-tour-photos").getPublicUrl(photo.object_path)
              .data.publicUrl,
          );
          grouped.set(photo.space_id, item);
        }

        setVacantSpaces(
          [...grouped.entries()].map(([spaceId, item]) => ({
            id: `kyalami-facility-${spaceId}`,
            name: item.office ? `Vacant Office ${item.office}` : item.name,
            category: "office",
            description: "Explore this currently available Kyalami office.",
            image: item.photos[0],
            images: item.photos,
          })),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [branch]);

  const tourWithVacantSpaces = useMemo<Tour | null>(
    () =>
      tour && vacantSpaces.length ? { ...tour, spaces: [...tour.spaces, ...vacantSpaces] } : tour,
    [tour, vacantSpaces],
  );

  useEffect(() => {
    requestTourLandscape();
    return () => releaseTourOrientation();
  }, [branch]);

  if (!tour) {
    return (
      <main className="grid min-h-svh place-items-center bg-zinc-950 px-6 text-center text-white">
        <div>
          <BrandLogo className="mx-auto h-auto w-28" />
          <h1 className="mt-6 font-display text-2xl font-semibold">Virtual tour not found</h1>
          <p className="mt-2 text-sm text-white/65">Choose a branch to start a tour.</p>
          <Link to="/welcome" className="mt-6 inline-block text-sm underline underline-offset-4">
            Back to Office &amp; Co
          </Link>
        </div>
      </main>
    );
  }

  return (
    <VirtualTour
      tour={tourWithVacantSpaces}
      open
      mode="page"
      onOpenChange={(open) => {
        if (!open) void navigate({ to: "/welcome" });
      }}
      onRequestTour={(tourId) => {
        if (tourId === "union-station") {
          void navigate({ to: "/union-station" });
          return;
        }
        void navigate({ to: "/tour-request", search: { branch: tourId } });
      }}
    />
  );
}
