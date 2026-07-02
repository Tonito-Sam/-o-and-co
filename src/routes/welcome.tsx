import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BrandLogo } from "@/components/BrandLogo";
import bryanstonImg from "@/assets/space-bryanston.jpg";
import rosebankImg from "@/assets/space-rosebank.jpg";
import kyalamiImg from "@/assets/space-kyalami.jpg";
import unionImg from "@/assets/space-union-station.jpg";
import { ArrowRight, Check, Sparkles, MapPin, Calendar, Users, Coffee, ShieldCheck, Landmark, ChevronLeft, ChevronRight, LogIn, Building2 } from "lucide-react";
import { branches, demoAccounts } from "@/lib/mock";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Office & Co — Workspaces that work as hard as you do" },
      { name: "description", content: "Premium coworking, serviced offices and South Africa's most-booked corporate event venue. Kyalami · Bryanston · Rosebank · Union Station." },
      { property: "og:title", content: "Office & Co — Workspaces, community, events." },
      { property: "og:description", content: "From hot desks to gala dinners — one membership across Johannesburg's most loved workspaces." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Welcome,
});

const slides = [
  { img: bryanstonImg, name: "Bryanston", tag: "Private offices with a skyline", copy: "Golden-hour desks, plants, and a view of Sandton that never gets old.", cta: "Tour Bryanston" },
  { img: rosebankImg,  name: "Rosebank",  tag: "The lounge for the ambitious",  copy: "Deep emerald velvet, terrazzo, and a community that ships.",                 cta: "Tour Rosebank" },
  { img: kyalamiImg,   name: "Kyalami",   tag: "Boardrooms with a horizon",     copy: "Glass-walled meeting rooms overlooking the rolling Kyalami hills.",         cta: "Tour Kyalami" },
  { img: unionImg,     name: "Union Station", tag: "Johannesburg's flagship event venue", copy: "A restored heritage building for galas, summits and product launches.", cta: "Book Union Station" },
];

function Welcome() {
  return (
    <div className="bg-background">
      <SiteNav />
      <Hero />
      <PortalCTA />
      <Branches />
      <UnionStationFeature />
      <Membership />
      <Community />
      <FAQ />
      <CTA />
      <Footer />
    </div>
  );
}

function SiteNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Link to="/welcome" className="flex items-center gap-2.5 min-w-0">
          <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary"><BrandLogo className="size-6 object-contain" /></div>
          <div className="leading-tight min-w-0">
            <div className="font-display text-sm font-semibold truncate">Office &amp; Co</div>
            <div className="text-[10px] text-muted-foreground">South Africa</div>
          </div>
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm text-foreground/80">
          <a href="#branches" className="hover:text-foreground">Branches</a>
          <a href="#union-station" className="hover:text-foreground">Union Station</a>
          <a href="#membership" className="hover:text-foreground">Membership</a>
          <a href="#community" className="hover:text-foreground">Community</a>
        </nav>
        <div className="hidden sm:flex items-center gap-2">
          <Button asChild variant="ghost" size="sm"><Link to="/auth/sign-in" className="gap-1.5"><LogIn className="size-3.5" />Portal login</Link></Button>
          <Button asChild size="sm" className="gap-1.5"><Link to="/auth/sign-up">Book a tour <ArrowRight className="size-3.5" /></Link></Button>
        </div>
        <Button variant="ghost" size="sm" className="sm:hidden" onClick={() => setOpen(v => !v)}>Menu</Button>
      </div>
      {open && (
        <div className="sm:hidden border-t bg-background px-4 py-4 space-y-2">
          <a href="#branches" onClick={() => setOpen(false)} className="block text-sm py-1">Branches</a>
          <a href="#union-station" onClick={() => setOpen(false)} className="block text-sm py-1">Union Station</a>
          <a href="#membership" onClick={() => setOpen(false)} className="block text-sm py-1">Membership</a>
          <a href="#community" onClick={() => setOpen(false)} className="block text-sm py-1">Community</a>
          <div className="flex gap-2 pt-2">
            <Button asChild variant="outline" size="sm" className="flex-1"><Link to="/auth/sign-in">Portal login</Link></Button>
            <Button asChild size="sm" className="flex-1"><Link to="/auth/sign-up">Book a tour</Link></Button>
          </div>
        </div>
      )}
    </header>
  );
}

function Hero() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI(p => (p + 1) % slides.length), 5500);
    return () => clearInterval(id);
  }, []);
  const s = slides[i];
  return (
    <section className="relative overflow-hidden">
      {/* Slides */}
      <div className="relative h-[86vh] min-h-140 max-h-205 w-full">
        {slides.map((sl, idx) => (
          <div key={sl.name}
            className={`absolute inset-0 transition-opacity duration-1000 ${idx === i ? "opacity-100" : "opacity-0"}`}
            aria-hidden={idx !== i}
          >
            <img
              src={sl.img}
              alt={`${sl.name} — ${sl.tag}`}
              width={1600}
              height={1000}
              className="h-full w-full object-cover"
              loading={idx === 0 ? "eager" : "lazy"}
              fetchPriority={idx === 0 ? "high" : "auto"}
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/85 via-black/45 to-black/20" />
            <div className="absolute inset-0 bg-linear-to-r from-black/60 via-transparent to-black/20" />
          </div>
        ))}

        {/* Copy */}
        <div className="relative mx-auto max-w-7xl h-full px-4 sm:px-6 flex flex-col justify-end pb-16 md:pb-24 text-white">
          <Badge variant="outline" className="self-start bg-white/10 border-white/20 text-white gap-1.5 mb-5 backdrop-blur"><Sparkles className="size-3" /> {s.name} · {s.tag}</Badge>
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight max-w-3xl leading-[1.02]">
            Workspaces that work as hard as you do.
          </h1>
          <p className="mt-5 text-sm sm:text-base md:text-lg text-white/85 max-w-xl leading-relaxed">
            {s.copy} Premium coworking, private offices and Johannesburg's most-booked corporate event venue — all under one membership.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="gap-1.5"><Link to="/auth/sign-up">Book a tour <ArrowRight className="size-4" /></Link></Button>
            <Button asChild size="lg" variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white"><Link to="/auth/sign-in" className="gap-1.5"><LogIn className="size-4" />Portal login</Link></Button>
          </div>
          <div className="mt-6 hidden sm:flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-white/75">
            <span className="flex items-center gap-1.5"><Check className="size-3.5 text-emerald-400" /> Day passes from R220</span>
            <span className="flex items-center gap-1.5"><Check className="size-3.5 text-emerald-400" /> 24/7 across all branches</span>
            <span className="flex items-center gap-1.5"><Check className="size-3.5 text-emerald-400" /> Cancel anytime</span>
          </div>
        </div>

        {/* Controls + dots */}
        <button aria-label="Previous slide" onClick={() => setI((i - 1 + slides.length) % slides.length)}
          className="hidden md:grid absolute left-5 top-1/2 -translate-y-1/2 size-11 place-items-center rounded-full bg-white/10 border border-white/20 text-white backdrop-blur hover:bg-white/20"><ChevronLeft className="size-5" /></button>
        <button aria-label="Next slide" onClick={() => setI((i + 1) % slides.length)}
          className="hidden md:grid absolute right-5 top-1/2 -translate-y-1/2 size-11 place-items-center rounded-full bg-white/10 border border-white/20 text-white backdrop-blur hover:bg-white/20"><ChevronRight className="size-5" /></button>

        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-2">
          {slides.map((sl, idx) => (
            <button key={sl.name} aria-label={sl.name} onClick={() => setI(idx)}
              className={`h-1.5 rounded-full transition-all ${idx === i ? "w-8 bg-white" : "w-3 bg-white/40 hover:bg-white/70"}`} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PortalCTA() {
  return (
    <section className="border-b bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8 grid md:grid-cols-[1fr_auto] gap-4 items-center">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-brand font-medium mb-1">Members & staff</div>
          <div className="font-display text-lg md:text-xl font-semibold">Sign in to the WorkspaceOS portal</div>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">Group CEO, Sales, Branch, Community, Finance, Union Station admin and tenant admins each land in a personalised dashboard. Try the demo accounts on the sign-in page.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="gap-1.5"><Link to="/auth/sign-in"><LogIn className="size-4" />Portal login</Link></Button>
          <Button asChild variant="outline"><Link to="/auth/sign-up">Request access</Link></Button>
        </div>
      </div>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 pb-8 flex flex-wrap gap-1.5">
        {demoAccounts.slice(0, 5).map(a => (
          <Badge key={a.email} variant="outline" className="text-[10px] bg-card">{a.label.split(" — ")[1] ?? a.label}</Badge>
        ))}
        <Badge variant="outline" className="text-[10px] bg-card">+ {demoAccounts.length - 5} more</Badge>
      </div>
    </section>
  );
}

function Branches() {
  const live = branches.filter(b => b.status === "live");
  const planned = branches.filter(b => b.status === "planned");
  const imgs: Record<string, string> = { Bryanston: bryanstonImg, Rosebank: rosebankImg, Kyalami: kyalamiImg, "Union Station": unionImg };
  return (
    <section id="branches" className="py-16 md:py-24 border-y">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex items-end justify-between mb-8 md:mb-10 flex-wrap gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-brand font-medium mb-2">Our branches</div>
            <h2 className="font-display text-3xl md:text-4xl font-semibold">Designed in Johannesburg. Going national.</h2>
          </div>
          <p className="text-sm text-muted-foreground max-w-md">Four locations live today. Sandton, Cape Town and Durban coming soon — your membership travels with you.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {live.map(b => (
            <div key={b.id} className="card-soft overflow-hidden group hover:shadow-elevated transition-shadow">
              <div className="aspect-4/3 overflow-hidden">
                <img src={imgs[b.name] ?? bryanstonImg} alt={b.name} width={800} height={600} loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
              </div>
              <div className="p-5">
                <div className="font-display text-lg font-semibold">{b.name}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><MapPin className="size-3" /> {b.city} · {b.region}</div>
                <div className="mt-3 pt-3 border-t text-xs text-muted-foreground flex items-center justify-between">
                  <span>{Math.round(b.occupancy * 100)}% occupied</span>
                  <Link to="/auth/sign-up" className="text-brand hover:underline">Tour →</Link>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">Coming soon</div>
          <div className="flex flex-wrap gap-2">
            {planned.map(b => <Badge key={b.id} variant="outline" className="text-xs gap-1 bg-card"><MapPin className="size-3" /> {b.name}</Badge>)}
          </div>
        </div>
      </div>
    </section>
  );
}

function UnionStationFeature() {
  return (
    <section id="union-station" className="py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
        <div className="order-2 lg:order-1">
          <Badge variant="outline" className="mb-4 gap-1.5"><Landmark className="size-3" /> Union Station</Badge>
          <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight">Johannesburg's most-booked corporate event venue.</h2>
          <p className="mt-5 text-muted-foreground leading-relaxed">
            A restored heritage building. Four halls. 450 capacity. From investor briefings and product launches to year-end galas — Union Station delivers world-class corporate events in the heart of the city.
          </p>
          <ul className="mt-6 space-y-3 text-sm">
            {[
              "Capacity from 24 (boardroom) to 450 (banquet/theatre)",
              "Pro AV, streaming, simultaneous translation",
              "Award-winning catering — coffee breaks to gala dinners",
              "Dedicated events team · 4-hour quote turnaround",
            ].map(t => <li key={t} className="flex items-start gap-2"><Check className="size-4 text-brand shrink-0 mt-0.5" /> {t}</li>)}
          </ul>
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild className="gap-1.5"><Link to="/auth/sign-in">Request a quote <ArrowRight className="size-4" /></Link></Button>
            <Button variant="outline">Download brochure</Button>
          </div>
        </div>
        <div className="order-1 lg:order-2 relative">
          <div className="aspect-4/3 rounded-2xl overflow-hidden shadow-elevated">
            <img src={unionImg} alt="Union Station Grand Hall" width={1600} height={1200} loading="lazy" className="h-full w-full object-cover" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Membership() {
  const tiers = [
    { name: "Day Pass", price: "R220", period: "/day", desc: "Walk-in access, single branch.", features: ["High-speed Wi-Fi", "Café credit R30", "Meeting room booking"], cta: "Start today" },
    { name: "Flex", price: "R1,950", period: "/month", desc: "Hot desk, any branch, anytime.", features: ["All branches included", "8 meeting room hours/mo", "Community events", "Mail handling"], cta: "Most popular", featured: true },
    { name: "Dedicated", price: "R4,890", period: "/month", desc: "Your desk. Your branch. Your team.", features: ["Reserved desk", "20 meeting room hours/mo", "Storage", "Phone booth access"], cta: "Reserve" },
    { name: "Private Office", price: "From R12,500", period: "/month", desc: "Branded private suites for 4–40.", features: ["Fully furnished", "Custom signage", "Dedicated AV", "Concierge support"], cta: "Talk to sales" },
  ];
  return (
    <section id="membership" className="py-16 md:py-24 bg-muted/30 border-y">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="text-center mb-10 md:mb-12 max-w-2xl mx-auto">
          <div className="text-[11px] uppercase tracking-[0.18em] text-brand font-medium mb-2">Membership</div>
          <h2 className="font-display text-3xl md:text-4xl font-semibold">A plan for every stage.</h2>
          <p className="mt-3 text-muted-foreground">One membership. Every branch. Cancel anytime.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tiers.map(t => (
            <div key={t.name} className={`card-soft p-6 flex flex-col ${t.featured ? "ring-2 ring-brand shadow-elevated" : ""}`}>
              {t.featured && <Badge className="self-start mb-3">Most popular</Badge>}
              <div className="font-display text-lg font-semibold">{t.name}</div>
              <div className="mt-2"><span className="font-display text-3xl font-semibold">{t.price}</span><span className="text-xs text-muted-foreground">{t.period}</span></div>
              <div className="text-xs text-muted-foreground mt-1">{t.desc}</div>
              <ul className="mt-5 space-y-2 text-sm flex-1">
                {t.features.map(f => <li key={f} className="flex items-start gap-2"><Check className="size-4 text-brand shrink-0 mt-0.5" />{f}</li>)}
              </ul>
              <Button asChild variant={t.featured ? "default" : "outline"} className="mt-6"><Link to="/auth/sign-up">{t.cta}</Link></Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Community() {
  return (
    <section id="community" className="py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 grid sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
        {[
          { icon: Users, t: "A real community", d: "1,200+ members, weekly events, intros that turn into deals." },
          { icon: Calendar, t: "Events every week", d: "Founders breakfasts, Wine Down Fridays, workshops, summits." },
          { icon: Coffee, t: "Cafés you'll love", d: "Specialty coffee, lunch, kitchen credit included in most plans." },
          { icon: ShieldCheck, t: "POPIA & ISO 27001", d: "Enterprise-grade security, privacy, and access control." },
          { icon: Building2, t: "Locations everywhere", d: "Johannesburg today. Cape Town & Durban next." },
          { icon: Sparkles, t: "Member rewards", d: "Discounts at 80+ partner brands across SA." },
        ].map((f, i) => (
          <div key={i} className="card-soft p-6">
            <div className="grid size-10 place-items-center rounded-lg bg-brand-soft text-brand mb-3"><f.icon className="size-5" /></div>
            <div className="font-display font-semibold">{f.t}</div>
            <p className="text-sm text-muted-foreground mt-1.5">{f.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FAQ() {
  const qs = [
    { q: "Can I use my membership at every branch?", a: "Yes. Flex, Dedicated and Private Office members have 24/7 access across all live Office & Co branches." },
    { q: "How fast can I move in?", a: "Hot desks and dedicated plans are typically same-day. Private suites and offices: 2-7 days." },
    { q: "Can I book Union Station even if I'm not a member?", a: "Absolutely. Union Station is open to all companies. Submit a quote request and our events team will respond within 4 hours." },
    { q: "Is there a contract?", a: "No long-term contracts on Flex or Dedicated — month-to-month. Private offices typically run on 6-12 month terms." },
  ];
  return (
    <section className="py-16 md:py-24 bg-muted/30 border-y">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="text-center mb-10">
          <div className="text-[11px] uppercase tracking-[0.18em] text-brand font-medium mb-2">FAQ</div>
          <h2 className="font-display text-3xl md:text-4xl font-semibold">Questions, answered.</h2>
        </div>
        <div className="space-y-3">
          {qs.map(q => (
            <details key={q.q} className="card-soft p-5 group">
              <summary className="font-medium cursor-pointer flex justify-between items-center gap-3">{q.q}<span className="text-muted-foreground group-open:rotate-45 transition-transform">+</span></summary>
              <p className="text-sm text-muted-foreground mt-2">{q.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTA() {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="rounded-2xl bg-primary text-primary-foreground p-8 md:p-12 text-center relative overflow-hidden shadow-elevated">
          <div className="absolute inset-0 surface-grid opacity-[0.06]" />
          <h2 className="relative font-display text-3xl md:text-4xl font-semibold">Come work how you actually want to work.</h2>
          <p className="relative text-white/70 mt-3 max-w-xl mx-auto">Book a tour at any branch. Walk in. Plug in. Belong.</p>
          <div className="relative mt-7 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" variant="secondary"><Link to="/auth/sign-up">Book a tour</Link></Button>
            <Button asChild size="lg" variant="outline" className="bg-transparent text-white border-white/30 hover:bg-white/10 hover:text-white"><Link to="/auth/sign-in">Portal login</Link></Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t py-12 text-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 grid sm:grid-cols-2 md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 place-items-center rounded-md bg-primary"><BrandLogo className="size-5 object-contain" /></div>
            <span className="font-display font-semibold">Office &amp; Co</span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Workspaces that work as hard as you do.</p>
        </div>
        {[
          { t: "Locations", l: ["Kyalami", "Bryanston", "Rosebank", "Union Station"] },
          { t: "Company", l: ["About", "Careers", "Press", "Contact"] },
          { t: "Legal", l: ["Terms", "Privacy (POPIA)", "Security", "Cookies"] },
        ].map(c => (
          <div key={c.t}>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-3">{c.t}</div>
            <ul className="space-y-2 text-foreground/80">{c.l.map(i => <li key={i}><a href="#" className="hover:text-foreground">{i}</a></li>)}</ul>
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
