import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Send, TrendingUp, AlertTriangle, Users, Building2 } from "lucide-react";

export const Route = createFileRoute("/ai-assistant")({
  head: () => ({ meta: [{ title: "AI Assistant — WorkspaceOS" }] }),
  component: AI,
});

const suggestions = [
  { icon: TrendingUp, text: "Show branch performance for the last quarter" },
  { icon: Building2, text: "Which branch has the highest occupancy?" },
  { icon: AlertTriangle, text: "Which tenants are at risk of churn?" },
  { icon: Users, text: "What is our projected revenue next month?" },
];

const conversation: { role: "user" | "ai"; text: string; facts?: string[] }[] = [];

function AI() {
  return (
    <div className="mx-auto max-w-275">
      <PageHeader
        eyebrow="AI & Automation"
        title="WorkspaceOS Assistant"
        description="Ask anything about the business — across sales, tenants, facilities, finance and community."
      />
      <div className="card-soft p-6 md:p-8 min-h-[60vh] flex flex-col">
        <div className="flex-1 space-y-6">
          {conversation.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
              {m.role === "ai" && (
                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-linear-to-br from-brand to-primary text-primary-foreground">
                  <Sparkles className="size-4" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/50"}`}>
                <p className="text-sm leading-relaxed">{m.text}</p>
                {m.facts && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {m.facts.map(f => <Badge key={f} variant="outline" className="text-[10px] bg-card">{f}</Badge>)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-6 border-t">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">Try asking</div>
          <div className="grid sm:grid-cols-2 gap-2 mb-4">
            {suggestions.map((s) => (
              <button key={s.text} className="flex items-center gap-2 text-left px-3 py-2.5 rounded-lg bg-muted/40 hover:bg-muted text-sm transition-colors">
                <s.icon className="size-3.5 text-brand shrink-0" />
                <span className="truncate">{s.text}</span>
              </button>
            ))}
          </div>
          <div className="relative">
            <Input placeholder="Ask WorkspaceOS anything…" className="h-12 pr-12 bg-card" />
            <Button size="icon" className="absolute right-1.5 top-1.5 size-9"><Send className="size-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
