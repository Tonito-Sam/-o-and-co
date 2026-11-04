// src/routes/welcome.tsx
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { VirtualTour } from "@/components/VirtualTour";
import bryanstonImg from "@/assets/space-bryanston.jpg";
import rosebankImg from "@/assets/space-rosebank.jpg";
import {
  ArrowRight, Check, Sparkles, MapPin, Calendar, Users, Coffee, ShieldCheck,
  Landmark, ChevronRight, ChevronLeft, LogIn, Phone, Mail, CheckCircle2,
  Clock, Play, Wifi, Presentation, Building2, Star, SquareStack,
} from "lucide-react";
import { branches } from "@/lib/mock";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase";
import { tours, type Tour } from "@/lib/tours";

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

const kyalamiOfficeImg = "/kyalami/private-office-a.jpg";
const heroSlides = [
  {
    image: rosebankImg,
    name: "Rosebank",
    tag: "Workspace in use",
    copy: "Private offices, meeting rooms and shared workspace in Rosebank.",
  },
  {
    image: kyalamiOfficeImg,
    name: "Kyalami",
    tag: "Private workspace",
    copy: "Private offices, meeting rooms and shared workspace in Kyalami.",
  },
];

/* ------------------------------------------------------------------ */
/* ROOT                                                               */
/* ------------------------------------------------------------------ */
function Welcome() {
  const nav = useNavigate();
  const { unionBooking } = Route.useSearch();
  const [activeTour, setActiveTour] = useState<Tour | null>(null);
  const [unionBookingOpen, setUnionBookingOpen] = useState(false);

  useEffect(() => {
    if (unionBooking === "open") setUnionBookingOpen(true);
  }, [unionBooking]);

  return (
    <div className="bg-background">
      <SiteNav />
      <Hero onOpenTour={(id) => setActiveTour(tours[id])} />
      <ChooseYourNeed onOpenTour={(id) => setActiveTour(tours[id])} />
      <Locations onOpenTour={(id) => setActiveTour(tours[id])} />
      <Experience />
      <UnionStationFeature
        onOpenTour={() => setActiveTour(tours["union-station"])}
        onOpenBooking={() => setUnionBookingOpen(true)}
      />
      <Proof />
      <FAQ />
      <BookingSection />
      <FinalCTA />
      <Footer />

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
function SiteNav() {
  const nav = useNavigate();
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
          <Button size="sm" className="gap-1.5" onClick={() => nav({ to: "/tour-request" })}>
            Book a tour <ArrowRight className="size-3.5" />
          </Button>
        </div>
        <Button variant="ghost" size="sm" className="sm:hidden" onClick={() => setOpen((v) => !v)}>
          Menu
        </Button>
      </div>
      {open && (
        <div className="sm:hidden border-t bg-background px-4 py-4 space-y-2">
          <a href="#choose" onClick={() => setOpen(false)} className="block text-sm py-1">Spaces</a>
          <a href="#locations" onClick={() => setOpen(false)} className="block text-sm py-1">Locations</a>
          <a href="#union-station" onClick={() => setOpen(false)} className="block text-sm py-1">Events</a>
          <a href="#proof" onClick={() => setOpen(false)} className="block text-sm py-1">Why us</a>
          <a href="#book" onClick={() => setOpen(false)} className="block text-sm py-1">Book</a>
          <div className="flex gap-2 pt-2">
            <Button asChild variant="outline" size="sm" className="flex-1">
              <Link to="/auth/sign-in">Portal login</Link>
            </Button>
            <Button size="sm" className="flex-1" onClick={() => nav({ to: "/tour-request" })}>
              Book a tour
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* HERO — one confident frame, real tour as the second CTA             */
/* ------------------------------------------------------------------ */
function Hero({ onOpenTour }: { onOpenTour: (id: Tour["id"]) => void }) {
  const nav = useNavigate();
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % heroSlides.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, []);

  const slide = heroSlides[activeSlide];

  return (
    <section className="relative overflow-hidden">
      <div className="relative h-[88vh] min-h-[560px] max-h-[860px] w-full">
        {heroSlides.map((item, index) => (
          <div
            key={item.name}
            className={`absolute inset-0 transition-opacity duration-1000 ${index === activeSlide ? "opacity-100" : "opacity-0"}`}
            aria-hidden={index !== activeSlide}
          >
            <img
              src={item.image}
              alt={`${item.name} — ${item.tag}`}
              className="h-full w-full object-cover"
              loading={index === 0 ? "eager" : "lazy"}
              fetchPriority={index === 0 ? "high" : "auto"}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/55 to-black/20" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-transparent to-black/25" />
          </div>
        ))}

        <div className="relative mx-auto max-w-7xl h-full px-4 sm:px-6 flex flex-col justify-end pb-16 md:pb-24 text-white">
          <Badge
            variant="outline"
            className="self-start bg-white/10 border-white/25 text-white gap-1.5 mb-5 backdrop-blur"
          >
            <Sparkles className="size-3" /> Private offices &amp; meeting rooms · Johannesburg
          </Badge>
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight max-w-3xl leading-[1.02]">
            A considered place for your team to work.
          </h1>
          <p className="mt-5 text-sm sm:text-base md:text-lg text-white/85 max-w-xl leading-relaxed">
            {slide.copy} For company gatherings, explore the distinctive Union Station venue.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button size="lg" className="gap-1.5" onClick={() => nav({ to: "/tour-request" })}>
              Book a tour <ArrowRight className="size-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white gap-1.5"
              onClick={() => onOpenTour(activeSlide === 0 ? "rosebank" : "kyalami")}
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
          aria-label="Previous slide"
          onClick={() => setActiveSlide((activeSlide - 1 + heroSlides.length) % heroSlides.length)}
          className="hidden md:grid absolute left-5 top-1/2 -translate-y-1/2 size-11 place-items-center rounded-full bg-white/10 border border-white/20 text-white backdrop-blur hover:bg-white/20"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          aria-label="Next slide"
          onClick={() => setActiveSlide((activeSlide + 1) % heroSlides.length)}
          className="hidden md:grid absolute right-5 top-1/2 -translate-y-1/2 size-11 place-items-center rounded-full bg-white/10 border border-white/20 text-white backdrop-blur hover:bg-white/20"
        >
          <ChevronRight className="size-5" />
        </button>

        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2">
          {heroSlides.map((item, index) => (
            <button
              key={item.name}
              aria-label={`Show ${item.name} slide`}
              aria-current={index === activeSlide}
              onClick={() => setActiveSlide(index)}
              className={`h-1.5 rounded-full transition-all ${index === activeSlide ? "w-8 bg-white" : "w-3 bg-white/40 hover:bg-white/70"}`}
            />
          ))}
        </div>
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
function Locations({ onOpenTour }: { onOpenTour: (id: Tour["id"]) => void }) {
  const nav = useNavigate();
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
                    <Button size="sm" onClick={() => nav({ to: "/tour-request" })}>
                      Book a visit <ArrowRight className="size-3.5 ml-1" />
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href="#book">Request a space</a>
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
  const meetingCount = workspaceTours.reduce(
    (count, tour) => count + tour.spaces.filter((space) => space.category === "meeting").length,
    0,
  );
  const eventCapacity = tours["union-station"].spaces.find((space) => space.id === "us-grand-hall")?.capacity?.match(/\d+/)?.[0] ?? "120";
  const facts = [
    { k: String(workspaceTours.length), l: "Johannesburg workspace branches" },
    { k: String(officeCount), l: "Private offices shown in the tours" },
    { k: String(meetingCount), l: "Meeting rooms shown in the tours" },
    { k: eventCapacity, l: "Grand Hall event capacity" },
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
              A workspace that works, and a venue that hosts.
            </h2>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              Real rooms, real capacity, real venues — take a look and visit before you decide.
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
function BookingSection() {
  const live = branches.filter((b) => b.status === "live");

  /* ---- Tour request form ---- */
  const [tourName, setTourName] = useState("");
  const [tourEmail, setTourEmail] = useState("");
  const [tourPhone, setTourPhone] = useState("");
  const [tourBranch, setTourBranch] = useState("Kyalami");
  const [tourDate, setTourDate] = useState(tomorrowDate);
  const [tourTime, setTourTime] = useState("10:00");
  const [tourNotes, setTourNotes] = useState("");

  /* ---- Space request form ---- */
  const [spaceName, setSpaceName] = useState("");
  const [spaceEmail, setSpaceEmail] = useState("");
  const [spacePhone, setSpacePhone] = useState("");
  const [spaceCompany, setSpaceCompany] = useState("");
  const [spaceBranch, setSpaceBranch] = useState("Kyalami");
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
    <section id="book" className="py-16 md:py-24 border-b bg-slate-50/50 relative overflow-hidden">
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand/5 rounded-full blur-3xl -z-10" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <Badge variant="outline" className="mb-4 text-brand border-brand/20 bg-brand/5">
            Choose your path
          </Badge>
          <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">
            Book a tour — or request a specific space.
          </h2>
          <p className="mt-3 text-muted-foreground">
            Two different journeys, kept separate on purpose. Tours are quick walkthroughs. Space requests need date, time and capacity.
          </p>
        </div>

        <div className="bg-white rounded-3xl shadow-xl border border-border/50 overflow-hidden">
          <Tabs defaultValue="tour" className="w-full">
            <div className="border-b bg-muted/30 px-4 sm:px-6 pt-4">
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
            <TabsContent value="tour" className="p-6 sm:p-8 m-0">
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
            <TabsContent value="space" className="p-6 sm:p-8 m-0">
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
        </div>
      </div>

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
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* FINAL CTA                                                          */
/* ------------------------------------------------------------------ */
function FinalCTA() {
  const nav = useNavigate();
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
            <Button size="lg" variant="secondary" onClick={() => nav({ to: "/tour-request" })}>
              Book a tour
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="bg-transparent text-white border-white/30 hover:bg-white/10 hover:text-white"
            >
              <a href="#book">Request a space</a>
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