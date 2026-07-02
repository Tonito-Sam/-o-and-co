import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Bell, Mail, MessageSquare, Smartphone, Globe } from "lucide-react";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notifications — WorkspaceOS" }] }),
  component: Notifications,
});

const channels = [
  { name: "Email", icon: Mail, on: true, sent: 12480 },
  { name: "SMS", icon: MessageSquare, on: true, sent: 3210 },
  { name: "WhatsApp", icon: MessageSquare, on: true, sent: 4840 },
  { name: "Push", icon: Smartphone, on: true, sent: 18230 },
  { name: "In-app", icon: Globe, on: true, sent: 28190 },
];

const templates = [
  { name: "New invoice issued", channels: "Email · WhatsApp" },
  { name: "Booking confirmation", channels: "Email · Push" },
  { name: "Event reminder (24h)", channels: "Push · WhatsApp" },
  { name: "Community announcement", channels: "In-app · Push" },
  { name: "New team member joined", channels: "In-app" },
  { name: "Café promotion", channels: "Push" },
  { name: "Overdue invoice", channels: "Email · SMS · WhatsApp" },
];

function Notifications() {
  return (
    <div className="mx-auto max-w-[1200px]">
      <PageHeader
        eyebrow="Notifications Engine"
        title="Channels & templates"
        description="One engine, five channels — email, SMS, WhatsApp, push, in-app."
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Sent (30d)" value="66,940" accent="brand" />
        <StatCard label="Delivery rate" value="99.2%" accent="success" />
        <StatCard label="Open rate" value="48%" />
        <StatCard label="Templates" value="42" />
      </div>

      <div className="grid lg:grid-cols-[1fr_360px] gap-4">
        <div className="card-soft p-5">
          <h3 className="font-display font-semibold mb-3">Channels</h3>
          <div className="space-y-3">
            {channels.map((c) => (
              <div key={c.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="grid size-9 place-items-center rounded-md bg-brand-soft text-brand"><c.icon className="size-4" /></div>
                  <div className="leading-tight">
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="text-[11px] text-muted-foreground">{c.sent.toLocaleString()} sent (30d)</div>
                  </div>
                </div>
                <Switch defaultChecked={c.on} />
              </div>
            ))}
          </div>
        </div>
        <div className="card-soft p-5">
          <h3 className="font-display font-semibold mb-3 flex items-center gap-2"><Bell className="size-4" />Templates</h3>
          <div className="space-y-2">
            {templates.map((t) => (
              <div key={t.name} className="flex items-center justify-between p-2.5 rounded-md hover:bg-muted/40 cursor-pointer">
                <div>
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground">{t.channels}</div>
                </div>
                <Badge variant="outline" className="text-[10px]">Active</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
