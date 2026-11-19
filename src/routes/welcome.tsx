// src/routes/welcome.tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandLogo } from "@/components/BrandLogo";
import { UnionStationBookingDialog } from "@/components/UnionStationBookingDialog";
import { MobileHome } from "@/components/welcome/MobileHome";
import { HeroVideoTreatment } from "@/components/welcome/HeroVideoTreatment";
import { VirtualTour } from "@/components/VirtualTour";
import { VirtualTourSelector } from "@/components/VirtualTourSelector";
import bryanstonImg from "@/assets/space-bryanston.jpg";
import { heroCaptions, welcomeSlides } from "@/components/welcome/hero-media";
import {
  ArrowRight, Check, Sparkles, MapPin, Calendar, Users, Coffee, ShieldCheck,
  Landmark, ChevronRight, ChevronLeft, LogIn, Phone, Mail, CheckCircle2,
  Clock, Play, Wifi, Presentation, Building2, Star, SquareStack,
  Menu as MenuIcon, X,
  Volume2, VolumeX,
} from "lucide-react";
import { branches } from "@/lib/mock";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase";
import { getTourPhotoCount, tours, type Tour } from "@/lib/tours";
import { requestTourLandscape } from "@/lib/tour-orientation";
import welcomeSoundtrack from "../../welcomemedia/soundtracks/Aylex - Daydreams (freetouse.com).mp3";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Office & Co — Private offices & meeting rooms in Johannesburg" },
      {
        name: "description",
        content:
          "Explore private offices, meeting rooms and shared workspace at Office & Co Kyalami and Rosebank. Union Station for company events.",
      },
      { property: "og:title", content: "Office & Co — Workspaces, community, events." },
      {
        property: "og:description",
        content:
          "Explore private offices, meeting rooms and shared workspace at Office & Co Kyalami and Rosebank.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { unionBooking?: "open" } => ({
    ...(search.unionBooking === "open" ? { unionBooking: "open" } : {}),
  }),
  component: Welcome,
});

const tomorrowDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return new Intl.DateTimeFormat("en-CA").format(d);
};

type OneOffBookingResult = {
  lead_id: string;
  booking_id: string;
  reference: string;
  branch_id: string;
  email_token: string;
};

type BookingTab = "tour" | "space";

/* ------------------------------------------------------------------ */
/* ROOT                                                               */
/* ------------------------------------------------------------------ */
function Welcome() {
  const nav = useNavigate();
  const { unionBooking } = Route.useSearch();
  const [activeTour, setActiveTour] = useState<Tour | null>(null);
  const [tourSelectorOpen, setTourSelectorOpen] = useState(false);
  const [unionBookingOpen, setUnionBookingOpen] = useState(false);
  const [bookingRequest, setBookingRequest] = useState<{ branch: string; tab: BookingTab } | null>(null);
  const isOverlayOpen = activeTour !== null || tourSelectorOpen || unionBookingOpen || bookingRequest !== null;
  const openBookingRequest = (branch: string, tab: BookingTab = "tour") =>
    setBookingRequest({ branch, tab });
  const openTour = (id: Tour["id"]) => {
    requestTourLandscape();
    setActiveTour(tours[id]);
  };
  const selectVirtualTour = (id: Tour["id"]) => {
    requestTourLandscape();
    setTourSelectorOpen(false);
    nav({ to: "/virtual-tour/$branch", params: { branch: id } });
  };

  useEffect(() => {
    if (unionBooking === "open") setUnionBookingOpen(true);
  }, [unionBooking]);

  return (
    <div className="bg-background">
      <div className="hidden md:block">
        <SiteNav onOpenBooking={() => openBookingRequest("Kyalami", "tour")} />
        <Hero
          onOpenTourSelector={() => setTourSelectorOpen(true)}
          onOpenBooking={() => openBookingRequest("Kyalami", "tour")}
          isOverlayOpen={isOverlayOpen}
        />
        <ChooseYourNeed onOpenTour={openTour} />
        <Locations onOpenTour={openTour} onOpenBooking={openBookingRequest} />
        <Experience />
        <UnionStationFeature
          onOpenTour={() => openTour("union-station")}
          onOpenBooking={() => setUnionBookingOpen(true)}
        />
        <Proof />
        <FAQ />
      </div>
      <BookingSection
        open={bookingRequest !== null}
        onOpenChange={(open) => {
          if (!open) setBookingRequest(null);
        }}
        onOpenBooking={openBookingRequest}
        initialBranch={bookingRequest?.branch ?? "Kyalami"}
        initialTab={bookingRequest?.tab ?? "tour"}
        sectionClassName="hidden md:block"
      />
      <div className="hidden md:block">
        <FinalCTA onOpenBooking={() => openBookingRequest("Kyalami", "tour")} />
        <Footer />
      </div>
      <MobileHome
        onOpenTour={openTour}
        onOpenTourSelector={() => setTourSelectorOpen(true)}
        onOpenBooking={openBookingRequest}
        onOpenUnionBooking={() => setUnionBookingOpen(true)}
        isOverlayOpen={isOverlayOpen}
      />

      <VirtualTour
        tour={activeTour}
        open={activeTour !== null}
        onOpenChange={(open) => {
          if (!open) setActiveTour(null);
        }}
        onRequestTour={(tourId) => {
          setActiveTour(null);
          if (tourId === "union-station") {
            setUnionBookingOpen(true);
            return;
          }
          nav({ to: "/tour-request", search: { branch: tourId } });
        }}
      />
      <VirtualTourSelector
        open={tourSelectorOpen}
        onOpenChange={setTourSelectorOpen}
        onSelect={selectVirtualTour}
      />
      <UnionStationBookingDialog
        open={unionBookingOpen}
        onOpenChange={(open) => {
          setUnionBookingOpen(open);
          if (!open && unionBooking === "open") nav({ to: "/welcome", search: {}, replace: true });
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* NAV                                                                */
/* ------------------------------------------------------------------ */
function SiteNav({ onOpenBooking }: { onOpenBooking: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Link to="/welcome" className="flex items-center gap-2.5 min-w-0">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary">
            <BrandLogo className="size-6 object-contain" />
          </div>
          <div className="leading-tight min-w-0">
            <div className="font-display text-sm font-semibold truncate">Office &amp; Co</div>
            <div className="text-[10px] text-muted-foreground">South Africa</div>
          </div>
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm text-foreground/80">
          <a href="#choose" className="hover:text-foreground">Spaces</a>
          <a href="#locations" className="hover:text-foreground">Locations</a>
          <a href="#union-station" className="hover:text-foreground">Events</a>
          <a href="#proof" className="hover:text-foreground">Why us</a>
          <a href="#book" className="hover:text-foreground">Book</a>
        </nav>
        <div className="hidden sm:flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/auth/sign-in" className="gap-1.5">
              <LogIn className="size-3.5" /> Portal login
            </Link>
          </Button>
          <Button size="sm" className="gap-1.5" onClick={onOpenBooking}>
            Book a tour <ArrowRight className="size-3.5" />
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-10 sm:hidden"
          aria-label={open ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={open}
          aria-controls="mobile-site-navigation"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="size-5" /> : <MenuIcon className="size-5" />}
        </Button>
      </div>
      {open && (
        <nav id="mobile-site-navigation" className="sm:hidden border-t bg-background px-4 py-4 space-y-2">
          <a href="#choose" onClick={() => setOpen(false)} className="block text-sm py-1">Spaces</a>
          <a href="#locations" onClick={() => setOpen(false)} className="block text-sm py-1">Locations</a>
          <a href="#union-station" onClick={() => setOpen(false)} className="block text-sm py-1">Events</a>
          <a href="#proof" onClick={() => setOpen(false)} className="block text-sm py-1">Why us</a>
          <a href="#book" onClick={() => setOpen(false)} className="block text-sm py-1">Book</a>
          <div className="flex gap-2 pt-2">
            <Button asChild variant="outline" size="sm" className="flex-1">
              <Link to="/auth/sign-in">Portal login</Link>
            </Button>
            <Button size="sm" className="flex-1" onClick={() => {
              setOpen(false);
              onOpenBooking();
            }}>
              Book a tour
            </Button>
          </div>
        </nav>
      )}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* HERO — one confident frame, real tour as the second CTA             */
/* ------------------------------------------------------------------ */
function Hero({
  onOpenTourSelector,
  onOpenBooking,
  isOverlayOpen,
}: {
  onOpenTourSelector: () => void;
  onOpenBooking: () => void;
  isOverlayOpen: boolean;
}) {
  const [activeSlide, setActiveSlide] = useState(0);
  const [activeCaptionIndex, setActiveCaptionIndex] = useState(0);
  const [soundtrackPlaying, setSoundtrackPlaying] = useState(false);
  const soundtrackRef = useRef<HTMLAudioElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const heroCaption = heroCaptions[activeCaptionIndex];

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(
      () => setActiveCaptionIndex((index) => (index + 1) % heroCaptions.length),
      6500,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isOverlayOpen) soundtrackRef.current?.pause();
  }, [isOverlayOpen]);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero || !("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) soundtrackRef.current?.pause();
    }, { threshold: 0.1 });
    observer.observe(hero);
    return () => observer.disconnect();
  }, []);

  const toggleSoundtrack = async () => {
    const audio = soundtrackRef.current;
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

  return (
    <section ref={heroRef} className="relative isolate overflow-hidden bg-primary text-white">
      <audio
        ref={soundtrackRef}
        className="hidden"
        src={welcomeSoundtrack}
        loop
        preload="none"
        onPlay={() => setSoundtrackPlaying(true)}
        onPause={() => setSoundtrackPlaying(false)}
      />
      <div className="relative h-[min(78svh,680px)] min-h-[520px] max-h-[860px] w-full md:h-[88vh] md:min-h-[560px]">
        <div className="absolute inset-0 -z-20">
          {welcomeSlides.map((item, index) => {
            const active = index === activeSlide;
            const className = `absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-1000 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
              active ? "scale-100 opacity-100" : "scale-[1.06] opacity-0"
            } saturate-[1.14] contrast-[1.06]`;

            return (
              <video
                key={item.src}
                src={active ? item.src : undefined}
                aria-label={item.alt}
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

        <div className="absolute right-8 top-8 z-10 flex justify-center px-3 text-center">
          <div className="flex flex-col items-center rounded-xl bg-black/55 px-5 py-3 text-center backdrop-blur-sm ring-1 ring-white/15">
            <BrandLogo className="mx-auto h-auto w-20 drop-shadow-lg" />
            <p className="mt-2 font-display text-xs font-medium tracking-[0.18em] text-white/90">
              Space that Inspire
            </p>
          </div>
        </div>

        <div className="relative z-10 mx-auto max-w-7xl h-full px-4 sm:px-6 flex flex-col justify-end pb-16 md:pb-24 text-white">
          <div className="mb-3 text-[10px] font-medium uppercase tracking-[0.2em] text-white/75">
            Johannesburg · Kyalami &amp; Rosebank
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.h1
              key={heroCaption}
              initial={{ opacity: 0, y: 22, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -16, filter: "blur(8px)" }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="font-display text-3xl sm:text-5xl md:text-5xl lg:text-7xl font-semibold tracking-tight max-w-3xl leading-[1.02] text-balance"
            >
              {heroCaption}
            </motion.h1>
          </AnimatePresence>
          <p className="mt-4 sm:mt-5 text-sm sm:text-base md:text-lg text-white/85 max-w-xl leading-relaxed">
            Private offices, meeting rooms and shared workspace — made for the way you work.
          </p>
          <div className="mt-5 sm:mt-7 flex flex-wrap items-center justify-end gap-3">
            <Button size="lg" className="gap-1.5" onClick={onOpenBooking}>
              Book a tour <ArrowRight className="size-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white gap-1.5"
              onClick={onOpenTourSelector}
            >
              <Play className="size-4" /> Virtual tour
            </Button>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/75">
            <span className="flex items-center gap-1.5"><Check className="size-3.5 text-emerald-400" /> Kyalami and Rosebank</span>
            <span className="flex items-center gap-1.5"><Check className="size-3.5 text-emerald-400" /> Private offices</span>
            <span className="flex items-center gap-1.5"><Check className="size-3.5 text-emerald-400" /> Meeting rooms</span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void toggleSoundtrack()}
          aria-label={soundtrackPlaying ? "Mute welcome soundtrack" : "Play welcome soundtrack"}
          aria-pressed={soundtrackPlaying}
          title={soundtrackPlaying ? "Mute welcome soundtrack" : "Play welcome soundtrack"}
          className="absolute left-5 top-5 z-20 grid size-11 place-items-center rounded-full border border-white/30 bg-black/35 text-white backdrop-blur transition hover:bg-black/55"
        >
          {soundtrackPlaying ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
        </button>
        {welcomeSlides.length > 1 && (
          <>
            <button
              aria-label="Previous slide"
              onClick={() => setActiveSlide((activeSlide - 1 + welcomeSlides.length) % welcomeSlides.length)}
              className="hidden md:grid absolute left-5 top-1/2 -translate-y-1/2 size-11 place-items-center rounded-full bg-white/10 border border-white/20 text-white backdrop-blur hover:bg-white/20"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              aria-label="Next slide"
              onClick={() => setActiveSlide((activeSlide + 1) % welcomeSlides.length)}
              className="hidden md:grid absolute right-5 top-1/2 -translate-y-1/2 size-11 place-items-center rounded-full bg-white/10 border border-white/20 text-white backdrop-blur hover:bg-white/20"
            >
              <ChevronRight className="size-5" />
            </button>

            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2">
              {welcomeSlides.map((item, index) => (
                <button
                  key={item.src}
                  aria-label={`Show hero slide ${index + 1} of ${welcomeSlides.length}`}
                  aria-pressed={index === activeSlide}
                  onClick={() => setActiveSlide(index)}
                  className={`h-1.5 rounded-full transition-all ${index === activeSlide ? "w-8 bg-white" : "w-3 bg-white/40 hover:bg-white/70"}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* CHOOSE YOUR NEED — the decision fork                                */
/* ------------------------------------------------------------------ */
function ChooseYourNeed({ onOpenTour }: { onOpenTour: (id: Tour["id"]) => void }) {
  const needs = [
    {
      icon: Building2,
      title: "Private office",
      desc: "A dedicated, lockable space for your team.",
      tour: "kyalami" as Tour["id"],
      cta: "See offices",
    },
    {
      icon: Users,
      title: "Shared workspace",
      desc: "Flexible desks and lounge space in Rosebank.",
      tour: "rosebank" as Tour["id"],
      cta: "See shared space",
    },
    {
      icon: Presentation,
      title: "Meeting room",
      desc: "Boardrooms for client sessions and reviews.",
      tour: "kyalami" as Tour["id"],
      cta: "See meeting rooms",
    },
    {
      icon: Landmark,
      title: "Event venue",
      desc: "Union Station for company gatherings.",
      tour: "union-station" as Tour["id"],
      cta: "See the venue",
    },
  ];
  return (
    <section id="choose" className="py-16 md:py-20 border-b bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="max-w-2xl mb-10">
          <div className="text-[11px] uppercase tracking-[0.18em] text-brand font-medium mb-2">
            Start here
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
            What are you looking for?
          </h2>
          <p className="mt-3 text-muted-foreground">
            Pick a path and take a virtual tour of the actual spaces.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {needs.map((n) => (
            <button
              key={n.title}
              onClick={() => onOpenTour(n.tour)}
              className="group text-left card-soft p-6 hover:ring-2 hover:ring-brand/40 transition"
            >
              <div className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand mb-4">
                <n.icon className="size-5" />
              </div>
              <div className="font-semibold">{n.title}</div>
              <p className="text-sm text-muted-foreground mt-1">{n.desc}</p>
              <div className="mt-4 text-sm font-medium text-brand flex items-center gap-1 group-hover:gap-2 transition-all">
                {n.cta} <ArrowRight className="size-3.5" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* LOCATIONS — real per-branch content, driven by tours registry       */
/* ------------------------------------------------------------------ */
function Locations({ onOpenTour, onOpenBooking }: {
  onOpenTour: (id: Tour["id"]) => void;
  onOpenBooking: (branch: string, tab: BookingTab) => void;
}) {
  const live = branches.filter(
    (b) => b.status === "live" && (b.name === "Kyalami" || b.name === "Rosebank"),
  );

  return (
    <section id="locations" className="py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="max-w-2xl mb-10">
          <div className="text-[11px] uppercase tracking-[0.18em] text-brand font-medium mb-2">
            Locations
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
            Two Johannesburg branches. One membership.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Each branch has its own offices and character. Take the virtual tour or book a visit.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {live.map((b) => {
            const tour = tours[b.name.toLowerCase() as Tour["id"]];
            if (!tour) return null;
            const preview = tour.spaces.slice(0, 4);
            return (
              <article key={b.id} className="card-soft overflow-hidden group">
                <div className="aspect-16/10 overflow-hidden">
                  <div className="grid h-full grid-cols-2 grid-rows-2 gap-1 bg-background">
                    {preview.map((s, i) => (
                      <img
                        key={s.id}
                        src={s.image}
                        alt={`${b.name} ${s.name}`}
                        loading="lazy"
                        className={`h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03] ${preview.length === 3 && i === 0 ? "col-span-2" : ""}`}
                      />
                    ))}
                  </div>
                </div>
                <div className="p-6">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <MapPin className="size-3" /> {b.city} · {b.region}
                  </div>
                  <h3 className="font-display text-2xl font-semibold mt-1">{b.name}</h3>
                  <p className="text-sm text-muted-foreground mt-2">{tour.tagline}</p>
                  <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">
                    {tour.spaces.length} spaces available to explore
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => onOpenTour(tour.id)}>
                      <Play className="mr-1.5 size-3.5" /> Virtual tour
                    </Button>
                    <Button size="sm" onClick={() => onOpenBooking(b.name, "tour")}>
                      Book a visit <ArrowRight className="size-3.5 ml-1" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onOpenBooking(b.name, "space")}>
                      Request a space
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* EXPERIENCE — tightened, verifiable amenities                       */
/* ------------------------------------------------------------------ */
function Experience() {
  const amenities = [
    { icon: Wifi, t: "Work-ready offices", d: "Furnished, lockable, connected from day one." },
    { icon: Presentation, t: "Meeting rooms", d: "Boardrooms and meeting spaces for real conversations." },
    { icon: Coffee, t: "Café & shared areas", d: "A change of scene between meetings and focus." },
    { icon: ShieldCheck, t: "Access & security", d: "Controlled entry, secure parking." },
  ];
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="max-w-2xl mb-10">
          <div className="text-[11px] uppercase tracking-[0.18em] text-brand font-medium mb-2">
            The experience
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
            Professional space, with room for people.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Step out of the office for a conversation, settle into a quieter room, or bring the team together around a table.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {amenities.map((a) => (
            <div key={a.t} className="card-soft p-5">
              <div className="grid size-10 place-items-center rounded-lg bg-brand-soft text-brand mb-3">
                <a.icon className="size-5" />
              </div>
              <div className="font-medium text-sm">{a.t}</div>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{a.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* UNION STATION — elevated first-class events path                    */
/* ------------------------------------------------------------------ */
function UnionStationFeature({ onOpenTour, onOpenBooking }: { onOpenTour: () => void; onOpenBooking: () => void }) {
  const tour = tours["union-station"];
  return (
    <section id="union-station" className="py-16 md:py-24 bg-primary text-primary-foreground relative overflow-hidden">
      <div className="absolute inset-0 surface-grid opacity-[0.06]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
        <div>
          <Badge variant="outline" className="mb-4 gap-1.5 bg-white/10 border-white/25 text-white">
            <Landmark className="size-3" /> Union Station · Events
          </Badge>
          <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
            A distinctive setting for your next company event.
          </h2>
          <p className="mt-5 text-white/80 leading-relaxed">
            Grand Hall, Garden Patio, Event Dining and an intimate Dining Room — explore the venue room by room, then share your event brief.
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            {[
              "Corporate events and gatherings",
              "Grand Hall up to 120 guests",
              "Options discussed around your event brief",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2">
                <Check className="size-4 text-emerald-400 shrink-0 mt-0.5" /> {t}
              </li>
            ))}
          </ul>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              className="gap-1.5 border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
              onClick={onOpenTour}
            >
              <Play className="size-4" /> Virtual tour
            </Button>
            <Button type="button" variant="secondary" className="gap-1.5" onClick={onOpenBooking}>
              Book Union Station <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
        <div className="relative">
          <div className="grid aspect-4/3 grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-lg shadow-2xl">
            {tour.spaces.slice(0, 4).map((s) => (
              <img
                key={s.id}
                src={s.image}
                alt={`Union Station ${s.name}`}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* PROOF — facts, not fake members                                     */
/* ------------------------------------------------------------------ */
function Proof() {
  const workspaceTours = Object.values(tours).filter((tour) => tour.id !== "union-station");
  const officeCount = workspaceTours.reduce(
    (count, tour) => count + tour.spaces.filter((space) => space.category === "office").length,
    0,
  );
  const eventCapacity = tours["union-station"].spaces.find((space) => space.id === "us-grand-hall")?.capacity?.match(/\d+/)?.[0] ?? "120";
  const facts = [
    { k: String(workspaceTours.length), l: "Johannesburg workspace locations" },
    { k: String(officeCount), l: "private offices featured in virtual tours" },
    { k: String(getTourPhotoCount()), l: "real-space photos across the tours" },
    { k: eventCapacity, l: "guest capacity at Union Station's Grand Hall" },
  ];
  return (
    <section id="proof" className="py-16 md:py-24 bg-muted/30 border-y">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-brand font-medium mb-2">
              Why Office &amp; Co
            </div>
            <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
              Room to focus. Space to bring people together.
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Private offices and meeting rooms in Kyalami and Rosebank, with Union Station for company gatherings and events.
            </p>
            <Button asChild className="mt-6 gap-2">
              <a href="#locations">
                Explore the branches <ArrowRight className="size-4" />
              </a>
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {facts.map((f) => (
              <div key={f.l} className="card-soft p-6">
                <div className="font-display text-4xl font-semibold">{f.k}</div>
                <div className="text-sm text-muted-foreground mt-1">{f.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FAQ                                                                */
/* ------------------------------------------------------------------ */
function FAQ() {
  const qs = [
    {
      q: "What can I see in the virtual tours?",
      a: "Each branch has its own tour — Kyalami shows private offices and the boardroom, Rosebank shows shared space and meeting rooms, and Union Station shows the Grand Hall, Garden Patio and dining rooms. Click any room in the tour sidebar to jump to it.",
    },
    {
      q: "Can I visit before deciding?",
      a: "Yes. Book a visit and the team will arrange a walkthrough at your preferred branch.",
    },
    {
      q: "How do I check availability and pricing?",
      a: "Send an enquiry from the Request a Space tab. The team will confirm current availability, pricing and terms for the space you need.",
    },
    {
      q: "Can I enquire about Union Station for an event?",
      a: "Yes. Use the Union Station page to share your event brief and ask about venue options.",
    },
  ];
  return (
    <section className="py-16 md:py-24 bg-muted/30 border-y">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="text-center mb-10">
          <div className="text-[11px] uppercase tracking-[0.18em] text-brand font-medium mb-2">
            FAQ
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-semibold">
            Planning a visit?
          </h2>
        </div>
        <div className="space-y-3">
          {qs.map((q) => (
            <details key={q.q} className="card-soft p-5 group">
              <summary className="font-medium cursor-pointer flex justify-between items-center gap-3">
                {q.q}
                <span className="text-muted-foreground group-open:rotate-45 transition-transform">
                  +
                </span>
              </summary>
              <p className="text-sm text-muted-foreground mt-2">{q.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* BOOKING — split into "Book a tour" vs "Request a space"            */
/* ------------------------------------------------------------------ */
function BookingSection({ open, onOpenChange, onOpenBooking, initialBranch, initialTab, sectionClassName = "" }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenBooking: (branch: string, tab: BookingTab) => void;
  initialBranch: string;
  initialTab: BookingTab;
  sectionClassName?: string;
}) {
  const live = branches.filter((b) => b.status === "live");

  /* ---- Tour request form ---- */
  const [tourName, setTourName] = useState("");
  const [tourEmail, setTourEmail] = useState("");
  const [tourPhone, setTourPhone] = useState("");
  const [tourBranch, setTourBranch] = useState(initialBranch);
  const [tourDate, setTourDate] = useState(tomorrowDate);
  const [tourTime, setTourTime] = useState("10:00");
  const [tourNotes, setTourNotes] = useState("");

  /* ---- Space request form ---- */
  const [spaceName, setSpaceName] = useState("");
  const [spaceEmail, setSpaceEmail] = useState("");
  const [spacePhone, setSpacePhone] = useState("");
  const [spaceCompany, setSpaceCompany] = useState("");
  const [spaceBranch, setSpaceBranch] = useState(initialBranch);
  const [spacePurpose, setSpacePurpose] = useState("Meeting room booking");
  const [spaceGuests, setSpaceGuests] = useState("8");
  const [spaceDate, setSpaceDate] = useState(tomorrowDate);
  const [spaceStart, setSpaceStart] = useState("09:00");
  const [spaceEnd, setSpaceEnd] = useState("13:00");
  const [spaceNotes, setSpaceNotes] = useState("");

  /* ---- Confirmation ---- */
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [requestReference, setRequestReference] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [confirmationEmailStatus, setConfirmationEmailStatus] = useState("Sending confirmation…");
  const [activeTab, setActiveTab] = useState<BookingTab>(initialTab);

  useEffect(() => {
    if (!open) return;
    setTourBranch(initialBranch);
    setSpaceBranch(initialBranch);
    setActiveTab(initialTab);
  }, [open, initialBranch, initialTab]);

  const submitRequest = async (details: {
    name: string;
    email: string;
    phone: string;
    company: string;
    branch: string;
    purpose: string;
    date: string;
    startTime: string;
    endTime: string;
    guests: string;
    notes: string;
  }) => {
    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email.trim()) ||
      details.phone.trim().length < 5
    ) {
      toast.error("Enter a valid email address and phone number.");
      return false;
    }
    const startsAt = Date.parse(`${details.date}T${details.startTime}:00+02:00`);
    const guests = Number.parseInt(details.guests, 10);
    if (
      !Number.isFinite(startsAt) ||
      startsAt <= Date.now() ||
      !Number.isInteger(guests) ||
      guests < 1 ||
      guests > 1000
    ) {
      toast.error("Choose a future date and time, and a guest count between 1 and 1,000.");
      return false;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Your request could not be sent. Please try again later.");
      return false;
    }
    const { data, error } = await supabase.rpc("create_public_one_off_booking", {
      p_contact_name: details.name.trim(),
      p_contact_email: details.email.trim(),
      p_contact_phone: details.phone.trim(),
      p_company_name: details.company.trim() || details.name.trim(),
      p_branch_name: details.branch,
      p_space_name: details.purpose.trim(),
      p_booking_date: details.date,
      p_starts_at: details.startTime,
      p_ends_at: details.endTime,
      p_guests: guests,
      p_notes: details.notes.trim() || null,
    });
    if (error) {
      toast.error(error.message);
      return false;
    }
    const booking = data as OneOffBookingResult;
    setRequestReference(booking.reference);
    setConfirmationEmail(details.email.trim());
    setConfirmationEmailStatus("Sending confirmation…");
    setConfirmationOpen(true);
    const { data: delivery, error: deliveryError } = await supabase.functions.invoke(
      "deliver-booking-emails",
      { body: { booking_id: booking.booking_id, email_token: booking.email_token } },
    );
    if (deliveryError || delivery?.failed > 0) {
      setConfirmationEmailStatus("Delivery needs attention");
      toast.warning(`Request ${booking.reference} was saved, but email delivery needs attention.`);
    } else {
      setConfirmationEmailStatus("Sent");
      toast.success(`Request ${booking.reference} received. A confirmation email has been sent.`);
    }
    return true;
  };

  const submitTour = async () => {
    if (!tourName.trim() || !tourEmail.trim() || !tourPhone.trim()) {
      toast.error("Please complete your name, email and phone.");
      return;
    }
    const ok = await submitRequest({
      name: tourName,
      email: tourEmail,
      phone: tourPhone,
      company: "",
      branch: tourBranch,
      purpose: "In-person tour",
      date: tourDate,
      startTime: tourTime,
      endTime: (() => {
        const [h, m] = tourTime.split(":").map(Number);
        const end = new Date(2000, 0, 1, h, m + 60);
        return `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
      })(),
      guests: "1",
      notes: tourNotes,
    });
    if (ok) {
      setTourName("");
      setTourEmail("");
      setTourPhone("");
    }
  };

  const submitSpace = async () => {
    if (!spaceName.trim() || !spaceEmail.trim() || !spacePhone.trim()) {
      toast.error("Please complete your name, email and phone.");
      return;
    }
    if (spaceEnd <= spaceStart) {
      toast.error("Booking end time must be after the start time.");
      return;
    }
    const ok = await submitRequest({
      name: spaceName,
      email: spaceEmail,
      phone: spacePhone,
      company: spaceCompany,
      branch: spaceBranch,
      purpose: spacePurpose,
      date: spaceDate,
      startTime: spaceStart,
      endTime: spaceEnd,
      guests: spaceGuests,
      notes: spaceNotes,
    });
    if (ok) {
      setSpaceName("");
      setSpaceEmail("");
      setSpacePhone("");
      setSpaceCompany("");
    }
  };

  return (
    <>
      <section id="book" className={`${sectionClassName} border-b py-10 md:py-14`}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-4 sm:px-6">
          <div>
            <h2 className="font-display text-2xl font-semibold">Book a visit or request a space</h2>
            <p className="mt-1 text-sm text-muted-foreground">Choose a branch and send your request to its team.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onOpenBooking(initialBranch, "tour")}>Book a visit</Button>
            <Button variant="outline" onClick={() => onOpenBooking(initialBranch, "space")}>Request a space</Button>
          </div>
        </div>
      </section>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92vh] w-[calc(100%-1rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:w-[calc(100%-2rem)]">
          <DialogHeader className="border-b px-5 py-4 pr-12 text-left sm:px-7">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-brand">Office &amp; Co · {activeTab === "tour" ? "Visit" : "Space request"}</div>
            <DialogTitle className="mt-1 font-display text-xl sm:text-2xl">
              {activeTab === "tour" ? "Book a visit" : "Request a space"}
            </DialogTitle>
            <DialogDescription>
              {activeTab === "tour"
                ? "Choose a branch and preferred time for a guided visit. The branch team will confirm your request."
                : "Choose a branch and share your requirements. The branch team will confirm availability and pricing."}
            </DialogDescription>
          </DialogHeader>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as BookingTab)} className="flex min-h-0 flex-1 flex-col">
            <div className="border-b px-4 py-3 sm:px-7">
              <TabsList className="grid grid-cols-2 w-full max-w-md">
                <TabsTrigger value="tour" className="gap-1.5">
                  <Play className="size-3.5" /> Book a tour
                </TabsTrigger>
                <TabsTrigger value="space" className="gap-1.5">
                  <SquareStack className="size-3.5" /> Request a space
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ---- TOUR TAB ---- */}
            <TabsContent value="tour" className="mt-0 min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium">Full name <span className="text-red-500">*</span></label>
                  <Input value={tourName} onChange={(e) => setTourName(e.target.value)} placeholder="Jane Doe" className="bg-muted/30" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium">Email <span className="text-red-500">*</span></label>
                  <Input type="email" value={tourEmail} onChange={(e) => setTourEmail(e.target.value)} placeholder="jane@company.com" className="bg-muted/30" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium">Phone <span className="text-red-500">*</span></label>
                  <Input type="tel" value={tourPhone} onChange={(e) => setTourPhone(e.target.value)} placeholder="+27 ..." className="bg-muted/30" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium">Branch</label>
                  <select value={tourBranch} onChange={(e) => setTourBranch(e.target.value)} className="w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">
                    {live.map((b) => <option key={b.id} value={b.name}>{b.name} — {b.city}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium">Preferred date</label>
                  <Input type="date" value={tourDate} onChange={(e) => setTourDate(e.target.value)} className="bg-muted/30" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium">Preferred time</label>
                  <Input type="time" value={tourTime} onChange={(e) => setTourTime(e.target.value)} className="bg-muted/30" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium">Notes (optional)</label>
                  <Textarea value={tourNotes} onChange={(e) => setTourNotes(e.target.value)} rows={3} className="bg-muted/30 resize-none" placeholder="Who's coming, what you'd like to see…" />
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <Button onClick={submitTour} className="gap-1.5 px-6 bg-brand hover:bg-brand/90 text-white">
                  <CheckCircle2 className="size-4" /> Request tour
                </Button>
              </div>
            </TabsContent>

            {/* ---- SPACE TAB ---- */}
            <TabsContent value="space" className="mt-0 min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium">Full name <span className="text-red-500">*</span></label>
                  <Input value={spaceName} onChange={(e) => setSpaceName(e.target.value)} placeholder="Jane Doe" className="bg-muted/30" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium">Company</label>
                  <Input value={spaceCompany} onChange={(e) => setSpaceCompany(e.target.value)} placeholder="Acme Inc." className="bg-muted/30" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium">Email <span className="text-red-500">*</span></label>
                  <Input type="email" value={spaceEmail} onChange={(e) => setSpaceEmail(e.target.value)} placeholder="jane@company.com" className="bg-muted/30" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium">Phone <span className="text-red-500">*</span></label>
                  <Input type="tel" value={spacePhone} onChange={(e) => setSpacePhone(e.target.value)} placeholder="+27 ..." className="bg-muted/30" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium">Branch</label>
                  <select value={spaceBranch} onChange={(e) => setSpaceBranch(e.target.value)} className="w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-sm">
                    {live.map((b) => <option key={b.id} value={b.name}>{b.name} — {b.city}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium">Date</label>
                  <Input type="date" value={spaceDate} onChange={(e) => setSpaceDate(e.target.value)} className="bg-muted/30" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium">Guests</label>
                  <Input type="number" min="1" max="1000" value={spaceGuests} onChange={(e) => setSpaceGuests(e.target.value)} className="bg-muted/30" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium">Start time</label>
                  <Input type="time" value={spaceStart} onChange={(e) => setSpaceStart(e.target.value)} className="bg-muted/30" />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium">End time</label>
                  <Input type="time" value={spaceEnd} onChange={(e) => setSpaceEnd(e.target.value)} className="bg-muted/30" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium">Space or purpose</label>
                  <Input value={spacePurpose} onChange={(e) => setSpacePurpose(e.target.value)} placeholder="e.g. Boardroom meeting, Team workshop" className="bg-muted/30" />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-xs font-medium">Notes (optional)</label>
                  <Textarea value={spaceNotes} onChange={(e) => setSpaceNotes(e.target.value)} rows={3} className="bg-muted/30 resize-none" placeholder="Catering, AV, layout requirements…" />
                </div>
              </div>
              <div className="mt-6 flex justify-end">
                <Button onClick={submitSpace} className="gap-1.5 px-6 bg-brand hover:bg-brand/90 text-white">
                  <CheckCircle2 className="size-4" /> Request this space
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Confirmation */}
      <Dialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Request received</DialogTitle>
            <DialogDescription>
              The branch team will check availability and prepare a quote. This is not a confirmed reservation, and no invoice is due yet. We'll email you with the next step.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Request reference</span>
              <span className="text-sm text-muted-foreground">{requestReference || "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Status</span>
              <span className="rounded-full bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-600">
                Awaiting availability review
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Email confirmation</span>
              <span className="text-sm text-muted-foreground">
                {confirmationEmail} · {confirmationEmailStatus}
              </span>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmationOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* FINAL CTA                                                          */
/* ------------------------------------------------------------------ */
function FinalCTA({ onOpenBooking }: { onOpenBooking: () => void }) {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="rounded-2xl bg-primary text-primary-foreground p-8 md:p-12 text-center relative overflow-hidden shadow-elevated">
          <div className="absolute inset-0 surface-grid opacity-[0.06]" />
          <h2 className="relative font-display text-3xl md:text-4xl font-semibold">
            Come see it for yourself.
          </h2>
          <p className="relative text-white/70 mt-3 max-w-xl mx-auto">
            Take the virtual tour, then book a visit at Kyalami or Rosebank.
          </p>
          <div className="relative mt-7 flex flex-wrap justify-center gap-3">
            <Button size="lg" variant="secondary" onClick={onOpenBooking}>
              Book a tour
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="bg-transparent text-white border-white/30 hover:bg-white/10 hover:text-white"
              onClick={onOpenBooking}
            >
              Request a space
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FOOTER                                                             */
/* ------------------------------------------------------------------ */
function Footer() {
  return (
    <footer className="border-t py-12 text-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 grid sm:grid-cols-2 md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-md bg-primary">
              <BrandLogo className="size-5 object-contain" />
            </div>
            <span className="font-display font-semibold">Office &amp; Co</span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Private offices and meeting rooms in Kyalami and Rosebank. Union Station for corporate events.
          </p>
        </div>
        {[
          { t: "Branches", l: ["Kyalami", "Rosebank", "Union Station"] },
          { t: "Company", l: ["About", "Careers", "Press", "Contact"] },
          { t: "Legal", l: ["Terms", "Privacy (POPIA)", "Security", "Cookies"] },
        ].map((c) => (
          <div key={c.t}>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">
              {c.t}
            </div>
            <ul className="space-y-2 text-foreground/80">
              {c.l.map((i) => (
                <li key={i}>
                  <a href="#" className="hover:text-foreground">
                    {i}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 mt-10 pt-6 border-t flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <div>© {new Date().getFullYear()} Office &amp; Co Group · Anthony Manas, Group CEO</div>
        <div>Made in Johannesburg.</div>
      </div>
    </footer>
  );
}