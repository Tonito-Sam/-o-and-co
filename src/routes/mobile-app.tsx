import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { CalendarRange, Wallet, Users, Coffee, Bell, Headphones, ShoppingBag, Sparkles } from "lucide-react";

export const Route = createFileRoute("/mobile-app")({
  head: () => ({ meta: [{ title: "Tenant App — WorkspaceOS" }] }),
  component: MobileApp,
});

function MobileApp() {
  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        eyebrow="Tenant Mobile App"
        title="The pocket workspace"
        description="Native-feeling iOS and Android. Bookings, café, community, invoices — one tap from anywhere."
      />

      <div className="grid lg:grid-cols-2 gap-10 items-center">
        <div>
          <div className="space-y-5">
            {[
              { icon: CalendarRange, title: "Bookings", text: "Reserve any room at any branch in seconds." },
              { icon: Wallet, title: "Invoices", text: "Pay outstanding amounts or charge to account." },
              { icon: Coffee, title: "Café", text: "Order ahead. Skip the queue." },
              { icon: Users, title: "Community", text: "Welcomes, announcements, hiring, launches." },
              { icon: Headphones, title: "Podcasts & content", text: "Stream the Office & Co library on the go." },
              { icon: ShoppingBag, title: "Marketplace", text: "Office supplies and tenant-to-tenant services." },
              { icon: Bell, title: "Smart notifications", text: "Only what matters — email, SMS, WhatsApp or push." },
            ].map((f) => (
              <div key={f.title} className="flex gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><f.icon className="size-5" /></div>
                <div>
                  <div className="font-display font-semibold">{f.title}</div>
                  <div className="text-sm text-muted-foreground">{f.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-center">
          <div className="relative w-[300px] h-[620px] rounded-[44px] bg-foreground p-3 shadow-elevated">
            <div className="w-full h-full rounded-[34px] bg-background overflow-hidden flex flex-col">
              <div className="h-7 bg-foreground rounded-b-2xl mx-auto w-1/3" />
              <div className="px-5 py-4 flex-1 overflow-hidden">
                <div className="text-[10px] text-muted-foreground">Tuesday, 23 June</div>
                <div className="font-display text-xl font-semibold mt-0.5">Good morning, Aisha</div>
                <Badge variant="outline" className="text-[10px] mt-1">Mosaic Studio · Rosebank</Badge>

                <div className="card-soft p-3 mt-4">
                  <div className="text-[10px] uppercase tracking-wider text-brand font-medium">Next up</div>
                  <div className="text-sm font-medium mt-0.5">Karoo Meeting Room</div>
                  <div className="text-[11px] text-muted-foreground">11:00 — 12:00 · Bryanston</div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-3">
                  {[
                    { i: CalendarRange, l: "Book" },
                    { i: Coffee, l: "Café" },
                    { i: ShoppingBag, l: "Store" },
                  ].map((q) => (
                    <div key={q.l} className="rounded-lg bg-muted/50 p-2.5 grid place-items-center text-[10px] gap-1">
                      <q.i className="size-4 text-brand" />{q.l}
                    </div>
                  ))}
                </div>

                <div className="card-soft p-3 mt-3">
                  <div className="flex items-center gap-2"><Sparkles className="size-3 text-brand" /><div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Community</div></div>
                  <div className="text-[11px] mt-1">Please welcome John Smith from ABC Consulting 🎉</div>
                </div>

                <div className="card-soft p-3 mt-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Outstanding</div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[11px]">INV-2026-0873</span>
                    <span className="text-[11px] font-medium">R 29,900</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
