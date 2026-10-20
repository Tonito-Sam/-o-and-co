import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BrandLogo } from "@/components/BrandLogo";
import bryanstonImg from "@/assets/space-bryanston.jpg";
import rosebankImg from "@/assets/space-rosebank.jpg";
import kyalamiImg from "@/assets/space-kyalami.jpg";
import unionImg from "@/assets/space-union-station.jpg";
import { ArrowRight, Check, Sparkles, MapPin, Calendar, Users, Coffee, ShieldCheck, Landmark, ChevronLeft, ChevronRight, LogIn, Building2, Phone, Mail } from "lucide-react";
import { branches, demoAccounts, downloadInvoicePdf, type Invoice } from "@/lib/mock";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Office & Co — Workspaces that work as hard as you do" },
      { name: "description", content: "Premium coworking and serviced offices in Kyalami and Rosebank, plus public corporate events at Union Station." },
      { property: "og:title", content: "Office & Co — Workspaces, community, events." },
      { property: "og:description", content: "From hot desks to gala dinners — one membership across Johannesburg's most loved workspaces." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Welcome,
});

const tomorrowDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return new Intl.DateTimeFormat("en-CA").format(date);
};

type OneOffBookingResult = {
  lead_id: string;
  booking_id: string;
  invoice_id: string;
  reference: string;
  amount_zar: number;
  due_at: string;
};

const invoiceFromBooking = (
  result: OneOffBookingResult,
  tenant: string,
  branch: string,
  item: string,
  note: string,
): Invoice => ({
  id: result.reference,
  tenant,
  amount: result.amount_zar,
  status: "Sent",
  due: result.due_at,
  method: "—",
  items: [{ name: item, qty: 1, price: result.amount_zar }],
  issuedAt: new Date().toISOString().slice(0, 10),
  branch,
  kind: "marketplace",
  note,
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
      <BranchBookNow />
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
  const nav = useNavigate();
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
          <Button size="sm" className="gap-1.5" onClick={() => nav({ to: "/tour-request" })}>Book a tour <ArrowRight className="size-3.5" /></Button>
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
            <Button size="sm" className="flex-1" onClick={() => nav({ to: "/tour-request" })}>Book a tour</Button>
          </div>
        </div>
      )}
    </header>
  );
}

function Hero() {
  const nav = useNavigate();
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
            <Button size="lg" className="gap-1.5" onClick={() => nav({ to: "/tour-request" })}>Book a tour <ArrowRight className="size-4" /></Button>
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
          <Button asChild variant="outline"><Link to="/tour-request">Book a tour</Link></Button>
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

function BranchBookNow() {
  const live = branches.filter(b => b.status === "live");
  const [preferredBranch, setPreferredBranch] = useState("Kyalami");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [eventPurpose, setEventPurpose] = useState("Meeting room booking");
  const [eventGuests, setEventGuests] = useState("1");
  const [eventDate, setEventDate] = useState(tomorrowDate);
  const [eventStartTime, setEventStartTime] = useState("09:00");
  const [eventEndTime, setEventEndTime] = useState("13:00");
  const [notes, setNotes] = useState("Looking for a boardroom and a client-facing space for a half-day session.");
  const [showcaseOpen, setShowcaseOpen] = useState(false);
  const [showcaseBranch, setShowcaseBranch] = useState<(typeof live)[number] | null>(null);
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadName, setLeadName] = useState("");
  const [leadCompany, setLeadCompany] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [leadGuests, setLeadGuests] = useState("8");
  const [leadPurpose, setLeadPurpose] = useState("Boardroom meeting");
  const [leadDate, setLeadDate] = useState(tomorrowDate);
  const [leadStartTime, setLeadStartTime] = useState("09:00");
  const [leadEndTime, setLeadEndTime] = useState("13:00");
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [generatedInvoice, setGeneratedInvoice] = useState<Invoice | null>(null);

  const handleSubmit = async () => {
    if (!fullName.trim() || !email.trim() || !phone.trim() || !eventDate) {
      toast.error("Complete your contact details and booking date.");
      return;
    }
    if (eventEndTime <= eventStartTime) {
      toast.error("Booking end time must be after the start time.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Your request could not be sent. Please try again later.");
      return;
    }
    const { data, error } = await supabase.rpc("create_public_one_off_booking", {
      p_contact_name: fullName.trim(),
      p_contact_email: email.trim(),
      p_contact_phone: phone.trim(),
      p_company_name: company.trim() || fullName.trim(),
      p_branch_name: preferredBranch,
      p_space_name: eventPurpose.trim(),
      p_booking_date: eventDate,
      p_starts_at: eventStartTime,
      p_ends_at: eventEndTime,
      p_guests: Number.parseInt(eventGuests, 10) || 1,
      p_notes: notes.trim() || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    const booking = data as OneOffBookingResult;
    setGeneratedInvoice(invoiceFromBooking(
      booking,
      company.trim() || fullName.trim(),
      preferredBranch,
      eventPurpose.trim(),
      notes.trim(),
    ));
    setConfirmationOpen(true);
    toast.success(`Booking request saved. Invoice ${booking.reference} is ready.`);
    setFullName("");
    setEmail("");
    setPhone("");
    setCompany("");
  };

  const openShowcase = (branch: (typeof live)[number]) => {
    setShowcaseBranch(branch);
    setShowcaseOpen(true);
  };

  const openLeadCapture = () => {
    if (!showcaseBranch) return;
    setPreferredBranch(showcaseBranch.name);
    setLeadName(fullName || "");
    setLeadCompany(company || "");
    setLeadEmail(email || "");
    setLeadPhone(phone || "");
    setLeadDate(eventDate);
    setLeadStartTime(eventStartTime);
    setLeadEndTime(eventEndTime);
    setLeadPurpose("Meeting room booking request");
    setShowcaseOpen(false);
    setLeadOpen(true);
  };

  const submitLeadRequest = async () => {
    if (!showcaseBranch || !leadName || !leadEmail) {
      toast.error("Please add your name and email to complete the booking request.");
      return;
    }
    if (leadEndTime <= leadStartTime) {
      toast.error("Booking end time must be after the start time.");
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Your request could not be sent. Please try again later.");
      return;
    }
    const { data, error } = await supabase.rpc("create_public_one_off_booking", {
      p_contact_name: leadName.trim(),
      p_contact_email: leadEmail.trim(),
      p_contact_phone: leadPhone.trim(),
      p_company_name: leadCompany.trim() || leadName.trim(),
      p_branch_name: showcaseBranch.name,
      p_space_name: leadPurpose,
      p_booking_date: leadDate,
      p_starts_at: leadStartTime,
      p_ends_at: leadEndTime,
      p_guests: Number.parseInt(leadGuests, 10) || 1,
      p_notes: notes.trim() || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }

    const booking = data as OneOffBookingResult;
    const invoice = invoiceFromBooking(
      booking,
      leadCompany.trim() || leadName.trim(),
      showcaseBranch.name,
      leadPurpose,
      `${leadPurpose} for ${leadGuests} guests on ${leadDate}. ${notes}`,
    );

    setGeneratedInvoice(invoice);
    setLeadOpen(false);
    setConfirmationOpen(true);
    toast.success(`Thanks for your interest. Your booking-space pro forma invoice ${invoice.id} is ready to download.`);
  };

  const downloadGeneratedInvoice = () => {
    if (!generatedInvoice) return;
    downloadInvoicePdf(generatedInvoice);
  };

  return (
    <section id="book-now" className="py-16 md:py-20 border-b bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 grid lg:grid-cols-[1fr_1fr] gap-6 lg:gap-10">
        <div className="card-soft p-6">
          <div className="text-[11px] uppercase tracking-[0.18em] text-brand font-medium mb-2">Book now</div>
          <h2 className="font-display text-3xl md:text-4xl font-semibold">Reserve a meeting room, event space or branch tour in minutes.</h2>
          <p className="mt-3 text-sm text-muted-foreground">This public booking flow lets non-tenants enquire for a meeting room, team workshop, boardroom, or event venue. Capture key contact details and share the date you need.</p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Full name</label>
              <Input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" />
            </div>
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Company</label>
              <Input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="Company or team" />
            </div>
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Email</label>
              <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" />
            </div>
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Phone</label>
              <Input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+27 ..." />
            </div>
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Preferred branch</label>
              <select value={preferredBranch} onChange={(event) => setPreferredBranch(event.target.value)} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                {live.map((branch) => <option key={branch.id} value={branch.name}>{branch.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Date needed</label>
              <Input type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Space or purpose</label>
              <Input value={eventPurpose} onChange={(event) => setEventPurpose(event.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Guests</label>
              <Input type="number" min="1" max="1000" value={eventGuests} onChange={(event) => setEventGuests(event.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Start time</label>
              <Input type="time" value={eventStartTime} onChange={(event) => setEventStartTime(event.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">End time</label>
              <Input type="time" value={eventEndTime} onChange={(event) => setEventEndTime(event.target.value)} />
            </div>
          </div>

          <div className="mt-3">
            <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Booking notes</label>
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={handleSubmit} className="gap-1.5">Request booking</Button>
            <Button asChild variant="outline"><Link to="/tour-request">Book a tour instead</Link></Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {live.map((branch) => (
            <button key={branch.id} type="button" onClick={() => openShowcase(branch)} className="card-soft overflow-hidden text-left">
              <div className="aspect-4/3 overflow-hidden">
                <img src={branch.name === "Bryanston" ? bryanstonImg : branch.name === "Rosebank" ? rosebankImg : branch.name === "Kyalami" ? kyalamiImg : unionImg} alt={branch.name} className="h-full w-full object-cover" />
              </div>
              <div className="p-4">
                <div className="font-display font-semibold">{branch.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{branch.city} · {branch.region}</div>
                <div className="mt-3 flex gap-2">
                  <div className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground"><Calendar className="size-3" /> Check availability</div>
                  <div className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground"><Users className="size-3" /> Space gallery</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <Dialog open={showcaseOpen} onOpenChange={setShowcaseOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{showcaseBranch?.name ?? "Space showcase"}</DialogTitle>
            <DialogDescription>
              Browse a quick visual preview of this branch, check capacity and status, and request the space directly.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="aspect-video overflow-hidden rounded-lg border bg-muted/30">
              <img src={showcaseBranch?.name === "Bryanston" ? bryanstonImg : showcaseBranch?.name === "Rosebank" ? rosebankImg : showcaseBranch?.name === "Kyalami" ? kyalamiImg : unionImg} alt={showcaseBranch?.name ?? "Branch showcase"} className="h-full w-full object-cover" />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Capacity</div>
                <div className="mt-1 font-medium">Up to 60 guests</div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Availability</div>
                <div className="mt-1 font-medium">Open for this week</div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Experience</div>
                <div className="mt-1 font-medium">Boardroom + lounge</div>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="text-sm font-medium mb-2">Space preview</div>
              <div className="rounded-md bg-background p-3 text-sm text-muted-foreground">
                <div className="mb-2 flex items-center gap-2"><Users className="size-4 text-brand" /> Visual tour and gallery preview for {showcaseBranch?.name ?? "this branch"}.</div>
                <div className="mb-2 flex items-center gap-2"><Calendar className="size-4 text-brand" /> Availability details can be confirmed with the branch team.</div>
                <div className="flex items-center gap-2"><Phone className="size-4 text-brand" /> Dedicated support for enquiries and client walkthroughs.</div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setShowcaseOpen(false)}>Close</Button>
            <Button type="button" onClick={openLeadCapture}>Request this space</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={leadOpen} onOpenChange={setLeadOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Request this booking</DialogTitle>
            <DialogDescription>
              Request {showcaseBranch?.name ?? "your chosen space"}. The branch team will confirm availability; a pro-forma invoice will be created with your request.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Client name</label>
                <Input value={leadName} onChange={(event) => setLeadName(event.target.value)} placeholder="Full name" />
              </div>
              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Company</label>
                <Input value={leadCompany} onChange={(event) => setLeadCompany(event.target.value)} placeholder="Company" />
              </div>
              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Email</label>
                <Input value={leadEmail} onChange={(event) => setLeadEmail(event.target.value)} placeholder="name@company.com" />
              </div>
              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Phone</label>
                <Input value={leadPhone} onChange={(event) => setLeadPhone(event.target.value)} placeholder="+27 ..." />
              </div>
              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Guests</label>
                <Input value={leadGuests} onChange={(event) => setLeadGuests(event.target.value)} />
              </div>
              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Preferred date</label>
                <Input type="date" value={leadDate} onChange={(event) => setLeadDate(event.target.value)} />
              </div>
              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Start time</label>
                <Input type="time" value={leadStartTime} onChange={(event) => setLeadStartTime(event.target.value)} />
              </div>
              <div>
                <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">End time</label>
                <Input type="time" value={leadEndTime} onChange={(event) => setLeadEndTime(event.target.value)} />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Purpose</label>
              <Input value={leadPurpose} onChange={(event) => setLeadPurpose(event.target.value)} placeholder="Boardroom meeting, event, workshop" />
            </div>
            <div>
              <label className="mb-2 block text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Booking details</label>
              <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={4} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setLeadOpen(false)}>Cancel</Button>
            <Button type="button" onClick={submitLeadRequest}>Create booking request</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmationOpen} onOpenChange={setConfirmationOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Thanks for your interest</DialogTitle>
            <DialogDescription>
              Your space request has been captured. A booking-space pro forma invoice has been generated for download, and the space is only confirmed once payment or a deposit is made.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Invoice</span>
              <span className="text-sm text-muted-foreground">{generatedInvoice?.id ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Status</span>
              <span className="rounded-full bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-600">Unpaid</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Branch</span>
              <span className="text-sm text-muted-foreground">{showcaseBranch?.name ?? preferredBranch}</span>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmationOpen(false)}>Close</Button>
            <Button type="button" onClick={downloadGeneratedInvoice}>Download pro forma invoice</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function Branches() {
  const nav = useNavigate();
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
                  <button type="button" onClick={() => nav({ to: "/tour-request" })} className="text-brand hover:underline">Tour →</button>
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
            <Button asChild className="gap-1.5"><Link to="/union-station">Book Union Station <ArrowRight className="size-4" /></Link></Button>
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
  const nav = useNavigate();
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
              <Button variant={t.featured ? "default" : "outline"} className="mt-6" onClick={() => nav({ to: "/tour-request" })}>{t.cta}</Button>
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
  const nav = useNavigate();
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="rounded-2xl bg-primary text-primary-foreground p-8 md:p-12 text-center relative overflow-hidden shadow-elevated">
          <div className="absolute inset-0 surface-grid opacity-[0.06]" />
          <h2 className="relative font-display text-3xl md:text-4xl font-semibold">Come work how you actually want to work.</h2>
          <p className="relative text-white/70 mt-3 max-w-xl mx-auto">Book a tour at any branch. Walk in. Plug in. Belong.</p>
          <div className="relative mt-7 flex flex-wrap justify-center gap-3">
            <Button size="lg" variant="secondary" onClick={() => nav({ to: "/tour-request" })}>Book a tour</Button>
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
