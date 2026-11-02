import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useRole } from "@/lib/role-context";
import { getSupabaseClient } from "@/lib/supabase";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  Building2,
  LoaderCircle,
  Send,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/ai-assistant")({
  head: () => ({ meta: [{ title: "AI Assistant — WorkspaceOS" }] }),
  component: AI,
});

const ceoSuggestions = [
  {
    icon: TrendingUp,
    label: "Quarterly performance",
    text: "Show branch performance for the last quarter",
  },
  { icon: Building2, label: "Occupancy leader", text: "Which branch has the highest occupancy?" },
  { icon: AlertTriangle, label: "Churn risk", text: "Which tenants are at risk of churn?" },
  {
    icon: Users,
    label: "Next month's run-rate",
    text: "What is our projected revenue next month?",
  },
  { icon: Users, label: "CRM by branch", text: "Summarize the CRM pipeline by branch" },
];

const branchManagerSuggestions = [
  {
    icon: TrendingUp,
    label: "Quarterly snapshot",
    text: "How is my branch performing this quarter?",
  },
  {
    icon: Building2,
    label: "Space occupancy",
    text: "What is my branch's office and desk occupancy?",
  },
  {
    icon: AlertTriangle,
    label: "At-risk tenants",
    text: "Are any tenants in my branch flagged at risk?",
  },
  { icon: Users, label: "Active tenants", text: "How many active tenants does my branch have?" },
];

const salesManagerSuggestions = [
  { icon: Users, label: "CRM by branch", text: "Summarize the CRM pipeline by branch" },
  {
    icon: TrendingUp,
    label: "Quarterly results",
    text: "Show branch performance for the last quarter",
  },
  { icon: Building2, label: "Occupancy leader", text: "Which branch has the highest occupancy?" },
  { icon: AlertTriangle, label: "Tenant churn risk", text: "Which tenants are at risk of churn?" },
];

const assistantRoles = new Set(["group-ceo", "branch-manager", "sales-manager", "crm-manager"]);

export function WorkspaceAssistantWidget() {
  const { role } = useRole();
  const [open, setOpen] = useState(false);
  if (!assistantRoles.has(role.id)) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          className="fixed bottom-20 right-4 z-50 size-14 rounded-full shadow-lg md:bottom-5 md:right-5"
          aria-label={open ? "Close WorkspaceOS assistant" : "Open WorkspaceOS assistant"}
          title="WorkspaceOS assistant"
        >
          <Sparkles className="size-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={12}
        collisionPadding={12}
        className="h-[min(38rem,calc(100dvh-10rem))] w-[min(26rem,calc(100vw-2rem))] max-h-[calc(100dvh-10rem)] max-w-none overflow-hidden p-0"
      >
        <AI embedded />
      </PopoverContent>
    </Popover>
  );
}

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  facts?: string[];
};

type BranchRecord = { id: string; name: string; status: string };
type TenantRecord = {
  id: string;
  company_id: string | null;
  branch_id: string;
  status: string;
  health: string | null;
  mrr_zar: number | null;
};
type SpaceRecord = { branch_id: string; status: string };
type InvoiceRecord = {
  tenant_id: string | null;
  amount_zar: number;
  status: string;
  paid_at: string | null;
};
type BranchData = {
  branches: BranchRecord[];
  tenants: TenantRecord[];
  offices: SpaceRecord[];
  desks: SpaceRecord[];
};

const money = (amount: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(amount);

function previousQuarterRange(now: Date) {
  const currentQuarterStartMonth = Math.floor(now.getUTCMonth() / 3) * 3;
  const start = new Date(Date.UTC(now.getUTCFullYear(), currentQuarterStartMonth - 3, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), currentQuarterStartMonth, 1));
  return { start, end };
}

export function AI({ embedded = false }: { embedded?: boolean } = {}) {
  const { role, canSeeRevenue, canSeeInvoiceStatus } = useRole();
  const suggestions =
    role.id === "branch-manager"
      ? branchManagerSuggestions
      : ["sales-manager", "crm-manager"].includes(role.id)
        ? salesManagerSuggestions
        : ceoSuggestions;
  const promptPlaceholder =
    role.id === "branch-manager"
      ? "Ask about your branch's spaces, tenants, or performance…"
      : ["sales-manager", "crm-manager"].includes(role.id)
        ? "Ask about CRM pipeline, branch performance, or tenant signals…"
        : "Ask about group performance, occupancy, risk, or revenue…";
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const conversationViewport = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length === 0 && !busy) return;
    const viewport = conversationViewport.current;
    if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const loadBranchData = async (): Promise<BranchData> => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Workspace data is not configured.");

    const branchResult = await supabase
      .from("branches")
      .select("id,name,status")
      .eq("status", "live")
      .order("name");
    if (branchResult.error) throw new Error(branchResult.error.message);

    let branches = (branchResult.data ?? []) as BranchRecord[];
    if (role.id === "branch-manager") {
      const branchIds = role.branchIds ?? [];
      branches = branches.filter((branch) =>
        branchIds.length
          ? branchIds.includes(branch.id)
          : branch.name.toLowerCase() === role.branch?.toLowerCase(),
      );
    }
    const branchIds = branches.map((branch) => branch.id);
    if (branches.length === 0) {
      return { branches, tenants: [], offices: [], desks: [] };
    }

    const [tenantResult, officeResult, deskResult] = await Promise.all([
      supabase
        .from("tenants")
        .select("id,company_id,branch_id,status,health,mrr_zar")
        .in("branch_id", branchIds),
      supabase
        .from("branch_offices")
        .select("branch_id,status")
        .neq("status", "inactive")
        .in("branch_id", branchIds),
      supabase
        .from("branch_desks")
        .select("branch_id,status")
        .neq("status", "inactive")
        .in("branch_id", branchIds),
    ]);
    const queryError = tenantResult.error ?? officeResult.error ?? deskResult.error;
    if (queryError) throw new Error(queryError.message);

    return {
      branches,
      tenants: (tenantResult.data ?? []) as TenantRecord[],
      offices: (officeResult.data ?? []) as SpaceRecord[],
      desks: (deskResult.data ?? []) as SpaceRecord[],
    };
  };

  const answerOccupancy = async () => {
    const { branches, offices, desks } = await loadBranchData();
    const rows = branches
      .map((branch) => {
        const spaces = [...offices, ...desks].filter((space) => space.branch_id === branch.id);
        const occupied = spaces.filter((space) => space.status === "occupied").length;
        return {
          branch,
          total: spaces.length,
          occupied,
          rate: spaces.length ? occupied / spaces.length : null,
        };
      })
      .filter((row) => row.rate !== null)
      .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0));

    if (!rows.length) {
      return {
        text: "I couldn't determine occupancy because there are no active office or desk inventory records in the branches available to your account.",
        facts: [],
      };
    }
    const highest = rows[0];
    const leaders = rows.filter((row) => row.rate === highest.rate);
    const leadersText = leaders
      .map(
        (row) =>
          `${row.branch.name} (${row.occupied}/${row.total}, ${Math.round((row.rate ?? 0) * 100)}%)`,
      )
      .join(", ");
    return {
      text: `Based on current office and desk inventory statuses, ${leaders.length > 1 ? "these branches are tied" : `${highest.branch.name} has the highest occupancy`}: ${leadersText}. This is occupied tracked spaces divided by non-inactive office and desk records.`,
      facts: rows
        .slice(0, 4)
        .map((row) => `${row.branch.name}: ${Math.round((row.rate ?? 0) * 100)}%`),
    };
  };

  const answerBranchPerformance = async () => {
    const { branches, tenants, offices, desks } = await loadBranchData();
    const { start, end } = previousQuarterRange(new Date());
    let paidInvoices: InvoiceRecord[] = [];
    let revenueNote =
      "Invoice revenue is not available to your role, so this answer uses tenant and inventory snapshots only.";

    if (canSeeInvoiceStatus) {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Workspace data is not configured.");
      const { data, error: invoiceError } = await supabase
        .from("invoices")
        .select("tenant_id,amount_zar,status,paid_at")
        .eq("status", "paid")
        .gte("paid_at", start.toISOString().slice(0, 10))
        .lt("paid_at", end.toISOString().slice(0, 10));
      if (invoiceError) throw new Error(invoiceError.message);
      paidInvoices = (data ?? []) as InvoiceRecord[];
      revenueNote =
        "Revenue is paid invoices recorded during the previous calendar quarter; tenant and inventory counts are current snapshots.";
    }

    const branchByTenant = new Map(tenants.map((tenant) => [tenant.id, tenant.branch_id]));
    const quarterStartLabel = start.toLocaleDateString("en-ZA", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    const quarterEndLabel = new Date(end.getTime() - 86400000).toLocaleDateString("en-ZA", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
    const rows = branches
      .map((branch) => {
        const branchTenants = tenants.filter(
          (tenant) => tenant.branch_id === branch.id && tenant.status === "active",
        );
        const branchSpaces = [...offices, ...desks].filter(
          (space) => space.branch_id === branch.id,
        );
        const occupied = branchSpaces.filter((space) => space.status === "occupied").length;
        const revenue = paidInvoices.reduce(
          (sum, invoice) =>
            invoice.tenant_id && branchByTenant.get(invoice.tenant_id) === branch.id
              ? sum + Number(invoice.amount_zar ?? 0)
              : sum,
          0,
        );
        return {
          branch,
          activeTenants: branchTenants.length,
          spaces: branchSpaces.length,
          occupied,
          revenue,
        };
      })
      .sort((a, b) => b.revenue - a.revenue || b.activeTenants - a.activeTenants);

    if (!rows.length) {
      return { text: "No live branch data is available for this account.", facts: [] };
    }
    const body = rows
      .map(
        (row) =>
          `${row.branch.name}: ${row.revenue ? money(row.revenue) : "no recorded collections"} collected, ${row.activeTenants} active tenants, ${row.occupied}/${row.spaces} office/desk spaces occupied`,
      )
      .join("; ");
    return {
      text: `Branch performance for ${quarterStartLabel}–${quarterEndLabel}: ${body}. ${revenueNote}`,
      facts: rows.slice(0, 4).map((row) => `${row.branch.name}: ${money(row.revenue)} collected`),
    };
  };

  const answerTenantRisk = async () => {
    const { branches, tenants } = await loadBranchData();
    const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));
    const flaggedHealth = tenants.filter((tenant) =>
      /(^|\b)(at[-_ ]?risk|risk|churn|critical|poor|watchlist)(\b|$)/i.test(tenant.health ?? ""),
    );
    let overdueByTenant = new Map<string, number>();
    if (canSeeInvoiceStatus) {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Workspace data is not configured.");
      const { data, error: invoiceError } = await supabase
        .from("invoices")
        .select("tenant_id,amount_zar,status")
        .eq("status", "overdue");
      if (invoiceError) throw new Error(invoiceError.message);
      overdueByTenant = new Map();
      for (const invoice of data ?? []) {
        if (!invoice.tenant_id) continue;
        overdueByTenant.set(
          invoice.tenant_id,
          (overdueByTenant.get(invoice.tenant_id) ?? 0) + Number(invoice.amount_zar ?? 0),
        );
      }
    }

    const atRisk = tenants.filter(
      (tenant) => flaggedHealth.includes(tenant) || overdueByTenant.has(tenant.id),
    );
    if (!atRisk.length) {
      const accessNote = canSeeInvoiceStatus
        ? " No overdue invoices or explicit tenant health risk flags were found."
        : " No explicit tenant health risk flags were found; invoice status is restricted for your role.";
      return {
        text: `I found no tenants marked with a churn-risk health flag.${accessNote}`,
        facts: [],
      };
    }

    const companyIds = [
      ...new Set(
        atRisk.map((tenant) => tenant.company_id).filter((id): id is string => Boolean(id)),
      ),
    ];
    const supabase = getSupabaseClient();
    const companyNames = new Map<string, string>();
    if (supabase && companyIds.length) {
      const { data, error: companyError } = await supabase
        .from("companies")
        .select("id,name")
        .in("id", companyIds);
      if (companyError) throw new Error(companyError.message);
      for (const company of data ?? []) companyNames.set(company.id, company.name);
    }
    const details = atRisk.slice(0, 12).map((tenant) => {
      const name = tenant.company_id ? companyNames.get(tenant.company_id) : null;
      const reasons = [
        flaggedHealth.includes(tenant) ? `health: ${tenant.health}` : "",
        overdueByTenant.has(tenant.id)
          ? `overdue invoices: ${money(overdueByTenant.get(tenant.id) ?? 0)}`
          : "",
      ]
        .filter(Boolean)
        .join(", ");
      return `${name ?? `Tenant ${tenant.id.slice(0, 8)}`} · ${branchNames.get(tenant.branch_id) ?? "Branch not assigned"} (${reasons})`;
    });
    return {
      text: `These tenant records have an explicit risk health flag and/or overdue invoices: ${details.join("; ")}.${atRisk.length > details.length ? ` ${atRisk.length - details.length} more records omitted.` : ""} This is a data-based risk signal, not a prediction of churn.`,
      facts: [
        `${atRisk.length} flagged tenant${atRisk.length === 1 ? "" : "s"}`,
        ...(canSeeInvoiceStatus ? [`${overdueByTenant.size} with overdue invoices`] : []),
      ],
    };
  };

  const answerCrmPipeline = async () => {
    const { branches } = await loadBranchData();
    if (!branches.length) {
      return { text: "No live branches are available to review the CRM pipeline.", facts: [] };
    }
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error("Workspace data is not configured.");
    const branchIds = branches.map((branch) => branch.id);
    const { data, error: leadsError } = await supabase
      .from("leads")
      .select("branch_id,stage,sales_stage,value_zar")
      .in("branch_id", branchIds);
    if (leadsError) throw new Error(leadsError.message);

    const records = (data ?? []) as Array<{
      branch_id: string;
      stage: string | null;
      sales_stage: string | null;
      value_zar: number | null;
    }>;
    if (!records.length) {
      return {
        text: "No CRM leads are recorded for the branches available to your account.",
        facts: [],
      };
    }

    const rows = branches
      .map((branch) => {
        const branchLeads = records.filter((lead) => lead.branch_id === branch.id);
        const stageOf = (lead: (typeof records)[number]) =>
          (lead.sales_stage || lead.stage || "new lead").toLowerCase().replace(/[_-]+/g, " ");
        const won = branchLeads.filter((lead) =>
          ["active tenant", "won"].includes(stageOf(lead)),
        ).length;
        const lost = branchLeads.filter((lead) => stageOf(lead) === "lost").length;
        const openLeads = branchLeads.filter(
          (lead) => !["active tenant", "won", "lost"].includes(stageOf(lead)),
        );
        const qualified = openLeads.filter((lead) =>
          /qualified|tour|proposal|negotiation|contract|onboarding/.test(stageOf(lead)),
        ).length;
        const pipelineValue = openLeads.reduce((sum, lead) => sum + Number(lead.value_zar ?? 0), 0);
        return {
          branch,
          total: branchLeads.length,
          open: openLeads.length,
          qualified,
          won,
          lost,
          pipelineValue,
        };
      })
      .filter((row) => row.total > 0)
      .sort((a, b) => b.open - a.open || a.branch.name.localeCompare(b.branch.name));

    if (!rows.length) {
      return {
        text: "No CRM leads are recorded for the branches available to your account.",
        facts: [],
      };
    }
    const summary = rows
      .map((row) => {
        const value = canSeeRevenue ? `, open value ${money(row.pipelineValue)}` : "";
        return `${row.branch.name}: ${row.total} total, ${row.open} open (${row.qualified} qualified), ${row.won} won, ${row.lost} lost${value}`;
      })
      .join("; ");
    return {
      text: `CRM pipeline from current lead records: ${summary}. Stages are read from the persisted CRM stage fields; open value is shown only when your role has revenue access.`,
      facts: rows.slice(0, 4).map((row) => `${row.branch.name}: ${row.open} open leads`),
    };
  };

  const answerRevenueRunRate = async () => {
    if (!canSeeRevenue) {
      return {
        text: "Revenue data is restricted for your role. I can answer questions about office and desk occupancy instead.",
        facts: [],
      };
    }
    const { branches, tenants } = await loadBranchData();
    const rows = branches.map((branch) => ({
      branch,
      monthly: tenants
        .filter((tenant) => tenant.branch_id === branch.id && tenant.status === "active")
        .reduce((sum, tenant) => sum + Number(tenant.mrr_zar ?? 0), 0),
    }));
    const total = rows.reduce((sum, row) => sum + row.monthly, 0);
    if (!tenants.some((tenant) => tenant.status === "active")) {
      return {
        text: "There are no active tenant records available to calculate a revenue run-rate estimate.",
        facts: [],
      };
    }
    const nextMonth = new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric" }).format(
      new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
    );
    return {
      text: `Using current active tenant MRR as a flat run-rate, next month's estimated recurring revenue is ${money(total)} for ${nextMonth}. This is not a forecast: it excludes changes in occupancy, new leases, churn, discounts, and unpaid invoices.`,
      facts: rows
        .filter((row) => row.monthly > 0)
        .sort((a, b) => b.monthly - a.monthly)
        .slice(0, 4)
        .map((row) => `${row.branch.name}: ${money(row.monthly)}/mo`),
    };
  };

  const generateAnswer = async (question: string) => {
    const normalized = question.toLowerCase();
    if (/pipeline|crm|sales lead|lead stage|qualified|deal flow/.test(normalized))
      return answerCrmPipeline();
    if (/occupancy|occupied|vacan|highest.*branch|which branch/.test(normalized))
      return answerOccupancy();
    if (/churn|at[- ]?risk|tenant risk|risk.*tenant/.test(normalized)) return answerTenantRisk();
    if (/revenue|forecast|project|run.?rate|income/.test(normalized)) return answerRevenueRunRate();
    if (/branch|performance|quarter|last three months/.test(normalized))
      return answerBranchPerformance();
    return {
      text: "I can answer using current branch inventory, tenant health, invoice, and recurring-revenue records. Try asking about branch performance, office/desk occupancy, tenant churn risk, or next month's recurring-revenue run-rate.",
      facts: [],
    };
  };

  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || busy) return;
    setError("");
    setInput("");
    setBusy(true);
    const requestId = `${Date.now()}`;
    setMessages((current) => [
      ...current,
      { id: `${requestId}-user`, role: "user", text: trimmed },
    ]);
    try {
      const answer = await generateAnswer(trimmed);
      setMessages((current) => [
        ...current,
        { id: `${requestId}-assistant`, role: "assistant", ...answer },
      ]);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Unable to read the requested platform data.";
      setError(message);
      setMessages((current) => [
        ...current,
        {
          id: `${requestId}-assistant`,
          role: "assistant",
          text: `I couldn't retrieve the live data for that question: ${message}`,
          facts: [],
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void ask(input);
  };

  return (
    <div className={embedded ? "flex h-full min-h-0 flex-col" : "mx-auto max-w-275"}>
      {!embedded && (
        <PageHeader
          eyebrow="AI & Automation"
          title="WorkspaceOS Assistant"
          description="Ask about live branch inventory, tenant health, invoice collections, and recurring revenue. Answers use records your account can access."
        />
      )}
      {embedded && (
        <div className="shrink-0 border-b px-4 py-3">
          <div className="font-display text-sm font-semibold">WorkspaceOS assistant</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {role.id === "group-ceo"
              ? "Group portfolio insights"
              : role.id === "branch-manager"
                ? `${role.branch ?? "Branch"} operations insights`
                : "Sales and CRM insights"}
          </p>
        </div>
      )}
      <div
        className={
          embedded
            ? "flex min-h-0 flex-1 flex-col p-4"
            : "card-soft flex min-h-[60vh] flex-col p-6 md:p-8"
        }
      >
        <div
          ref={conversationViewport}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto"
          aria-live="polite"
        >
          {messages.length === 0 ? (
            <div className="grid min-h-56 place-items-center text-center">
              <div className="max-w-md">
                <div className="mx-auto mb-3 grid size-11 place-items-center rounded-lg bg-primary text-primary-foreground">
                  <Sparkles className="size-5" />
                </div>
                <h2 className="font-display text-lg font-semibold">
                  Ask about current platform data
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {role.id === "group-ceo"
                    ? "Review live group-wide performance, portfolio risks, and CRM pipeline across every branch."
                    : role.id === "branch-manager"
                      ? `Ask about live operations, occupancy, and tenant health for ${role.branch ?? "your assigned branch"}.`
                      : "Review live sales pipeline, branch performance, and tenant signals across the group."}
                </p>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === "user" ? "justify-end" : ""}`}
              >
                {message.role === "assistant" && (
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
                    <Sparkles className="size-4" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 ${message.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/50"}`}
                >
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p>
                  {(message.facts?.length ?? 0) > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {message.facts?.map((fact) => (
                        <Badge key={fact} variant="outline" className="bg-card text-[10px]">
                          {fact}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Reading live platform data…
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="mt-3 shrink-0 border-t px-4 pb-4 pt-3">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Quick analysis
          </div>
          <Select value="" onValueChange={(question) => void ask(question)} disabled={busy}>
            <SelectTrigger
              className="mb-3 h-9 w-full bg-background text-xs"
              aria-label="Choose a quick analysis"
            >
              <SelectValue placeholder="Choose an analysis…" />
            </SelectTrigger>
            <SelectContent position="popper" side="top" align="start">
              {suggestions.map((suggestion) => (
                <SelectItem key={suggestion.text} value={suggestion.text}>
                  {suggestion.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <form onSubmit={submit} className="flex gap-2">
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={promptPlaceholder}
              className="h-11 bg-card"
              aria-label="Ask WorkspaceOS Assistant"
              disabled={busy}
            />
            <Button
              type="submit"
              size="icon"
              className="h-11 w-11 shrink-0"
              disabled={busy || !input.trim()}
              aria-label="Send question"
            >
              {busy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
