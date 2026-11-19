import { ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { tours, type Tour } from "@/lib/tours";

export function VirtualTourSelector({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (tourId: Tour["id"]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl border-white/10 bg-zinc-950 p-5 text-white sm:p-8">
        <DialogHeader className="mb-2">
          <DialogTitle className="font-display text-2xl">Choose a virtual tour</DialogTitle>
          <DialogDescription className="text-white/65">
            Select a location to explore its spaces.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {[tours.rosebank, tours.kyalami, tours["union-station"]].map((tour) => (
            <button
              key={tour.id}
              type="button"
              onClick={() => onSelect(tour.id)}
              aria-label={`Open ${tour.branchName} virtual tour`}
              className="group overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] text-left transition duration-300 hover:-translate-y-1 hover:border-white/30 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <div className="relative aspect-[4/3] overflow-hidden">
                <img
                  src={tour.coverImage}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="size-full object-cover transition duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                <span className="absolute bottom-3 left-4 font-display text-xl font-semibold">
                  {tour.branchName}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 p-4">
                <span className="text-sm leading-relaxed text-white/65">{tour.tagline}</span>
                <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-1" />
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
