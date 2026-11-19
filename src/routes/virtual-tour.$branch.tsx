import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { VirtualTour } from "@/components/VirtualTour";
import { releaseTourOrientation, requestTourLandscape } from "@/lib/tour-orientation";
import { tours } from "@/lib/tours";

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
      tour={tour}
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
