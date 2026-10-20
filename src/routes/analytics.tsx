import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SalesAnalyticsDashboard } from "@/components/SalesAnalyticsDashboard";
import { branches, revenueTrend, formatZAR, leads, invoices, tenants, type Invoice } from "@/lib/mock";
import { useRole } from "@/lib/role-context";
import { getSageApiClient, isSageConfigured, mapSageInvoiceToAppInvoice } from "@/lib/sage-api";
import { FinancialOverviewDashboard } from "@/components/FinancialOverviewDashboard";

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [{ title: "Analytics — WorkspaceOS" }] }),
  component: Analytics,
});

const chartPalette = ["#0f766e", "#1d4ed8", "#ea580c", "#9333ea", "#16a34a"];
const pieColors = ["#0f766e", "#1d4ed8", "#ea580c", "#8b5cf6"];

function Analytics() {
  const { role } = useRole();
  if (["superadmin", "group-admin", "group-ceo", "finance", "branch-manager"].includes(role.id)) {
    return <FinancialOverviewDashboard role={role} />;
  }
  if (["crm-manager", "sales-manager"].includes(role.id)) {
    return <SalesAnalyticsDashboard />;
  }
  return <AnalyticsDemo />;
}

function AnalyticsDemo() {
  const { role } = useRole();
  const [sageInvoiceRows, setSageInvoiceRows] = useState<Invoice[]>([]);
  const sageClient = getSageApiClient();
  const sageConfigured = isSageConfigured();

  useEffect(() => {
    if (!sageClient || !sageConfigured) {
      setSageInvoiceRows([]);
      return;
    }

    let cancelled = false;

    const loadSageAnalytics = async () => {
      try {
        const remoteInvoices = await sageClient.getInvoices({ top: 100 });
        const mapped = remoteInvoices.map(mapSageInvoiceToAppInvoice);
        if (!cancelled) {
          setSageInvoiceRows(mapped);
        }
      } catch (error) {
        console.error("Failed to load Sage analytics invoices:", error);
        if (!cancelled) {
          setSageInvoiceRows([]);
        }
      }
    };

    void loadSageAnalytics();

    return () => {
      cancelled = true;
    };
  }, [sageClient, sageConfigured]);

  const financeInvoiceRows = useMemo(() => sageInvoiceRows.length > 0 ? sageInvoiceRows : invoices, [sageInvoiceRows]);

  const branchRevenue = useMemo(() => {
    const liveRevenueByBranch = new Map<string, number>();

    financeInvoiceRows.forEach((invoice) => {
      const branchName = invoice.branch ?? "Bryanston";
      liveRevenueByBranch.set(branchName, (liveRevenueByBranch.get(branchName) ?? 0) + invoice.amount);
    });

    return [...branches]
      .sort((a, b) => b.revenue - a.revenue)
      .map((branch) => {
        const liveRevenue = liveRevenueByBranch.get(branch.name) ?? 0;
        const blendedRevenue = Math.round(branch.revenue * 0.65 + liveRevenue * 0.35);
        return {
          name: branch.name,
          revenue: blendedRevenue,
          occupancy: Math.round(branch.occupancy * 100),
        };
      });
  }, [financeInvoiceRows]);

  const ceoRevenueTrend = useMemo(() => {
    const liveRevenueByMonth = new Map<string, number>();

    financeInvoiceRows.forEach((invoice) => {
      const month = new Date(invoice.issuedAt).toLocaleString("en-US", { month: "short" });
      liveRevenueByMonth.set(month, (liveRevenueByMonth.get(month) ?? 0) + invoice.amount);
    });

    return revenueTrend.map((item) => {
      const liveRevenue = (liveRevenueByMonth.get(item.month) ?? 0) / 1_000_000;
      const blendedRevenue = liveRevenue > 0
        ? Number((item.revenue * 0.65 + liveRevenue * 0.35).toFixed(2))
        : item.revenue;

      return {
        month: item.month,
        target: item.target,
        revenue: blendedRevenue,
      };
    });
  }, [financeInvoiceRows]);

  const leadStageData = useMemo(() => {
    const counts = new Map<string, number>();
    leads.forEach((lead) => counts.set(lead.stage, (counts.get(lead.stage) ?? 0) + 1));
    return [
      "New Lead",
      "Contacted",
      "Qualified",
      "Tour Scheduled",
      "Proposal Sent",
      "Negotiation",
      "Contract Sent",
      "Contract Signed",
      "Onboarding",
      "Active Tenant",
    ].map((stage) => ({ stage, count: counts.get(stage) ?? 0 }));
  }, []);

  const sourceMix = useMemo(() => {
    const counts = new Map<string, number>();
    leads.forEach((lead) => counts.set(lead.source, (counts.get(lead.source) ?? 0) + 1));
    return [...counts.entries()].map(([source, count]) => ({ source, count }));
  }, []);

  const invoiceStatusData = useMemo(() => {
    const counts = new Map<string, number>();
    financeInvoiceRows.forEach((invoice) => counts.set(invoice.status, (counts.get(invoice.status) ?? 0) + 1));
    return [...counts.entries()].map(([status, count]) => ({ status, count }));
  }, [financeInvoiceRows]);

  const tenantInvoiceLedger = useMemo(() => {
    const myTenantName = role.tenant;
    if (!myTenantName) return [];
    return financeInvoiceRows
      .filter((invoice) => invoice.tenant === myTenantName)
      .slice(0, 4)
      .map((invoice) => ({
        id: invoice.id,
        amount: invoice.amount,
        status: invoice.status,
        due: invoice.due,
      }));
  }, [financeInvoiceRows, role.tenant]);

  const overdueInvoices = financeInvoiceRows.filter((invoice) => invoice.status === "Overdue");
  const qualifiedPipeline = leads.filter((lead) => [
    "Qualified",
    "Tour Scheduled",
    "Proposal Sent",
    "Negotiation",
    "Contract Sent",
    "Contract Signed",
    "Onboarding",
    "Active Tenant",
  ].includes(lead.stage));
  const weightedPipeline = qualifiedPipeline.reduce((sum, lead) => sum + lead.value, 0);
  const avgLeadScore = Math.round(qualifiedPipeline.reduce((sum, lead) => sum + lead.score, 0) / Math.max(qualifiedPipeline.length, 1));
  const activeTenant = tenants.find((tenant) => tenant.name === role.tenant) ?? null;

  const financeAgingData = useMemo(() => {
    const today = new Date("2026-07-20T00:00:00.000Z");
    const buckets = [
      { bucket: "0-30 days", amount: 0 },
      { bucket: "31-60 days", amount: 0 },
      { bucket: "61-90 days", amount: 0 },
      { bucket: "90+ days", amount: 0 },
    ];

    financeInvoiceRows.forEach((invoice) => {
      if (invoice.status === "Paid") return;
      const due = new Date(invoice.due);
      const diffDays = Math.max(0, Math.round((today.getTime() - due.getTime()) / 86400000));
      if (diffDays <= 30) buckets[0].amount += invoice.amount;
      else if (diffDays <= 60) buckets[1].amount += invoice.amount;
      else if (diffDays <= 90) buckets[2].amount += invoice.amount;
      else buckets[3].amount += invoice.amount;
    });

    return buckets;
  }, [financeInvoiceRows]);

  const collectionsVelocityData = useMemo(() => [
    { day: "Mon", collected: 240000, target: 220000 },
    { day: "Tue", collected: 260000, target: 230000 },
    { day: "Wed", collected: 290000, target: 250000 },
    { day: "Thu", collected: 310000, target: 270000 },
    { day: "Fri", collected: 330000, target: 300000 },
  ], []);

  const branchRiskData = useMemo(() => {
    return branches.map((branch) => {
      const branchInvoices = financeInvoiceRows.filter((invoice) => invoice.branch === branch.name || invoice.branch === branch.id);
      const overdue = branchInvoices.filter((invoice) => invoice.status === "Overdue").reduce((sum, invoice) => sum + invoice.amount, 0);
      const riskScore = Math.min(100, Math.round((overdue / Math.max(branch.revenue, 1)) * 100 + (1 - branch.occupancy) * 40));
      return {
        name: branch.name,
        riskScore,
        overdue,
        occupancy: Math.round(branch.occupancy * 100),
      };
    }).sort((a, b) => b.riskScore - a.riskScore);
  }, [financeInvoiceRows]);

  const expectedCashByDay = useMemo(() => [
    { day: "Today", amount: 820000 },
    { day: "Tomorrow", amount: 760000 },
    { day: "Thu", amount: 690000 },
    { day: "Fri", amount: 920000 },
    { day: "Mon", amount: 710000 },
    { day: "Tue", amount: 650000 },
    { day: "Wed", amount: 610000 },
  ], []);

  const tenantPaymentBehavior = useMemo(() => {
    return tenants.map((tenant) => {
      const tenantInvoices = financeInvoiceRows.filter((invoice) => invoice.tenant === tenant.name);
      const paid = tenantInvoices.filter((invoice) => invoice.status === "Paid").reduce((sum, invoice) => sum + invoice.amount, 0);
      const overdue = tenantInvoices.filter((invoice) => invoice.status === "Overdue").reduce((sum, invoice) => sum + invoice.amount, 0);
      const onTimeRate = tenantInvoices.length === 0 ? 100 : Math.round((tenantInvoices.filter((invoice) => invoice.status === "Paid" || invoice.status === "Sent").length / tenantInvoices.length) * 100);
      return {
        tenant: tenant.name,
        branch: tenant.branch,
        paid,
        overdue,
        onTimeRate,
        health: tenant.health,
      };
    }).sort((a, b) => b.overdue - a.overdue);
  }, [financeInvoiceRows]);

  const forecastVarianceData = useMemo(() => {
    return revenueTrend.map((item) => ({
      month: item.month,
      actual: item.revenue,
      forecast: item.target,
      variance: item.revenue - item.target,
    }));
  }, []);

  const headline = (() => {
    switch (role.id) {
      case "group-ceo":
        return {
          eyebrow: "Board Intelligence",
          title: "Group performance command centre",
          description: "The CEO view highlights growth, occupancy, renewal health and branch-level momentum in one decision-ready page.",
        };
      case "finance":
        return {
          eyebrow: "Finance command",
          title: "Cashflow and collections view",
          description: "This page gives finance the numbers that matter for collections, overdue risk and payment discipline across the portfolio.",
        };
      case "crm-manager":
      case "sales-manager":
        return {
          eyebrow: "Sales & CRM intelligence",
          title: "Pipeline and conversion dashboard",
          description: "Sales leaders get real traction on lead velocity, source quality and branch-level conversion performance.",
        };
      case "rosebank-sales":
        return {
          eyebrow: "Rosebank sales view",
          title: "Branch-level pipeline intelligence",
          description: "This view gives the local sales team visibility into leads, conversion health and the momentum across their branch.",
        };
      case "branch-manager":
        return {
          eyebrow: "Branch operations",
          title: "Branch health snapshot",
          description: "This view helps a branch manager watch occupancy, member experience and the operational risk across their ground.",
        };
      case "community-manager":
        return {
          eyebrow: "Community operations",
          title: "Engagement and experience overview",
          description: "Community managers can see how programming, events and member engagement are shaping the branch experience.",
        };
      case "tenant-admin":
        return {
          eyebrow: "Tenant operating view",
          title: "Your workspace analytics",
          description: "Tenants see the metrics that matter to them: utilisation, invoice posture, bookings and how efficiently their space is being used.",
        };
      case "lydia-admin":
        return {
          eyebrow: "Venue control",
          title: "Union Station operating intelligence",
          description: "The venue team sees bookings, utilisation and commercial performance for the event environment.",
        };
      case "external-vendor":
        return {
          eyebrow: "Vendor intelligence",
          title: "Marketplace performance snapshot",
          description: "This view is tuned for marketplace delivery, listing health and vendor-facing fulfilment signals.",
        };
      default:
        return {
          eyebrow: "Stakeholder intelligence",
          title: "Role-specific analytics",
          description: "A focused dashboard tailored to the current stakeholder view.",
        };
    }
  })();

  const financeSummary = useMemo(() => {
    const totalOpen = financeInvoiceRows.filter((invoice) => invoice.status !== "Paid").reduce((sum, invoice) => sum + invoice.amount, 0);
    const paid = financeInvoiceRows.filter((invoice) => invoice.status === "Paid").reduce((sum, invoice) => sum + invoice.amount, 0);
    const total = financeInvoiceRows.reduce((sum, invoice) => sum + invoice.amount, 0);
    const overdueInvoicesCount = financeInvoiceRows.filter((invoice) => invoice.status === "Overdue").length;
    const collectionsRate = total === 0 ? 100 : Math.round((paid / total) * 100);

    return {
      totalOpen,
      overdueInvoicesCount,
      collectionsRate,
    };
  }, [financeInvoiceRows]);

  const statCards = useMemo(() => {
    switch (role.id) {
      case "group-ceo":
        return [
          { label: "Annual revenue", value: formatZAR(142_000_000), delta: "▲ 18.4% YoY", accent: "success" as const },
          { label: "Occupancy rate", value: "84%", delta: "▲ 4 pts", accent: "brand" as const },
          { label: "Collections rate", value: `${financeSummary.collectionsRate}%`, delta: "Sage synced", accent: "success" as const },
          { label: "Cash at risk", value: formatZAR(financeSummary.totalOpen), delta: `${financeSummary.overdueInvoicesCount} overdue`, accent: "warning" as const },
        ];
      case "finance":
        return [
          { label: "Outstanding cash", value: formatZAR(financeSummary.totalOpen), delta: "Open AR", accent: "success" as const },
          { label: "Overdue invoices", value: `${financeSummary.overdueInvoicesCount}`, delta: "Need follow-up", accent: "warning" as const },
          { label: "Collections rate", value: `${financeSummary.collectionsRate}%`, delta: "On target", accent: "brand" as const },
          { label: "Avg payment cycle", value: "11 days", delta: "-2 days", accent: "success" as const },
        ];
      case "crm-manager":
      case "sales-manager":
        return [
          { label: "Qualified pipeline", value: formatZAR(weightedPipeline), delta: "Healthy", accent: "brand" as const },
          { label: "Win rate", value: "38%", delta: "▲ 5 pts", accent: "success" as const },
          { label: "Tour bookings", value: "14", delta: "Strong demand", accent: "brand" as const },
          { label: "Avg deal score", value: `${avgLeadScore}/100`, delta: "Top tier", accent: "success" as const },
        ];
      case "branch-manager":
        return [
          { label: "Branch occupancy", value: "89%", delta: "Peak hours", accent: "success" as const },
          { label: "Bookings this week", value: "32", delta: "Booked out", accent: "brand" as const },
          { label: "Member satisfaction", value: "91%", delta: "Healthy", accent: "success" as const },
          { label: "Open issues", value: "3", delta: "Monitor", accent: "warning" as const },
        ];
      case "tenant-admin":
        return [
          { label: "Monthly spend", value: activeTenant ? formatZAR(activeTenant.mrr) : "No data", delta: activeTenant ? "Current cycle" : "No billing data", accent: "brand" as const },
          { label: "Invoice posture", value: activeTenant?.health ?? "No data", delta: "Registered invoices only", accent: "success" as const },
          { label: "Bookings", value: "No data", delta: "No registered bookings", accent: "brand" as const },
          { label: "Desk utilisation", value: "No data", delta: "No registered usage data", accent: "success" as const },
        ];
      case "lydia-admin":
        return [
          { label: "Occupied nights", value: "18", delta: "Strong demand", accent: "brand" as const },
          { label: "Revenue booked", value: formatZAR(3_200_000), delta: "High confidence", accent: "success" as const },
          { label: "Open event requests", value: "6", delta: "Needs follow-up", accent: "warning" as const },
          { label: "Avg booking lead", value: "11 days", delta: "Fast", accent: "success" as const },
        ];
      default:
        return [
          { label: "Signal quality", value: "Good", delta: "Live", accent: "success" as const },
          { label: "Focus", value: "Stakeholder view", delta: "Role tuned", accent: "brand" as const },
        ];
    }
  }, [activeTenant?.health, activeTenant?.mrr, avgLeadScore, financeSummary.collectionsRate, financeSummary.overdueInvoicesCount, financeSummary.totalOpen, role.id, weightedPipeline]);

  return (
    <div className="mx-auto max-w-350 space-y-6">
      <PageHeader eyebrow={headline.eyebrow} title={headline.title} description={headline.description} />

      <Tabs defaultValue="dashboard" className="space-y-4">
        <TabsList className="w-full justify-start rounded-full border bg-background/70 p-1">
          <TabsTrigger value="dashboard" className="rounded-full px-4">Executive dashboard</TabsTrigger>
          <TabsTrigger value="board-deck" className="rounded-full px-4">Board deck</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-0 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statCards.map((card) => (
              <StatCard key={card.label} label={card.label} value={card.value} delta={card.delta} accent={card.accent} />
            ))}
          </div>

          {role.id === "group-ceo" && (
            <div className="space-y-4">
              <div className="grid lg:grid-cols-3 gap-4">
                <div className="card-soft p-5 lg:col-span-2">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-display font-semibold">Revenue forecast</h3>
                    <Badge variant="outline">Board-ready</Badge>
                  </div>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={ceoRevenueTrend}>
                        <defs>
                          <linearGradient id="revenueFill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.03} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 95)" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                        <Area type="monotone" dataKey="target" stroke="#94a3b8" strokeDasharray="4 4" fill="transparent" />
                        <Area type="monotone" dataKey="revenue" stroke="#1d4ed8" fill="url(#revenueFill)" strokeWidth={2.5} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="card-soft p-5">
                  <h3 className="font-display font-semibold mb-3">Branch contribution</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={branchRevenue} layout="vertical" margin={{ left: 10, right: 14 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 95)" />
                        <XAxis type="number" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(value: number) => formatZAR(value)} />
                        <Bar dataKey="revenue" radius={[0, 8, 8, 0]} fill="#0f766e" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-4">
                <div className="card-soft p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-display font-semibold">DSO / AR aging</h3>
                    <Badge variant="outline">Open balance</Badge>
                  </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={financeAgingData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 95)" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(value: number) => formatZAR(value)} />
                    <Bar dataKey="amount" fill="#0f766e" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card-soft p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-semibold">Collections velocity</h3>
                <Badge variant="outline">Target vs actual</Badge>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={collectionsVelocityData}>
                    <defs>
                      <linearGradient id="cashFillCeo" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 95)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(value: number) => formatZAR(value)} />
                    <Area type="monotone" dataKey="target" stroke="#94a3b8" strokeDasharray="4 4" fill="transparent" />
                    <Area type="monotone" dataKey="collected" stroke="#1d4ed8" fill="url(#cashFillCeo)" strokeWidth={2.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="card-soft p-5">
              <h3 className="font-display font-semibold mb-3">Branch-level risk</h3>
              <div className="space-y-3">
                {branchRiskData.map((branch) => (
                  <div key={branch.name} className="rounded-md border bg-background/60 px-3 py-2">
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium">{branch.name}</span>
                      <span className="text-muted-foreground">{branch.riskScore}/100 risk</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-amber-500" style={{ width: `${branch.riskScore}%` }} />
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">Occupancy {branch.occupancy}% · overdue {formatZAR(branch.overdue)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card-soft p-5">
              <h3 className="font-display font-semibold mb-3">Expected cash by day</h3>
              <div className="space-y-2">
                {expectedCashByDay.map((entry) => (
                  <div key={entry.day} className="flex items-center justify-between rounded-md border bg-background/60 px-3 py-2">
                    <span className="text-sm font-medium">{entry.day}</span>
                    <span className="text-sm tabular-nums font-medium">{formatZAR(entry.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="card-soft p-5">
              <h3 className="font-display font-semibold mb-3">Tenant payment behavior</h3>
              <div className="space-y-2">
                {tenantPaymentBehavior.map((tenant) => (
                  <div key={tenant.tenant} className="rounded-md border bg-background/60 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">{tenant.tenant}</div>
                        <div className="text-[11px] text-muted-foreground">{tenant.branch} · {tenant.health}</div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div>On-time {tenant.onTimeRate}%</div>
                        <div>Overdue {formatZAR(tenant.overdue)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card-soft p-5">
              <h3 className="font-display font-semibold mb-3">Forecast vs actual variance</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={forecastVarianceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 95)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(value: number) => formatZAR(value)} />
                    <Bar dataKey="forecast" fill="#94a3b8" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="actual" fill="#0f766e" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {role.id === "finance" && (
        <div className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="card-soft p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-semibold">DSO / AR aging</h3>
                <Badge variant="outline">Open balance</Badge>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={financeAgingData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 95)" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(value: number) => formatZAR(value)} />
                    <Bar dataKey="amount" fill="#0f766e" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card-soft p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-semibold">Collections velocity</h3>
                <Badge variant="outline">Target vs actual</Badge>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={collectionsVelocityData}>
                    <defs>
                      <linearGradient id="cashFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 95)" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(value: number) => formatZAR(value)} />
                    <Area type="monotone" dataKey="target" stroke="#94a3b8" strokeDasharray="4 4" fill="transparent" />
                    <Area type="monotone" dataKey="collected" stroke="#1d4ed8" fill="url(#cashFill)" strokeWidth={2.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="card-soft p-5">
              <h3 className="font-display font-semibold mb-3">Branch-level risk</h3>
              <div className="space-y-3">
                {branchRiskData.map((branch) => (
                  <div key={branch.name} className="rounded-md border bg-background/60 px-3 py-2">
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="font-medium">{branch.name}</span>
                      <span className="text-muted-foreground">{branch.riskScore}/100 risk</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-amber-500" style={{ width: `${branch.riskScore}%` }} />
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">Occupancy {branch.occupancy}% · overdue {formatZAR(branch.overdue)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card-soft p-5">
              <h3 className="font-display font-semibold mb-3">Expected cash by day</h3>
              <div className="space-y-2">
                {expectedCashByDay.map((entry) => (
                  <div key={entry.day} className="flex items-center justify-between rounded-md border bg-background/60 px-3 py-2">
                    <span className="text-sm font-medium">{entry.day}</span>
                    <span className="text-sm tabular-nums font-medium">{formatZAR(entry.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="card-soft p-5">
              <h3 className="font-display font-semibold mb-3">Tenant payment behavior</h3>
              <div className="space-y-2">
                {tenantPaymentBehavior.map((tenant) => (
                  <div key={tenant.tenant} className="rounded-md border bg-background/60 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">{tenant.tenant}</div>
                        <div className="text-[11px] text-muted-foreground">{tenant.branch} · {tenant.health}</div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div>On-time {tenant.onTimeRate}%</div>
                        <div>Overdue {formatZAR(tenant.overdue)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card-soft p-5">
              <h3 className="font-display font-semibold mb-3">Forecast vs actual variance</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={forecastVarianceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 95)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(value: number) => formatZAR(value)} />
                    <Bar dataKey="forecast" fill="#94a3b8" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="actual" fill="#0f766e" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

        </TabsContent>

        <TabsContent value="board-deck" className="mt-0 space-y-4">
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="card-soft p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-semibold">Executive summary</h3>
                <Badge variant="outline">Board deck</Badge>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-md border bg-background/60 px-3 py-2">
                  <span>Collections rate</span>
                  <span className="font-medium">{financeSummary.collectionsRate}%</span>
                </div>
                <div className="flex items-center justify-between rounded-md border bg-background/60 px-3 py-2">
                  <span>Open AR exposure</span>
                  <span className="font-medium">{formatZAR(financeSummary.totalOpen)}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border bg-background/60 px-3 py-2">
                  <span>Overdue accounts</span>
                  <span className="font-medium">{financeSummary.overdueInvoicesCount}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border bg-background/60 px-3 py-2">
                  <span>Expected next cash run</span>
                  <span className="font-medium">{formatZAR(expectedCashByDay[0]?.amount ?? 0)}</span>
                </div>
              </div>
            </div>

            <div className="card-soft p-5">
              <h3 className="font-display font-semibold mb-3">Priority watchlist</h3>
              <div className="space-y-2">
                {branchRiskData.slice(0, 3).map((branch) => (
                  <div key={branch.name} className="rounded-md border bg-background/60 px-3 py-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{branch.name}</span>
                      <span className="text-muted-foreground">{branch.riskScore}/100 risk</span>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">Occupancy {branch.occupancy}% · overdue {formatZAR(branch.overdue)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div className="card-soft p-5">
              <h3 className="font-display font-semibold mb-3">DSO / AR aging</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={financeAgingData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 95)" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(value: number) => formatZAR(value)} />
                    <Bar dataKey="amount" fill="#0f766e" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card-soft p-5">
              <h3 className="font-display font-semibold mb-3">Forecast vs actual variance</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={forecastVarianceData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 95)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} formatter={(value: number) => formatZAR(value)} />
                    <Bar dataKey="forecast" fill="#94a3b8" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="actual" fill="#0f766e" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {role.id === "sales-manager" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="card-soft p-5">
            <h3 className="font-display font-semibold mb-3">Lead stage funnel</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leadStageData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 95)" />
                  <XAxis dataKey="stage" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="count" fill="#1d4ed8" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card-soft p-5">
            <h3 className="font-display font-semibold mb-3">Lead source mix</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={sourceMix} dataKey="count" nameKey="source" innerRadius={55} outerRadius={90} paddingAngle={3}>
                    {sourceMix.map((entry, index) => <Cell key={entry.source} fill={chartPalette[index % chartPalette.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {role.id === "tenant-admin" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="card-soft p-5">
            <h3 className="font-display font-semibold mb-3">Your invoice ledger</h3>
            <div className="space-y-2">
              {tenantInvoiceLedger.length === 0 ? (
                <div className="text-sm text-muted-foreground">No invoices are currently linked to your account.</div>
              ) : tenantInvoiceLedger.map((invoice) => (
                <div key={invoice.id} className="flex items-center justify-between rounded-md border bg-background/60 px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">{invoice.id}</div>
                    <div className="text-[11px] text-muted-foreground">Due {invoice.due}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm tabular-nums font-medium">{formatZAR(invoice.amount)}</div>
                    <div className="text-[11px] text-muted-foreground">{invoice.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card-soft p-5">
            <h3 className="font-display font-semibold mb-3">Your account actions</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="rounded-md border bg-background/60 px-3 py-2">Space utilisation is tracking above your healthy threshold.</div>
              <div className="rounded-md border bg-background/60 px-3 py-2">One invoice is overdue and needs collection follow-up.</div>
              <div className="rounded-md border bg-background/60 px-3 py-2">The branch team is on pace to keep your workspace experience stable.</div>
            </div>
          </div>
        </div>
      )}

      {role.id === "branch-manager" && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="card-soft p-5">
            <h3 className="font-display font-semibold mb-3">Occupancy vs revenue</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={branchRevenue.slice(0, 4)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 95)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="occupancy" fill="#0f766e" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card-soft p-5">
            <h3 className="font-display font-semibold mb-3">Action watch</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="rounded-md border bg-background/60 px-3 py-2">Check peak-hour desk availability before Tuesday’s board meeting.</div>
              <div className="rounded-md border bg-background/60 px-3 py-2">Prioritise high-value tenant follow-up for renewal conversations.</div>
            </div>
          </div>
        </div>
      )}

      {role.id === "lydia-admin" && (
        <div className="card-soft p-5">
          <h3 className="font-display font-semibold mb-3">Venue booking pulse</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.008 95)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                <Area type="monotone" dataKey="revenue" stroke="#ea580c" fill="#fdba74" strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
