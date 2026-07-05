import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useMemo } from "react";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { branches, revenueTrend, formatZAR } from "@/lib/mock";
import { Badge } from "@/components/ui/badge";

const RechartsCharts = lazy(() => import("@/components/charts/RechartsCharts"));

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [{ title: "Analytics — WorkspaceOS" }] }),
  component: Analytics,
});

const channels = [
  { name: "Workspace rental", value: 8200000 },
  { name: "Bookings", value: 1240000 },
  { name: "Café", value: 284000 },
  { name: "Marketplace", value: 410000 },
  { name: "Services", value: 186000 },
];
const colors = ["oklch(0.5 0.08 195)", "oklch(0.62 0.13 75)", "oklch(0.55 0.1 30)", "oklch(0.62 0.12 160)", "oklch(0.55 0.12 290)"];

const radar = [
  { metric: "Occupancy", A: 87, B: 80 },
  { metric: "Retention", A: 92, B: 88 },
  { metric: "NPS", A: 72, B: 65 },
  { metric: "Community", A: 78, B: 70 },
  { metric: "Café", A: 81, B: 74 },
  { metric: "Events", A: 68, B: 60 },
];

function Analytics() {
  const charts = useMemo(() => ({ channels, colors, radar, revenueTrend }), []);

  return (
    <div className="mx-auto max-w-350">
      <PageHeader
        eyebrow="Executive Intelligence"
        title="Group analytics"
        description="Forecasts, comparisons and predictive signals — the same view the board sees on Monday morning."
      />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Annual revenue" value={formatZAR(142_000_000)} delta="▲ 18.4% YoY" accent="success" />
        <StatCard label="Forecast (Q4)" value={formatZAR(38_600_000)} hint="AI: 91% confidence" accent="brand" />
        <StatCard label="Renewal rate" value="92%" delta="▲ 3pts" accent="success" />
        <StatCard label="Churn risk" value="3 tenants" delta="AI flagged" accent="warning" />
      </div>

      <Suspense fallback={<div className="card-soft p-5 text-sm text-muted-foreground">Loading charts…</div>}>
        <RechartsCharts {...charts} />
      </Suspense>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card-soft p-5 lg:col-span-2">
          <h3 className="font-display font-semibold mb-3">Branch leaderboard</h3>
          <div className="divide-y">
            {[...branches].sort((a, b) => b.revenue - a.revenue).map((b, i) => (
              <div key={b.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="grid size-8 place-items-center rounded-md bg-muted text-xs font-medium tabular-nums">{i + 1}</div>
                  <div className="leading-tight">
                    <div className="text-sm font-medium">{b.name}</div>
                    <div className="text-[11px] text-muted-foreground">{b.city}</div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-sm tabular-nums">{formatZAR(b.revenue)}</div>
                    <div className="text-[11px] text-muted-foreground">MRR</div>
                  </div>
                  <Badge variant="outline" className="text-[10px] tabular-nums w-14 justify-center">{Math.round(b.occupancy * 100)}%</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
