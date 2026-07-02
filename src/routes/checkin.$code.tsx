import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { BrandLogo } from "@/components/BrandLogo";
import { eventAccessCodes } from "@/lib/mock";
import { CheckCircle2, Sparkles, ShieldCheck, Landmark, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/checkin/$code")({
  head: () => ({ meta: [{ title: "Event Check-in — Union Station" }, { name: "robots", content: "noindex" }] }),
  component: CheckIn,
});

function CheckIn() {
  const { code } = useParams({ from: "/checkin/$code" });
  const event = useMemo(() => eventAccessCodes.find(e => e.code.toLowerCase() === code.toLowerCase()), [code]);

  const [done, setDone] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", company: "", consent: true });
  const [busy, setBusy] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.email.trim()) return;
    setBusy(true);
    setTimeout(() => { setBusy(false); setDone(true); }, 600);
  };

  if (!event) {
    return (
      <div className="min-h-screen grid place-items-center px-4">
        <div className="max-w-md text-center">
          <Badge variant="outline" className="mb-3">Invalid code</Badge>
          <h1 className="font-display text-2xl font-semibold">This check-in link isn't recognised</h1>
          <p className="text-sm text-muted-foreground mt-2">Please scan the QR code displayed at the Union Station entrance.</p>
          <Button asChild variant="outline" className="mt-5"><Link to="/welcome">Visit Office &amp; Co</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-brand-soft/40">
      <header className="px-6 py-4 flex items-center justify-between">
        <Link to="/welcome" className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-lg bg-primary shadow-soft">
            <BrandLogo className="size-6 object-contain" />
          </div>
          <div className="leading-tight">
            <div className="font-display font-semibold text-sm">Office &amp; Co</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Union Station</div>
          </div>
        </Link>
        <Badge variant="outline" className="gap-1.5"><ShieldCheck className="size-3" /> Secure check-in</Badge>
      </header>

      <main className="px-4 pb-16">
        <div className="mx-auto max-w-md">
          <div className="card-soft p-6 md:p-8 mt-6">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-brand font-medium mb-3">
              <Landmark className="size-3.5" /> {event.client}
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-semibold leading-tight">{event.title}</h1>
            <p className="text-sm text-muted-foreground mt-2">{event.date} · Union Station, Johannesburg</p>

            {done ? (
              <div className="mt-6 text-center py-6">
                <div className="mx-auto grid size-14 place-items-center rounded-full bg-success/15 text-success mb-3">
                  <CheckCircle2 className="size-7" />
                </div>
                <h2 className="font-display text-xl font-semibold">You're checked in 🎉</h2>
                <p className="text-sm text-muted-foreground mt-1.5 max-w-xs mx-auto">
                  Welcome to {event.title}. Enjoy the event — and look out for follow-ups from our team.
                </p>
                <div className="mt-6 rounded-lg border bg-muted/30 p-4 text-left">
                  <div className="text-xs text-muted-foreground">Want to explore Office &amp; Co?</div>
                  <Link to="/welcome" className="text-sm font-medium text-brand flex items-center gap-1 mt-1">
                    See workspaces, membership and venues <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-6 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="fullName">Full name <span className="text-destructive">*</span></Label>
                  <Input id="fullName" required autoComplete="name" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} placeholder="Jane Doe" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email <span className="text-destructive">*</span></Label>
                  <Input id="email" type="email" required autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="jane@company.com" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input id="phone" type="tel" autoComplete="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+27…" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="company">Company <span className="text-muted-foreground text-xs">(optional)</span></Label>
                    <Input id="company" autoComplete="organization" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Acme Inc" />
                  </div>
                </div>
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={form.consent} onChange={e => setForm({ ...form, consent: e.target.checked })} className="mt-0.5" />
                  <span>I agree to receive occasional updates from Office &amp; Co about events and workspaces. Unsubscribe anytime.</span>
                </label>
                <Button type="submit" disabled={busy} className="w-full gap-1.5 h-11">
                  <Sparkles className="size-4" /> {busy ? "Checking in…" : "Check in to the event"}
                </Button>
                <p className="text-[10px] text-muted-foreground text-center">
                  Protected by Office &amp; Co. Your details are stored securely and used only for event follow-up.
                </p>
              </form>
            )}
          </div>

          <div className="text-center mt-4 text-[11px] text-muted-foreground">
            Access code <code className="font-mono">{event.code}</code>
          </div>
        </div>
      </main>
    </div>
  );
}
