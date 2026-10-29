// src/components/VirtualTour.tsx
import { useCallback, useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Play, Pause, MapPin, ArrowRight, Compass } from "lucide-react";
import type { Tour } from "@/lib/tours";
import { PannellumViewer, type PannellumHotspot } from "@/components/PannellumViewer";

const EMPTY_SPACES: Tour["spaces"] = [];

export function VirtualTour({
  tour,
  open,
  onOpenChange,
  onRequestTour,
}: {
  tour: Tour | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestTour: (tourId: Tour["id"]) => void;
}) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showHotspots, setShowHotspots] = useState(true);

  const spaces = tour?.spaces ?? EMPTY_SPACES;
  const space = spaces[idx];

  // Reset on open
  useEffect(() => {
    if (open) {
      setIdx(0);
      setPlaying(false);
      setShowHotspots(true);
    }
  }, [open, tour?.id]);

  // Autoplay — respects current space's panorama vs image
  useEffect(() => {
    if (!open || !playing || spaces.length < 2) return;
    const t = window.setInterval(
      () => setIdx((i) => (i + 1) % spaces.length),
      7000, // slightly longer for panoramas
    );
    return () => window.clearInterval(t);
  }, [open, playing, spaces.length]);

  // Keyboard
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIdx((i) => (i + 1) % spaces.length);
      if (e.key === "ArrowLeft") setIdx((i) => (i - 1 + spaces.length) % spaces.length);
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, spaces.length]);

  const goToSpace = useCallback((id: string) => {
    const i = spaces.findIndex((s) => s.id === id);
    if (i >= 0) setIdx(i);
  }, [spaces]);

  // Pannellum hotspots for the current space
  const pannellumHotspots: PannellumHotspot[] = useMemo(() => {
    if (!space?.panorama || !showHotspots) return [];
    return (space.hotspots ?? []).map((h) => ({
      id: `${space.id}-${h.label}`,
      pitch: h.pitch ?? (h.y - 50) * 0.6, // map 0..100% → -30..30 pitch
      yaw: h.yaw ?? (h.x - 50) * 2.4,     // map 0..100% → -120..120 yaw
      text: h.label,
      cssClass: "tour-hotspot",
      clickHandler: () => h.toSpaceId && goToSpace(h.toSpaceId),
    }));
  }, [space, showHotspots, goToSpace]);

  if (!tour || !space) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl p-0 overflow-hidden bg-black border-none">
        <div className="grid md:grid-cols-[1fr_320px] h-[85vh] max-h-[760px]">
          {/* ---- Stage ---- */}
          <div className="relative bg-black">
            {space.panorama ? (
              <PannellumViewer
                key={space.id}
                image={space.panorama}
                hfov={100}
                autoRotate={playing ? 1.5 : 0}
                showControls
                compass
                hotspots={pannellumHotspots}
                className="absolute inset-0"
              />
            ) : (
              <>
                <AnimatePresence mode="wait">
                  <motion.img
                    key={space.id}
                    src={space.image}
                    alt={space.name}
                    initial={{ opacity: 0, scale: 1.04 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                </AnimatePresence>

                {showHotspots &&
                  space.hotspots?.map((h, i) => (
                    <button
                      key={i}
                      onClick={() => h.toSpaceId && goToSpace(h.toSpaceId)}
                      className="tour-stage-hotspot absolute -translate-x-1/2 -translate-y-1/2 group"
                      style={{ left: `${h.x}%`, top: `${h.y}%` }}
                      aria-label={h.label}
                    >
                      <span className="grid size-9 place-items-center rounded-full bg-white/90 text-black shadow-lg ring-4 ring-white/30 group-hover:scale-110 transition">
                        <MapPin className="size-4" />
                      </span>
                      <span className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition">
                        {h.label}
                      </span>
                    </button>
                  ))}
              </>
            )}

            {/* Shared chrome: prev/next, room label, play/pause, hotspot toggle */}
            <button
              onClick={() => setIdx((i) => (i - 1 + spaces.length) % spaces.length)}
              className="absolute left-3 top-1/2 -translate-y-1/2 z-20 grid size-11 place-items-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70"
              aria-label="Previous space"
            >
              <ChevronLeft />
            </button>
            <button
              onClick={() => setIdx((i) => (i + 1) % spaces.length)}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-20 grid size-11 place-items-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70"
              aria-label="Next space"
            >
              <ChevronRight />
            </button>

            <div className="absolute left-4 top-4 z-20 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur flex items-center gap-1.5">
              {space.panorama && <Compass className="size-3" />}
              {tour.branchName} · {space.name}
            </div>

            <div className="absolute right-4 top-4 z-20 flex gap-2">
              <button
                onClick={() => setPlaying((p) => !p)}
                className="grid size-9 place-items-center rounded-full bg-black/60 text-white backdrop-blur"
                aria-label={playing ? "Pause tour" : "Play tour"}
              >
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </button>
              <button
                onClick={() => setShowHotspots((s) => !s)}
                className="grid size-9 place-items-center rounded-full bg-black/60 text-white backdrop-blur"
                aria-label="Toggle hotspots"
              >
                <MapPin className="size-4" />
              </button>
            </div>

            {/* Caption — hidden for panoramas so it doesn't cover the view */}
            {!space.panorama && (
              <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/80 to-transparent p-5 pointer-events-none">
                <div className="text-lg font-semibold text-white">{space.name}</div>
                {space.capacity && <div className="text-xs text-white/60">{space.capacity}</div>}
                <div className="text-sm text-white/70">{space.description}</div>
              </div>
            )}
          </div>

          {/* ---- Sidebar (unchanged) ---- */}
          <div className="flex flex-col bg-zinc-950 text-white min-h-0">
            <div className="px-4 pt-4 pb-2 border-b border-white/10">
              <div className="text-sm font-semibold">{tour.branchName}</div>
              <div className="text-xs text-white/50">{tour.address}</div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {spaces.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => setIdx(i)}
                  className={`flex w-full items-center gap-3 rounded-lg p-2 text-left transition ${
                    i === idx ? "bg-white/15 ring-1 ring-white/30" : "hover:bg-white/5"
                  }`}
                >
                  <img src={s.image} alt="" className="size-14 rounded object-cover shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{s.name}</div>
                    <div className="text-xs text-white/50 capitalize">
                      {s.category}
                      {s.capacity ? ` · ${s.capacity}` : ""}
                    </div>
                  </div>
                  {s.panorama && (
                    <span className="text-[10px] uppercase tracking-wider text-white/40 shrink-0">360°</span>
                  )}
                </button>
              ))}
            </div>

            <div className="border-t border-white/10 p-4">
              <Button
                className="w-full bg-white text-black hover:bg-white/90"
                onClick={() => onRequestTour(tour.id)}
              >
                {tour.id === "union-station" ? "Enquire about an event" : "Request an in-person tour"}
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}