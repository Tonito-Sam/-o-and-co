import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  Landmark,
  MapPin,
  Play,
  Presentation,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { branches } from "@/lib/mock";
import { getTourPhotoCount, tours, type Tour } from "@/lib/tours";
import { toast } from "sonner";
import { heroCaptions, welcomeSlides } from "@/components/welcome/hero-media";
import { HeroVideoTreatment } from "@/components/welcome/HeroVideoTreatment";
import welcomeSoundtrack from "../../../welcomemedia/soundtracks/Aylex - Daydreams (freetouse.com).mp3";

type BookingTab = "tour" | "space";

type MobileHomeProps = {
  onOpenTour: (id: Tour["id"]) => void;
  onOpenTourSelector: () => void;
  onOpenBooking: (branch: string, tab: BookingTab) => void;
  onOpenUnionBooking: () => void;
  isOverlayOpen: boolean;
};

const mobileFAQs = [
  {
    question: "Can I visit before deciding?",
    answer: "Yes. Book a visit and the branch team will arrange a walkthrough.",
  },
  {
    question: "How do I check availability and pricing?",
    answer: "Send a space request and the team will confirm current availability, pricing and terms.",
  },
  {
    question: "Can I enquire about Union Station?",
    answer: "Yes. Share your event brief and the team will discuss venue options with you.",
  },
];

export function MobileHome({
  onOpenTour,
  onOpenTourSelector,
  onOpenBooking,
  onOpenUnionBooking,
  isOverlayOpen,
}: MobileHomeProps) {
  const [activeSlide, setActiveSlide] = useState(0);
  const [activeCaptionIndex, setActiveCaptionIndex] = useState(0);
  const [scrollHeaderVisible, setScrollHeaderVisible] = useState(false);
  const heroRef = useRef<HTMLElement>(null);
  const heroSoundtrackRef = useRef<HTMLAudioElement>(null);
  const [soundtrackPlaying, setSoundtrackPlaying] = useState(false);
  const liveBranches = branches.filter(
    (branch) => branch.status === "live" && (branch.name === "Kyalami" || branch.name === "Rosebank"),
  );
  const workspaceTours = Object.values(tours).filter((tour) => tour.id !== "union-station");
  const stats = [
    { value: String(workspaceTours.length), label: "Johannesburg branches" },
    {
      value: String(workspaceTours.reduce(
        (count, tour) => count + tour.spaces.filter((space) => space.category === "office").length,
        0,
      )),
      label: "private offices",
    },
    {
      value: String(getTourPhotoCount()),
      label: "real-space tour photos",
    },
    {
      value: tours["union-station"].spaces.find((space) => space.id === "us-grand-hall")?.capacity?.match(/\d+/)?.[0] ?? "120",
      label: "event guests",
    },
  ];
  const heroCaption = heroCaptions[activeCaptionIndex];

  const openBooking = (branch: string, tab: BookingTab) => {
    onOpenBooking(branch, tab);
  };

  const toggleHeroSoundtrack = async () => {
    const audio = heroSoundtrackRef.current;
    if (!audio) return;

    if (!audio.paused) {
      audio.pause();
      return;
    }

    try {
      await audio.play();
    } catch {
      toast.error("Unable to play the welcome soundtrack. Please try again.");
    }
  };

  useEffect(() => {
    if (isOverlayOpen) heroSoundtrackRef.current?.pause();
  }, [isOverlayOpen]);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) heroSoundtrackRef.current?.pause();
    }, { threshold: 0.1 });
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(
      () => setActiveCaptionIndex((index) => (index + 1) % heroCaptions.length),
      6500,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    let previousY = window.scrollY;
    const updateHeader = () => {
      const currentY = window.scrollY;
      const heroBottom = heroRef.current?.getBoundingClientRect().bottom ?? 0;
      if (currentY <= 8 || heroBottom > 0) {
        setScrollHeaderVisible(false);
      } else if (currentY < previousY) {
        setScrollHeaderVisible(true);
      } else if (currentY > previousY) {
        setScrollHeaderVisible(false);
      }
      previousY = currentY;
    };

    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, []);

  return (
    <div className="pb-24 md:hidden">
      <header
        aria-hidden={!scrollHeaderVisible}
        className={`fixed inset-x-0 top-0 z-50 border-b bg-background/95 text-foreground shadow-sm backdrop-blur-xl transition duration-300 md:hidden ${
          scrollHeaderVisible ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-xl items-center gap-3 px-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary">
            <BrandLogo className="size-7 object-contain" />
          </span>
          <span className="leading-tight">
            <span className="block font-display text-sm font-semibold">Office &amp; Co</span>
            <span className="block text-xs text-muted-foreground">Spaces That Inspire</span>
          </span>
        </div>
      </header>

      <section
        ref={heroRef}
        className="relative isolate h-[100svh] min-h-[620px] max-h-[900px] overflow-hidden bg-primary text-white"
      >
        <audio
          ref={heroSoundtrackRef}
          className="hidden"
          src={welcomeSoundtrack}
          loop
          preload="none"
          onPlay={() => setSoundtrackPlaying(true)}
          onPause={() => setSoundtrackPlaying(false)}
        />
        <div className="absolute inset-0 -z-20">
          {welcomeSlides.map((slide, index) => {
            const active = index === activeSlide;
            const className = `absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
              active ? "scale-100 opacity-100" : "scale-[1.06] opacity-0"
            } saturate-[1.14] contrast-[1.06]`;
            return (
              <video
                key={slide.src}
                src={active ? slide.src : undefined}
                aria-label={slide.alt}
                aria-hidden={!active}
                autoPlay={active}
                loop
                muted
                playsInline
                preload={active ? "auto" : "none"}
                className={className}
              />
            );
          })}
        </div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/50 via-black/35 to-black/85" />
        <HeroVideoTreatment />
        <button
          type="button"
          onClick={() => void toggleHeroSoundtrack()}
          aria-label={soundtrackPlaying ? "Mute welcome soundtrack" : "Play welcome soundtrack"}
          aria-pressed={soundtrackPlaying}
          title={soundtrackPlaying ? "Mute welcome soundtrack" : "Play welcome soundtrack"}
          className="absolute left-4 top-4 z-20 grid size-10 place-items-center rounded-full border border-white/30 bg-black/35 text-white backdrop-blur transition hover:bg-black/55"
        >
          {soundtrackPlaying ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
        </button>

        <div className="absolute inset-x-0 top-[16%] z-10 flex flex-col items-center px-3 text-center">
          <div className="rounded-xl bg-black/55 px-5 py-3 backdrop-blur-sm ring-1 ring-white/15">
            <BrandLogo className="mx-auto h-auto w-20 drop-shadow-lg" />
            <p className="mt-2 font-display text-xs font-medium tracking-[0.18em] text-white/90">
              Space that Inspire
            </p>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-xl px-5 pb-[calc(5rem+env(safe-area-inset-bottom))]">
          <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-white/75">
            Johannesburg · Kyalami &amp; Rosebank
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.h1
              key={heroCaption}
              initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -14, filter: "blur(6px)" }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="font-display text-[clamp(1.75rem,7.5vw,2.4rem)] font-semibold leading-[1.02] tracking-tight text-balance"
            >
              {heroCaption}
            </motion.h1>
          </AnimatePresence>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-white/85">
            Private offices, meeting rooms and shared workspace — made for the way you work.
          </p>
          {welcomeSlides.length > 1 && (
            <div
              role="group"
              aria-roledescription="carousel"
              aria-label="Office & Co hero media"
              className="mt-4 flex items-center justify-center gap-1"
            >
              <button
                type="button"
                aria-label="Previous hero slide"
                onClick={() => {
                  setActiveSlide((current) => (current - 1 + welcomeSlides.length) % welcomeSlides.length);
                  setActiveCaptionIndex((current) => (current + 1) % heroCaptions.length);
                }}
                className="grid size-10 place-items-center rounded-full border border-white/30 bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
              >
                <ChevronLeft className="size-4" />
              </button>
              {welcomeSlides.map((slide, index) => (
                <button
                  key={slide.src}
                  type="button"
                  aria-label={`Show hero slide ${index + 1} of ${welcomeSlides.length}`}
                  aria-pressed={index === activeSlide}
                  onClick={() => {
                    setActiveSlide(index);
                    setActiveCaptionIndex(index % heroCaptions.length);
                  }}
                  className="grid size-8 place-items-center"
                >
                  <span
                    className={`h-1.5 rounded-full transition-all ${
                      index === activeSlide ? "w-5 bg-white" : "w-1.5 bg-white/55"
                    }`}
                  />
                </button>
              ))}
              <button
                type="button"
                aria-label="Next hero slide"
                onClick={() => {
                  setActiveSlide((current) => (current + 1) % welcomeSlides.length);
                  setActiveCaptionIndex((current) => (current + 1) % heroCaptions.length);
                }}
                className="grid size-10 place-items-center rounded-full border border-white/30 bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          )}
          <div className="mt-5">
            <Button
              size="lg"
              variant="outline"
              className="min-h-12 w-full gap-2 border-white/35 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              onClick={onOpenTourSelector}
            >
              <Play className="size-4" /> Virtual Tour
            </Button>
          </div>
        </div>
      </section>

      <section id="mobile-spaces" className="scroll-mt-4 px-5 py-9">
        <div className="mb-4">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-brand">Find your space</div>
          <h2 className="mt-1 font-display text-xl font-semibold">What are you looking for?</h2>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { icon: Building2, label: "Private office", tour: "kyalami" as const },
            { icon: Users, label: "Shared workspace", tour: "rosebank" as const },
            { icon: Presentation, label: "Meeting room", tour: "kyalami" as const },
            { icon: Landmark, label: "Events", tour: "union-station" as const },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => onOpenTour(item.tour)}
              className="card-soft flex min-h-28 flex-col items-start justify-between gap-3 rounded-xl p-4 text-left transition-transform active:scale-[0.98]"
            >
              <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand">
                <item.icon className="size-4.5" />
              </span>
              <span className="text-sm font-semibold">{item.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section id="mobile-locations" className="scroll-mt-4 py-8">
        <div className="mb-4 flex items-end justify-between px-5">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-brand">Locations</div>
            <h2 className="mt-1 font-display text-xl font-semibold">Find us in Johannesburg</h2>
          </div>
          <span className="text-xs text-muted-foreground">{liveBranches.length} branches</span>
        </div>
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {liveBranches.map((branch) => {
            const tour = tours[branch.name.toLowerCase() as Tour["id"]];
            if (!tour) return null;
            return (
              <article
                key={branch.id}
                className="card-soft w-[84vw] max-w-sm shrink-0 snap-start overflow-hidden rounded-2xl"
              >
                <div className="aspect-[16/10] overflow-hidden">
                  <img
                    src={tour.spaces[0]?.image ?? tour.coverImage}
                    alt={`${branch.name} workspace`}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="p-4">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <MapPin className="size-3" /> {branch.city}
                  </div>
                  <h3 className="mt-0.5 font-display text-lg font-semibold">{branch.name}</h3>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{tour.tagline}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <Button className="min-h-11" onClick={() => openBooking(branch.name, "tour")}>
                      Visit
                    </Button>
                    <Button
                      variant="outline"
                      className="min-h-11"
                      onClick={() => onOpenTour(tour.id)}
                    >
                      Virtual tour
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">
          {liveBranches.map((branch, index) => (
            <span
              key={branch.id}
              className={`h-1.5 rounded-full ${index === 0 ? "w-5 bg-brand" : "w-1.5 bg-muted-foreground/30"}`}
            />
          ))}
        </div>
      </section>

      <section id="mobile-events" className="scroll-mt-4 px-5 py-8">
        <div className="relative isolate overflow-hidden rounded-2xl bg-primary p-5 text-white">
          <img
            src={tours["union-station"].coverImage}
            alt=""
            loading="lazy"
            className="absolute inset-0 -z-20 h-full w-full object-cover"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/85 via-black/55 to-black/25" />
          <div className="max-w-sm py-4">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/75">
              Union Station · Events
            </div>
            <h2 className="mt-2 font-display text-2xl font-semibold leading-tight">
              A distinctive venue for company events.
            </h2>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                className="min-h-11"
                onClick={() => onOpenTour("union-station")}
              >
                Explore the venue <ArrowRight className="size-4" />
              </Button>
              <button
                type="button"
                onClick={onOpenUnionBooking}
                className="min-h-11 text-sm font-medium text-white underline underline-offset-4"
              >
                Share event brief
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="px-5 py-8">
        <h2 className="mb-4 font-display text-xl font-semibold">Spaces that work for you</h2>
        <div className="grid grid-cols-2 gap-2.5">
          {stats.map((stat) => (
            <div key={stat.label} className="card-soft rounded-xl p-4">
              <div className="font-display text-3xl font-semibold">{stat.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y bg-muted/30 px-5 py-9">
        <div className="mb-4">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-brand">FAQ</div>
          <h2 className="mt-1 font-display text-xl font-semibold">Planning a visit?</h2>
        </div>
        <div className="space-y-2.5">
          {mobileFAQs.map((item) => (
            <details key={item.question} className="card-soft rounded-xl p-4">
              <summary className="cursor-pointer list-none pr-5 text-sm font-medium marker:hidden">
                {item.question}
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="px-5 pb-8 pt-7">
        <div className="flex items-center gap-3">
          <BrandLogo className="h-auto w-9 rounded bg-primary p-1.5" />
          <div>
            <div className="font-display text-sm font-semibold">Office &amp; Co</div>
            <div className="text-xs text-muted-foreground">Spaces That Inspire</div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <a href="#mobile-locations" className="underline-offset-4 hover:underline">Locations</a>
          <a href="#mobile-events" className="underline-offset-4 hover:underline">Events</a>
          <Link to="/auth/sign-in" className="underline-offset-4 hover:underline">Portal login</Link>
        </div>
        <p className="mt-5 text-[10px] text-muted-foreground">
          © {new Date().getFullYear()} Office &amp; Co Group · Made in Johannesburg.
        </p>
      </footer>

      {!isOverlayOpen && (
        <div
          id="mobile-book"
          className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl"
        >
          <div className="mx-auto flex max-w-xl gap-2">
            <Button className="min-h-11 flex-1" onClick={() => openBooking("Kyalami", "tour")}>
              Book a tour
            </Button>
            <Button
              variant="outline"
              className="min-h-11 flex-1"
              onClick={() => openBooking("Kyalami", "space")}
            >
              Request a space
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
