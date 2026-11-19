// src/components/VirtualTour.tsx
import { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion, type Variants } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Play, Pause, MapPin, ArrowRight, Compass, RotateCw, Volume2, VolumeX, X } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import type { Tour } from "@/lib/tours";
import { releaseTourOrientation } from "@/lib/tour-orientation";
import { PannellumViewer, type PannellumHotspot } from "@/components/PannellumViewer";
import { toast } from "sonner";

const EMPTY_SPACES: Tour["spaces"] = [];
const decodedTourImages = new Map<string, Promise<void>>();

function preloadTourImage(src: string): Promise<void> {
  const cachedImage = decodedTourImages.get(src);
  if (cachedImage) return cachedImage;

  const image = new Image();
  const loading = new Promise<void>((resolve, reject) => {
    const finishLoading = () => {
      if (typeof image.decode !== "function") {
        resolve();
        return;
      }
      void image.decode().then(resolve, reject);
    };

    image.onload = finishLoading;
    image.onerror = () => reject(new Error(`Unable to load tour image: ${src}`));
    image.src = src;
    if (image.complete && image.naturalWidth > 0) finishLoading();
  });
  const decoding = loading.catch((error: unknown) => {
    decodedTourImages.delete(src);
    throw error;
  });
  decodedTourImages.set(src, decoding);
  return decoding;
}

/**
 * AI-style enhancement class — crisp, vibrant, slightly sharpened look.
 */
const AI_ENHANCED_IMAGE_CLASS =
  "transform-gpu object-cover will-change-transform backface-visibility-hidden " +
  "[filter:contrast(1.08)_saturate(1.16)_brightness(1.03)]";

/* ------------------------------------------------------------------ */
/*  CINEMATIC TRANSITION SYSTEM                                        */
/* ------------------------------------------------------------------ */

// Keep the reveal compositor-friendly; large blurred images can stall mid-transition.
const tourImageVariants: Variants = {
  enter: (direction: number) => ({
    clipPath: direction > 0 ? "inset(0 100% 0 0)" : "inset(0 0 0 100%)",
    scale: 1.01,
  }),
  center: {
    clipPath: "inset(0 0 0 0)",
    opacity: 1,
    scale: [1.01, 1.035],
    transition: {
      clipPath: { duration: 1, ease: [0.76, 0, 0.24, 1] },
      scale: { duration: 8, ease: "linear" },
    },
  },
  exit: {
    opacity: [1, 1, 0],
    transition: { opacity: { duration: 1, times: [0, 0.9, 1] } },
  },
};

const reducedTourImageVariants: Variants = {
  enter: { opacity: 0, scale: 1 },
  center: { opacity: 1, scale: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export function VirtualTour({
  tour,
  open,
  onOpenChange,
  onRequestTour,
  mode = "dialog",
}: {
  tour: Tour | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestTour: (tourId: Tour["id"]) => void;
  mode?: "dialog" | "page";
}) {
  const prefersReducedMotion = useReducedMotion();
  const [idx, setIdx] = useState(0);
  const [imageIndex, setImageIndex] = useState(0);
  const [navigationDirection, setNavigationDirection] = useState<1 | -1>(1);
  const [playing, setPlaying] = useState(false);
  const [showHotspots, setShowHotspots] = useState(true);
  const [soundtrackPlaying, setSoundtrackPlaying] = useState(false);
  const soundtrackRef = useRef<HTMLAudioElement>(null);
  const navigationInProgressRef = useRef(false);

  const spaces = useMemo<Tour["spaces"]>(() => {
    if (!tour) return EMPTY_SPACES;
    return [
      ...tour.spaces,
      {
        id: `${tour.id}-closing-frame`,
        name: "Spaces that Inspire",
        category: "workspace",
        description: `Thank you for exploring ${tour.branchName}.`,
        image: tour.coverImage,
        isClosingFrame: true,
      },
    ];
  }, [tour]);
  const space = spaces[idx];
  const imageCount = space?.images?.length ?? 1;

  const navigateToView = useCallback(async (
    spaceIndex: number,
    nextImageIndex: number,
    direction: 1 | -1,
  ) => {
    const nextSpace = spaces[spaceIndex];
    const nextImage = nextSpace?.images?.[nextImageIndex] ?? nextSpace?.image;
    if (!nextSpace || !nextImage || navigationInProgressRef.current) return;

    navigationInProgressRef.current = true;
    try {
      await preloadTourImage(nextImage);
      setNavigationDirection(direction);
      setIdx(spaceIndex);
      setImageIndex(nextImageIndex);
    } catch {
      toast.error(`Unable to load ${nextSpace.name}. Please try again.`);
    } finally {
      navigationInProgressRef.current = false;
    }
  }, [spaces]);

  useEffect(() => {
    if (!open) releaseTourOrientation();
  }, [open]);

  useEffect(() => {
    const audio = soundtrackRef.current;
    if (!open) {
      audio?.pause();
      return;
    }
    if (!audio) return;

    audio.volume = 0.8;
    void audio.play().catch((error: unknown) => {
      setSoundtrackPlaying(false);
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        toast.info("Tap the speaker button to start the soundtrack.");
        return;
      }
      toast.error(`Unable to play the ${tour?.branchName ?? "branch"} soundtrack.`);
    });
  }, [open, tour?.id, tour?.branchName]);

  const toggleSoundtrack = async () => {
    const audio = soundtrackRef.current;
    if (!audio || !tour) return;

    if (!audio.paused) {
      audio.pause();
      return;
    }

    try {
      audio.volume = 0.8;
      await audio.play();
    } catch {
      toast.error(`Unable to play the ${tour.branchName} soundtrack. Please try again.`);
    }
  };

  useEffect(() => {
    if (open) {
      setIdx(0);
      setImageIndex(0);
      setNavigationDirection(1);
      setPlaying(true);
      setShowHotspots(true);
    }
  }, [open, tour?.id]);

  useEffect(() => {
    if (!open || !playing || spaces.length < 2) return;
    const timer = window.setTimeout(() => {
      const nextSpaceIndex = imageIndex < imageCount - 1
        ? idx
        : Math.min(idx + 1, spaces.length - 1);
      const nextImageIndex = imageIndex < imageCount - 1 ? imageIndex + 1 : 0;
      void navigateToView(nextSpaceIndex, nextImageIndex, 1);
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [idx, imageCount, imageIndex, navigateToView, open, playing, spaces.length]);

  useEffect(() => {
    if (idx === spaces.length - 1) setPlaying(false);
  }, [idx, spaces.length]);

  const goToSpace = useCallback((id: string) => {
    const spaceIndex = spaces.findIndex((candidate) => candidate.id === id);
    if (spaceIndex >= 0) {
      void navigateToView(spaceIndex, 0, spaceIndex >= idx ? 1 : -1);
    }
  }, [idx, navigateToView, spaces]);

  const goToNextView = useCallback(() => {
    if (!spaces.length) return;
    const nextSpaceIndex = imageIndex < imageCount - 1
      ? idx
      : (idx + 1) % spaces.length;
    const nextImageIndex = imageIndex < imageCount - 1 ? imageIndex + 1 : 0;
    void navigateToView(nextSpaceIndex, nextImageIndex, 1);
  }, [idx, imageCount, imageIndex, navigateToView, spaces.length]);

  const goToPreviousView = useCallback(() => {
    if (!spaces.length) return;
    const previousIndex = imageIndex > 0
      ? idx
      : (idx - 1 + spaces.length) % spaces.length;
    const previousImageIndex = imageIndex > 0
      ? imageIndex - 1
      : (spaces[previousIndex]?.images?.length ?? 1) - 1;
    void navigateToView(previousIndex, previousImageIndex, -1);
  }, [idx, imageIndex, navigateToView, spaces]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goToNextView();
      if (e.key === "ArrowLeft") goToPreviousView();
      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goToNextView, goToPreviousView, open]);

  const pannellumHotspots: PannellumHotspot[] = useMemo(() => {
    if (!space?.panorama || !showHotspots) return [];
    return (space.hotspots ?? []).map((h) => ({
      id: `${space.id}-${h.label}`,
      pitch: h.pitch ?? (h.y - 50) * 0.6,
      yaw: h.yaw ?? (h.x - 50) * 2.4,
      text: h.label,
      cssClass: "tour-hotspot",
      clickHandler: () => h.toSpaceId && goToSpace(h.toSpaceId),
    }));
  }, [space, showHotspots, goToSpace]);

  if (!tour || !space) return null;
  const currentImage = space.images?.[imageIndex] ?? space.image;
  const imageKey = `${space.id}-${imageIndex}`;

  const soundtrack = (
    <audio
      ref={soundtrackRef}
      className="hidden"
      src={tour.soundtrack}
      loop
      preload="auto"
      onPlay={() => setSoundtrackPlaying(true)}
      onPause={() => setSoundtrackPlaying(false)}
      onError={() => toast.error(`The ${tour.branchName} soundtrack could not be loaded.`)}
    />
  );

  const layout = (
    <div className={`virtual-tour-layout grid h-full min-h-0 md:grid-cols-[minmax(0,1fr)_320px] ${mode === "dialog" ? "md:h-[85vh] md:max-h-[760px]" : ""}`}>
      {/* ---- Stage ---- */}
      <div className="virtual-tour-stage relative min-h-0 overflow-hidden bg-zinc-900">
        {space.isClosingFrame ? (
          <motion.div
            key={space.id}
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 grid place-items-center overflow-hidden bg-gradient-to-br from-zinc-900 via-black to-amber-950/60 p-6 text-center"
          >
            <div className="absolute -left-24 -top-24 size-72 rounded-full bg-amber-200/10 blur-3xl" />
            <div className="relative rounded-3xl border border-white/15 bg-black/25 px-8 py-10 shadow-2xl backdrop-blur-md sm:px-14 sm:py-12">
              <BrandLogo className="mx-auto h-auto w-32 drop-shadow-xl sm:w-40" />
              <p className="mt-6 font-display text-xl font-medium tracking-[0.2em] text-white sm:text-2xl">
                Spaces that Inspire
              </p>
              <p className="mt-3 text-sm text-white/65">{tour.branchName} · Office &amp; Co</p>
            </div>
          </motion.div>
        ) : space.panorama ? (
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
          <AnimatePresence mode="sync" initial={false} custom={navigationDirection}>
            <motion.div
              key={imageKey}
              custom={navigationDirection}
              variants={prefersReducedMotion ? reducedTourImageVariants : tourImageVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="absolute inset-0 overflow-hidden"
            >
              {/* Layer 1: the enhanced photo */}
              <img
                src={currentImage}
                alt={space.name}
                className={`absolute inset-0 h-full w-full ${AI_ENHANCED_IMAGE_CLASS}`}
              />

              {/* Layer 2: warm highlight bloom — fades in after the photo resolves */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.28 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                className="pointer-events-none absolute inset-0 mix-blend-soft-light"
                style={{
                  background:
                    "radial-gradient(ellipse at 28% 18%, rgba(255,244,214,0.65), transparent 55%), radial-gradient(ellipse at 72% 82%, rgba(196,220,255,0.45), transparent 60%)",
                }}
              />

              {/* Layer 3: cinematic vignette */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.42 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(circle at 50% 45%, transparent 38%, rgba(0,0,0,0.45) 100%)",
                }}
              />

            </motion.div>
          </AnimatePresence>
        )}

        {/* Reveal edge line — the seam of the wipe, still present but softened */}
        {!prefersReducedMotion && !space.isClosingFrame && !space.panorama && (
          <motion.div
            key={`${imageKey}-reveal-edge`}
            initial={{
              left: navigationDirection > 0 ? "0%" : "100%",
              opacity: 0,
            }}
            animate={{
              left: navigationDirection > 0 ? "100%" : "0%",
              opacity: [0, 0.85, 0.3, 0],
            }}
            transition={{ duration: 1, ease: [0.76, 0, 0.24, 1] }}
            className="pointer-events-none absolute inset-y-0 z-[6] w-px bg-gradient-to-b from-transparent via-amber-100 to-cyan-100/30 shadow-[0_0_20px_4px_rgba(245,222,179,0.35)]"
          />
        )}

        {!space.isClosingFrame && !space.panorama && showHotspots &&
          space.hotspots?.map((h, i) => (
            <button
              key={i}
              onClick={() => h.toSpaceId && goToSpace(h.toSpaceId)}
              className="tour-stage-hotspot absolute -translate-x-1/2 -translate-y-1/2 group z-[7]"
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

        {/* Chrome */}
        <button
          onClick={goToPreviousView}
          className="absolute left-3 top-1/2 z-20 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur transition duration-300 hover:scale-105 hover:bg-black/70 hover:ring-1 hover:ring-white/40 active:scale-95"
          aria-label="Previous photo or space"
        >
          <ChevronLeft />
        </button>
        <button
          onClick={goToNextView}
          className="absolute right-3 top-1/2 z-20 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/50 text-white backdrop-blur transition duration-300 hover:scale-105 hover:bg-black/70 hover:ring-1 hover:ring-white/40 active:scale-95"
          aria-label="Next photo or space"
        >
          <ChevronRight />
        </button>

        <div className="absolute left-4 top-4 z-20 rounded-full bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur flex items-center gap-1.5">
          {space.panorama && <Compass className="size-3" />}
          {tour.branchName} · {space.name}
          {imageCount > 1 ? ` · ${imageIndex + 1}/${imageCount}` : ""}
        </div>

        <div className="absolute right-14 top-4 z-20 flex gap-2 md:right-4">
          {mode === "page" && (
            <button
              onClick={() => onOpenChange(false)}
              className="grid size-9 place-items-center rounded-full bg-black/60 text-white backdrop-blur"
              aria-label="Close virtual tour"
            >
              <X className="size-4" />
            </button>
          )}
          <button
            onClick={() => void toggleSoundtrack()}
            className="grid size-9 place-items-center rounded-full bg-black/60 text-white backdrop-blur"
            aria-label={soundtrackPlaying ? `Mute ${tour.branchName} soundtrack` : `Play ${tour.branchName} soundtrack`}
            aria-pressed={soundtrackPlaying}
            title={soundtrackPlaying ? "Mute soundtrack" : "Play soundtrack"}
          >
            {soundtrackPlaying ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
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

        {!space.panorama && !space.isClosingFrame && (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={space.id}
              initial={{ opacity: 0, y: 24, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -12, filter: "blur(4px)" }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/90 via-black/35 to-transparent p-5 pointer-events-none"
            >
              <div className="text-lg font-semibold text-white">{space.name}</div>
              {space.capacity && <div className="text-xs text-white/60">{space.capacity}</div>}
              <div className="text-sm text-white/70">{space.description}</div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>

      {/* Sidebar */}
      <div className="virtual-tour-sidebar flex min-h-0 flex-col bg-zinc-950 text-white">
        <div className="border-b border-white/10 px-4 pb-2 pt-3 md:pt-4">
          <div className="text-sm font-semibold">{tour.branchName}</div>
          <div className="text-xs text-white/50">{tour.address}</div>
          <div className="virtual-tour-rotate-hint mt-2 flex items-center gap-1.5 text-[11px] text-white/60 md:hidden">
            <RotateCw className="size-3 shrink-0" />
            For the clearest view, rotate your phone to landscape.
          </div>
        </div>

        <div className="virtual-tour-space-list flex min-h-0 flex-1 gap-2 overflow-x-auto p-3 md:flex-col md:overflow-x-hidden md:overflow-y-auto">
          {spaces.map((s, i) => (
            <motion.button
              key={s.id}
              onClick={() => goToSpace(s.id)}
              aria-pressed={i === idx}
              whileHover={prefersReducedMotion ? undefined : { scale: 1.015 }}
              whileTap={prefersReducedMotion ? undefined : { scale: 0.985 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              className="virtual-tour-space-option relative isolate flex w-56 shrink-0 items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-white/5 md:w-full md:shrink"
            >
              {i === idx && (
                <motion.span
                  layoutId={`${tour.id}-active-space`}
                  transition={{ type: "spring", stiffness: 320, damping: 30 }}
                  className="pointer-events-none absolute inset-0 z-0 rounded-lg bg-white/10 ring-1 ring-white/30"
                />
              )}
              {s.isClosingFrame ? (
                <span className="relative z-10 grid size-14 shrink-0 place-items-center rounded bg-white/10">
                  <BrandLogo className="h-auto w-10" />
                </span>
              ) : (
                <img
                  src={s.image}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="relative z-10 size-14 shrink-0 rounded object-cover [filter:contrast(1.06)_saturate(1.12)_brightness(1.03)]"
                />
              )}
              <div className="relative z-10 min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{s.name}</div>
                <div className="text-xs text-white/50 capitalize">
                  {s.category}
                  {s.capacity ? ` · ${s.capacity}` : ""}
                </div>
              </div>
              {s.panorama && (
                <span className="relative z-10 shrink-0 text-[10px] uppercase tracking-wider text-white/40">360°</span>
              )}
            </motion.button>
          ))}
        </div>

        <div className="border-t border-white/10 p-3 md:p-4">
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
  );

  if (mode === "page") {
    return (
      <main className="fixed inset-0 z-[60] overflow-hidden bg-black text-white">
        {soundtrack}
        {layout}
      </main>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="virtual-tour-dialog max-w-6xl overflow-hidden border-none bg-black p-0 text-white [&>button]:right-3 [&>button]:top-3 [&>button]:z-30 [&>button]:rounded-full [&>button]:bg-black/60 [&>button]:p-2 [&>button]:text-white [&>button]:opacity-100">
        {soundtrack}
        {layout}
      </DialogContent>
    </Dialog>
  );
}