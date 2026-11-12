import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { LoaderCircle, Mail, MessageSquare, RotateCcw, Save, ChevronRight, User, Building2, Calendar, FileText, ArrowRight, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { useRole } from "@/lib/role-context";
import { getSupabaseClient } from "@/lib/supabase";
import { toast } from "sonner";
import { SalesAnalyticsDashboard } from "@/components/SalesAnalyticsDashboard";

export const Route = createFileRoute("/crm")({
  head: () => ({ meta: [{ title: "CRM & Sales — WorkspaceOS" }] }),
  component: CrmRoute,
});

function CrmRoute() {
  const { role } = useRole();
  return role.id === "group-ceo" ? <SalesAnalyticsDashboard /> : <CRM />;
}

type LeadRecord = {
  id: string;
  company: string;
  contact: string;
  source: string;
  stage: string;
  value: number;
  score: number;
  branch: string;
  owner: string;
  organizationId?: string | null;
  opportunityType?: "workspace" | "event" | "other";
  tourAt?: string | null;
  email?: string;
  phone?: string;
  submittedAt?: string;
  stageHistory?: { id: string; from_stage: string | null; to_stage: string; created_at: string }[];
};

function isOpportunityType(value: string): value is NonNullable<LeadRecord["opportunityType"]> {
  return value === "workspace" || value === "event" || value === "other";
}

type OutreachActivity = {
  id: string;
  recipient_email: string;
  company_name: string | null;
  subject: string;
  status: string;
  callback_preference: "yes" | "no" | "unspecified";
  sent_at: string | null;
  replied_at: string | null;
  created_at: string;
};

type CrmEmailTemplate = {
  id: string;
  name: string;
  trigger_label: string;
  description: string;
  subject: string;
  body: string;
  enabled: boolean;
  sort_order: number;
  updated_at: string;
  updated_by: string | null;
};

type TemplateDraft = Pick<CrmEmailTemplate, "name" | "subject" | "body" | "enabled">;

const EMPTY_LEADS: LeadRecord[] = [];
const EMPTY_TEMPLATES: CrmEmailTemplate[] = [];

const stages = [
  "New Lead", "Contacted", "Qualified", "Tour Scheduled", "Proposal Sent",
  "Negotiation", "Contract Sent", "Contract Signed", "Onboarding", "Active Tenant", "Lost",
] as const;

const leadActionStages = [
  "Proposal Sent",
  "Negotiation",
  "Contract Sent",
  "Contract Signed",
  "Onboarding",
] as const;

const formatZAR = (amount: number) => new Intl.NumberFormat("en-ZA", {
  style: "currency", currency: "ZAR", maximumFractionDigits: 0,
}).format(amount);

const LEADS_PER_PAGE = 10;
const CRM_CACHE_TIME = 10 * 60 * 1000;
const CRM_CACHE_GC_TIME = 30 * 60 * 1000;
const crmTemplatesQueryKey = ["crm", "email-templates"] as const;

// --- Template Manager ---
function EmailTemplateManager() {
  const queryClient = useQueryClient();
  const templatesQuery = useQuery({
    queryKey: crmTemplatesQueryKey,
    queryFn: async () => {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured.");
      const { data, error } = await supabase
        .from("crm_email_templates")
        .select("*")
        .order("sort_order");
      if (error) throw new Error(error.message);
      return (data ?? []) as CrmEmailTemplate[];
    },
    staleTime: CRM_CACHE_TIME,
    gcTime: CRM_CACHE_GC_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const templates = templatesQuery.data ?? EMPTY_TEMPLATES;
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    templates[0]?.id ?? null,
  );
  const [draft, setDraft] = useState<TemplateDraft | null>(() => {
    const first = templates[0];
    return first
      ? { name: first.name, subject: first.subject, body: first.body, enabled: first.enabled }
      : null;
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedTemplateId || !templates.length) return;
    const first = templates[0];
    setSelectedTemplateId(first.id);
    setDraft({ name: first.name, subject: first.subject, body: first.body, enabled: first.enabled });
  }, [selectedTemplateId, templates]);

  const loading = templatesQuery.isLoading;
  const loadError = templatesQuery.error instanceof Error
    ? templatesQuery.error.message
    : templatesQuery.error
      ? "Could not load CRM email templates."
      : null;

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;
  const hasChanges = Boolean(selectedTemplate && draft && (
    selectedTemplate.name !== draft.name || selectedTemplate.subject !== draft.subject ||
    selectedTemplate.body !== draft.body || selectedTemplate.enabled !== draft.enabled
  ));

  const selectTemplate = (template: CrmEmailTemplate) => {
    if (hasChanges) { toast.error("Save or discard your edits before switching templates."); return; }
    setSelectedTemplateId(template.id);
    setDraft({ name: template.name, subject: template.subject, body: template.body, enabled: template.enabled });
  };

  const discardChanges = () => {
    if (!selectedTemplate) return;
    setDraft({ name: selectedTemplate.name, subject: selectedTemplate.subject, body: selectedTemplate.body, enabled: selectedTemplate.enabled });
  };

  const saveTemplate = async () => {
    if (!selectedTemplate || !draft) return;
    const supabase = getSupabaseClient();
    if (!supabase) { toast.error("Supabase is not configured."); return; }
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase.from("crm_email_templates").update({
          ...draft, updated_at: new Date().toISOString(), updated_by: userData.user?.id ?? null,
        }).eq("id", selectedTemplate.id).select("*").single();
      if (error) throw new Error(error.message);
      const updated = data as CrmEmailTemplate;
      queryClient.setQueryData<CrmEmailTemplate[]>(crmTemplatesQueryKey, (current) =>
        current?.map((template) => template.id === updated.id ? updated : template) ?? [updated],
      );
      setDraft({ name: updated.name, subject: updated.subject, body: updated.body, enabled: updated.enabled });
      toast.success("Email template saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this template.");
    } finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-24 text-muted-foreground"><LoaderCircle className="mr-2 size-5 animate-spin" />Loading templates</div>;
  if (loadError) return <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">Could not load templates: {loadError}</div>;
  if (!templates.length || !selectedTemplate || !draft) return <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">No CRM email templates available.</div>;

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[20rem_minmax(0,1fr)] h-[calc(100vh-14rem)]">
      <aside className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b bg-muted/20 px-4 py-3">
          <h2 className="text-sm font-semibold">Template Library</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{templates.length} templates</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {templates.map((template) => (
            <button key={template.id} type="button" onClick={() => selectTemplate(template)}
              className={`flex w-full flex-col gap-1 border-b px-4 py-3 text-left transition-colors hover:bg-muted/40 ${template.id === selectedTemplate.id ? "bg-muted/50 border-l-4 border-l-primary" : "border-l-4 border-l-transparent"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{template.name}</span>
                <Badge variant={template.enabled ? "secondary" : "outline"} className={template.enabled ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : ""}>
                  {template.enabled ? "Active" : "Paused"}
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground truncate">{template.trigger_label}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b bg-muted/20 px-6 py-4 flex items-start gap-3">
          <Mail className="mt-0.5 size-5 text-primary" />
          <div>
            <h2 className="text-base font-semibold">{selectedTemplate.trigger_label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{selectedTemplate.description}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid gap-5">
            <div className="grid gap-2">
              <Label>Template Name</Label>
              <Input value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="max-w-md bg-background" />
            </div>
            <div className="grid gap-2">
              <Label>Email Subject</Label>
              <Input value={draft.subject} maxLength={200} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} className="max-w-2xl bg-background" />
            </div>
            <div className="grid gap-2">
              <Label>Email Message</Label>
              <Textarea value={draft.body} maxLength={5000} rows={12} onChange={(e) => setDraft({ ...draft, body: e.target.value })} className="font-normal bg-background resize-y min-h-[300px]" />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} className="size-4 rounded border-gray-300 text-primary focus:ring-primary" />
              Enable this template for automated sending
            </label>
            <div className="rounded-lg bg-blue-50/50 p-3 border border-blue-100 text-xs text-blue-800">
              <span className="font-semibold">Available Fields:</span> <span className="font-mono">{"{{contact_name}}, {{company_name}}, {{branch_name}}, {{available_spaces}}, {{availability_checked_at}}, {{reply_summary}}, {{tour_date}}, {{tour_time}}, {{tour_location}}, {{proposal_link}}, {{contract_link}}, {{onboarding_link}}"}</span>
            </div>
          </div>

          <div className="border-t pt-6">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Live Preview</h3>
            <div className="rounded-xl border bg-slate-50 p-5 shadow-inner">
              <p className="border-b pb-3 mb-3"><span className="font-semibold text-slate-500">Subject:</span> <span className="font-medium text-slate-900">{draft.subject}</span></p>
              <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">{draft.body}</pre>
            </div>
          </div>
        </div>

        <div className="border-t bg-muted/20 px-6 py-4 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {hasChanges ? <span className="text-amber-600 font-medium">Unsaved changes</span> : `Last saved ${new Date(selectedTemplate.updated_at).toLocaleString()}`}
          </p>
          <div className="flex gap-2">
            {hasChanges && <Button type="button" variant="outline" size="sm" onClick={discardChanges} disabled={saving}><RotateCcw className="mr-2 size-4" />Discard</Button>}
            <Button type="button" size="sm" onClick={() => void saveTemplate()} disabled={!hasChanges || saving || !draft.name.trim() || !draft.subject.trim() || !draft.body.trim()}>
              {saving ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
              {saving ? "Saving" : "Save Template"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Recent Outreach ---
function RecentOutreachActivity() {
  const { role } = useRole();
  const outreachQuery = useQuery({
    queryKey: [
      "crm",
      "recent-outreach",
      role.id,
      role.user,
      (role.branchIds ?? []).slice().sort().join(","),
    ],
    queryFn: async () => {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured.");
      const { data, error } = await supabase
        .from("outreach_deliveries")
        .select("id,recipient_email,company_name,subject,status,callback_preference,sent_at,replied_at,created_at")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw new Error(error.message);
      return (data ?? []) as OutreachActivity[];
    },
    staleTime: CRM_CACHE_TIME,
    gcTime: CRM_CACHE_GC_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const activity = outreachQuery.data ?? [];

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b bg-muted/20 px-5 py-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <MessageSquare className="size-4 text-muted-foreground" />
          Recent Outreach
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Refresh recent outreach"
          onClick={() => void outreachQuery.refetch()}
          disabled={outreachQuery.isFetching}
        >
          <RefreshCw className={`size-4 ${outreachQuery.isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {outreachQuery.error && outreachQuery.data && (
        <p role="alert" className="border-b bg-destructive/5 px-5 py-3 text-xs text-destructive">
          Could not load recent outreach:{" "}
          {outreachQuery.error instanceof Error
            ? outreachQuery.error.message
            : "Please try again."}
        </p>
      )}
      {outreachQuery.isLoading ? (
        <div className="flex items-center justify-center gap-2 px-5 py-6 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Loading recent outreach
        </div>
      ) : outreachQuery.error && !outreachQuery.data ? (
        <p className="px-5 py-6 text-sm text-muted-foreground text-center">
          Recent outreach could not be loaded.
        </p>
      ) : activity.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground text-center">No recent outreach activity.</p>
      ) : (
        <div className="divide-y">
          {activity.map((delivery) => {
            const statusLabel = delivery.status === "replied" && delivery.callback_preference === "yes" ? "Call requested" : delivery.status === "unsubscribed" ? "Unsubscribed" : delivery.status === "sent" ? "Awaiting response" : delivery.status;
            return (
              <div key={delivery.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-3 hover:bg-muted/30 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{delivery.company_name || delivery.recipient_email}</p>
                  <p className="truncate text-xs text-muted-foreground">{delivery.subject}</p>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant={delivery.status === "replied" ? "default" : delivery.status === "unsubscribed" ? "outline" : "secondary"} className={delivery.status === "replied" ? "bg-emerald-600 hover:bg-emerald-700" : ""}>
                    {statusLabel}
                  </Badge>
                  <time className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">
                    {new Date(delivery.replied_at ?? delivery.sent_at ?? delivery.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </time>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const stageToDatabase: Record<(typeof stages)[number], string> = {
  "New Lead": "new_lead",
  Contacted: "contacted",
  Qualified: "qualified",
  "Tour Scheduled": "tour_scheduled",
  "Proposal Sent": "proposal_sent",
  Negotiation: "negotiation",
  "Contract Sent": "negotiation",
  "Contract Signed": "negotiation",
  Onboarding: "negotiation",
  "Active Tenant": "won",
  Lost: "lost",
};

const stageFromDatabase: Record<string, (typeof stages)[number]> = {
  new_lead: "New Lead",
  contacted: "Contacted",
  qualified: "Qualified",
  tour_scheduled: "Tour Scheduled",
  proposal_sent: "Proposal Sent",
  negotiation: "Negotiation",
  won: "Active Tenant",
  lost: "Lost",
};

type CrmOrganization = { id: string; name: string };
type CrmBranch = { id: string; name: string };
type CrmDashboardData = {
  leads: LeadRecord[];
  organizations: CrmOrganization[];
  branches: CrmBranch[];
};

// --- Main CRM Component ---
function CRM() {
  const { canSeeRevenue, canAccessUrl, role } = useRole();
  const queryClient = useQueryClient();
  const canManageTemplates = ["crm-manager", "sales-manager", "group-admin", "group-ceo", "superadmin"].includes(role.id);
  const crmQueryKey = [
    "crm",
    "pipeline",
    role.id,
    role.user,
    (role.branchIds ?? []).slice().sort().join(","),
  ] as const;
  const [activeView, setActiveView] = useState<"pipeline" | "templates">("pipeline");
  const [selectedLead, setSelectedLead] = useState<LeadRecord | null>(null);
  const [selectedStage, setSelectedStage] = useState<(typeof stages)[number]>(stages[0]);
  const [leadPage, setLeadPage] = useState(1);

  // Lease Dialog State
  const [leaseDialogOpen, setLeaseDialogOpen] = useState(false);
  const [leaseBranchId, setLeaseBranchId] = useState("");
  const [leaseTier, setLeaseTier] = useState("");
  const [leasePlan, setLeasePlan] = useState("");
  const [leaseDesks, setLeaseDesks] = useState("0");
  const [leaseMrr, setLeaseMrr] = useState("0");
  const [leaseSince, setLeaseSince] = useState(new Date().toISOString().slice(0, 10));
  const [leaseSignedAt, setLeaseSignedAt] = useState(new Date().toISOString().slice(0, 10));
  const [savingLease, setSavingLease] = useState(false);

  const crmQuery = useQuery<CrmDashboardData>({
    queryKey: crmQueryKey,
    queryFn: async () => {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error("Supabase is not configured.");

      const fetchAllLeads = async () => {
        const pageSize = 500;
        const rows = [];
        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await supabase
            .from("leads")
            .select("id,company_name,contact_name,contact_email,contact_phone,source,stage,sales_stage,value_zar,score,branch_id,organization_id,opportunity_type,tour_at,branches!leads_branch_id_fkey(name)")
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(offset, offset + pageSize - 1);
          if (error) throw new Error(error.message);
          const page = data ?? [];
          rows.push(...page);
          if (page.length < pageSize) return rows;
        }
      };

      const [leadRows, activityResult, organizationResult, branchResult] = await Promise.all([
        fetchAllLeads(),
        supabase.from("lead_activities").select("id,lead_id,from_stage,to_stage,created_at").order("created_at", { ascending: false }),
        supabase.from("organizations").select("id,name").order("name"),
        supabase.from("branches").select("id,name").eq("status", "live").order("name"),
      ]);
      if (activityResult.error) throw new Error(activityResult.error.message);
      if (organizationResult.error) throw new Error(organizationResult.error.message);
      if (branchResult.error) throw new Error(branchResult.error.message);

      const branchNames = new Map((branchResult.data ?? []).map((b) => [b.id, b.name]));
      const activitiesByLead = new Map<string, NonNullable<LeadRecord["stageHistory"]>>();
      for (const activity of activityResult.data ?? []) {
        const history = activitiesByLead.get(activity.lead_id) ?? [];
        history.push(activity);
        activitiesByLead.set(activity.lead_id, history);
      }

      const leads = leadRows.map((record) => {
        const stage = stages.find((item) => item === record.sales_stage)
          ?? stageFromDatabase[record.stage]
          ?? "New Lead";
        return {
          id: record.id, company: record.company_name, contact: record.contact_name ?? "Contact not provided",
          email: record.contact_email ?? undefined, phone: record.contact_phone ?? undefined,
          source: record.source ?? "Sales team", stage, value: record.value_zar ?? 0, score: record.score ?? 0,
          branch: record.branch_id ? branchNames.get(record.branch_id) ?? "Branch not set" : "Branch not set",
          owner: "Sales team", organizationId: record.organization_id, opportunityType: record.opportunity_type ?? "workspace",
          tourAt: record.tour_at, stageHistory: activitiesByLead.get(record.id) ?? [],
        };
      });

      return {
        leads,
        organizations: (organizationResult.data ?? []) as CrmOrganization[],
        branches: (branchResult.data ?? []) as CrmBranch[],
      };
    },
    staleTime: CRM_CACHE_TIME,
    gcTime: CRM_CACHE_GC_TIME,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const crmLeads = crmQuery.data?.leads ?? EMPTY_LEADS;
  const organizations = crmQuery.data?.organizations ?? [];
  const branches = crmQuery.data?.branches ?? [];
  const leadsLoading = crmQuery.isLoading;
  const leadsError = crmQuery.error instanceof Error ? crmQuery.error.message : "";

  const updateCachedLead = (updatedLead: LeadRecord) => {
    queryClient.setQueryData<CrmDashboardData>(crmQueryKey, (current) =>
      current
        ? {
            ...current,
            leads: current.leads.map((lead) =>
              lead.id === updatedLead.id ? updatedLead : lead,
            ),
          }
        : current,
    );
  };

  const byStage = useMemo(() => stages.map((s) => ({ stage: s, items: crmLeads.filter((l) => l.stage === s) })), [crmLeads]);
  const totalPipe = useMemo(() => crmLeads.reduce((sum, lead) => sum + (lead.value ?? 0), 0), [crmLeads]);
  const selectedStageLeads = byStage.find((col) => col.stage === selectedStage)?.items ?? [];
  const leadPageCount = Math.max(1, Math.ceil(selectedStageLeads.length / LEADS_PER_PAGE));
  const currentLeadPage = Math.min(leadPage, leadPageCount);
  const paginatedStageLeads = selectedStageLeads.slice(
    (currentLeadPage - 1) * LEADS_PER_PAGE,
    currentLeadPage * LEADS_PER_PAGE,
  );
  const activeLeadCount = crmLeads.filter((l) => !["Active Tenant", "Lost"].includes(l.stage)).length;

  useEffect(() => {
    setLeadPage((currentPage) => Math.min(currentPage, leadPageCount));
  }, [leadPageCount]);

  const updateLead = async (leadId: string, targetStage: (typeof stages)[number]) => {
    const existing = crmLeads.find((l) => l.id === leadId);
    const supabase = getSupabaseClient();
    if (!existing || !supabase) return;

    const updatedLead = { ...existing, stage: targetStage, stageHistory: [{ id: `pending-${Date.now()}`, from_stage: existing.stage, to_stage: targetStage, created_at: new Date().toISOString() }, ...(existing.stageHistory ?? [])] };
    const { error } = await supabase.from("leads").update({ sales_stage: updatedLead.stage, stage: stageToDatabase[updatedLead.stage] }).eq("id", leadId);
    if (error) { toast.error(error.message); return; }

    updateCachedLead(updatedLead);
    setSelectedLead((current) => current?.id === leadId ? updatedLead : current);
  };

  const updateOpportunityType = async (opportunityType: "workspace" | "event" | "other") => {
    if (!selectedLead) return;
    const supabase = getSupabaseClient(); if (!supabase) return;
    const { error } = await supabase.from("leads").update({ opportunity_type: opportunityType }).eq("id", selectedLead.id);
    if (error) { toast.error(error.message); return; }
    const updatedLead = { ...selectedLead, opportunityType };
    setSelectedLead(updatedLead);
    updateCachedLead(updatedLead);
  };

  const linkOrganization = async (organizationId: string) => {
    if (!selectedLead) return;
    const supabase = getSupabaseClient(); if (!supabase) return;
    const { error } = await supabase.rpc("link_lead_to_organization", { p_lead_id: selectedLead.id, p_organization_id: organizationId });
    if (error) { toast.error(error.message); return; }
    const updatedLead = { ...selectedLead, organizationId };
    setSelectedLead(updatedLead);
    updateCachedLead(updatedLead);
    toast.success("Organization linked.");
  };

  const activateTenant = () => {
    if (!selectedLead) return;
    if (!selectedLead.organizationId) { toast.error("Link the registered organization before recording its lease."); return; }
    if (!branches.some((b) => b.id === leaseBranchId)) {
      const leadBranch = branches.find((b) => b.name === selectedLead.branch);
      setLeaseBranchId(leadBranch?.id ?? branches[0]?.id ?? "");
    }
    setLeaseDialogOpen(true);
  };

  const saveLease = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedLead || !leaseTier) return;
    const supabase = getSupabaseClient(); if (!supabase) return;
    setSavingLease(true);
    const { error } = await supabase.rpc("activate_lead_as_tenant", {
      p_lead_id: selectedLead.id, p_branch_id: leaseBranchId || null, p_tier: leaseTier,
      p_plan_name: leasePlan.trim() || null, p_desks: Number(leaseDesks), p_mrr_zar: Number(leaseMrr),
      p_since: leaseSince, p_lease_signed_at: leaseSignedAt,
    });
    setSavingLease(false);
    if (error) { toast.error(error.message); return; }
    const activatedLead = { ...selectedLead, stage: "Active Tenant" as const };
    setSelectedLead(activatedLead);
    updateCachedLead(activatedLead);
    setLeaseDialogOpen(false);
    toast.success("Signed lease recorded and tenant activated.");
  };

  if (activeView === "pipeline" && leadsLoading) {
    return (
      <div className="mx-auto max-w-[1400px]">
        <PageHeader eyebrow="CRM & Sales Automation" title="Pipeline" description="Registered enquiries and tour requests." />
        <div className="flex justify-center py-24">
          <LoaderCircle className="size-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }
  if (activeView === "pipeline" && leadsError && !crmQuery.data) {
    return (
      <div className="mx-auto max-w-[1400px]">
        <PageHeader eyebrow="CRM & Sales Automation" title="Pipeline" description="Registered enquiries and tour requests." />
        <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          CRM records unavailable: {leadsError}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-12">
      <PageHeader
        eyebrow="CRM & Sales Automation"
        title={activeView === "templates" ? "Email Templates" : "Sales Pipeline"}
        description={activeView === "templates" ? "Manage shared email copy for prospect discovery and sales follow-up." : "Track registered enquiries and tour requests through qualification, contract, and activation."}
        actions={
          activeView === "pipeline" || canAccessUrl("/messaging") ? (
            <div className="flex flex-wrap gap-2">
              {activeView === "pipeline" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void crmQuery.refetch()}
                  disabled={crmQuery.isFetching}
                >
                  <RefreshCw className={`mr-2 size-4 ${crmQuery.isFetching ? "animate-spin" : ""}`} />
                  Refresh data
                </Button>
              )}
              {canAccessUrl("/messaging") && (
                <Button asChild size="sm" variant="outline" className="bg-white">
                  <Link to="/messaging">
                    <MessageSquare className="mr-2 size-4" />
                    Messages
                  </Link>
                </Button>
              )}
            </div>
          ) : undefined
        }
      />

      {canManageTemplates && (
        <div className="flex gap-1 border-b pb-2">
          <Button type="button" variant={activeView === "pipeline" ? "secondary" : "ghost"} onClick={() => setActiveView("pipeline")} className="rounded-full">Pipeline</Button>
          <Button type="button" variant={activeView === "templates" ? "secondary" : "ghost"} onClick={() => setActiveView("templates")} className="rounded-full">Email Templates</Button>
        </div>
      )}

      {activeView === "templates" && canManageTemplates ? (
        <EmailTemplateManager />
      ) : (
        <>
          {leadsError && (
            <div role="alert" className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm">
              Showing cached CRM data. The latest refresh failed: {leadsError}
            </div>
          )}

          {/* Metrics Bar */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mb-4">
            <StatCard
              label={canSeeRevenue ? "Pipeline value" : "Open opportunities"}
              value={canSeeRevenue ? formatZAR(totalPipe) : String(activeLeadCount)}
              hint={`${crmLeads.length} registered leads`}
              accent="brand"
            />
            <StatCard label="Active leads" value={String(activeLeadCount)} hint="Not yet activated" />
            <StatCard
              label="Qualified"
              value={String(crmLeads.filter(l => ["Qualified", "Tour Scheduled", "Proposal Sent", "Negotiation", "Contract Sent", "Contract Signed"].includes(l.stage)).length)}
              hint="Tour through contract"
              accent="success"
            />
            <StatCard
              label="Stages in use"
              value={`${byStage.filter(c => c.items.length > 0).length} / ${stages.length}`}
              hint="Based on current leads"
            />
          </div>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <main className="min-w-0 space-y-6">

          {/* KANBAN BOARD - The Core Element */}
          <div className="rounded-xl border bg-card shadow-sm overflow-hidden flex flex-col">
            <div className="border-b bg-muted/20 px-4 py-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold flex items-center gap-2">Lead Journey</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Click any stage to view and manage its active leads.</p>
              </div>
              <Badge variant="outline" className="bg-background">{crmLeads.length} leads</Badge>
            </div>

            <div className="p-4 overflow-x-auto flex-1">
              <div className="flex gap-3 min-w-max pb-2">
                {byStage.map((column, index) => {
                  const isSelected = selectedStage === column.stage;
                  const hasLeads = column.items.length > 0;

                  return (
                    <button
                      key={column.stage}
                      onClick={() => {
                        setSelectedStage(column.stage);
                        setLeadPage(1);
                      }}
                      className={`flex flex-col w-[160px] shrink-0 rounded-xl border-2 text-left transition-all ${
                        isSelected
                          ? "border-primary bg-primary/5 shadow-md scale-[1.02]"
                          : "border-transparent bg-muted/40 hover:bg-muted/80"
                      }`}
                    >
                      {/* Kanban Header */}
                      <div className={`px-3 py-2.5 border-b ${isSelected ? "border-primary/20" : "border-border"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-semibold truncate ${isSelected ? "text-primary" : "text-muted-foreground"}`}>
                            {column.stage}
                          </span>
                          <span className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                            hasLeads ? (isSelected ? "bg-primary text-primary-foreground" : "bg-slate-300 text-slate-700") : "bg-slate-200 text-slate-400"
                          }`}>
                            {column.items.length}
                          </span>
                        </div>
                      </div>

                      {/* Kanban Body - Visual preview */}
                      <div className="px-3 py-2 flex-1 flex flex-col justify-center">
                        <span className="text-[11px] text-muted-foreground">
                          {hasLeads ? `${column.items.length} lead${column.items.length > 1 ? 's' : ''}` : "No leads"}
                        </span>
                        {hasLeads && canSeeRevenue && (
                          <span className="text-xs font-semibold text-emerald-600 mt-1">
                            {formatZAR(column.items.reduce((s, l) => s + (l.value ?? 0), 0))}
                          </span>
                        )}
                      </div>

                      {/* Decorative connector */}
                      {index !== byStage.length - 1 && (
                        <div className="hidden absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2">
                          <ChevronRight className="size-3 text-muted-foreground/30" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Selected Stage Leads List */}
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b bg-muted/20 px-6 py-4">
              <div>
                <h2 className="text-base font-semibold flex items-center gap-2">
                  {selectedStage} <Badge variant="secondary">{selectedStageLeads.length}</Badge>
                </h2>
                <p className="text-xs text-muted-foreground mt-1">Manage and advance leads currently in this stage.</p>
              </div>
            </div>

            {selectedStageLeads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="rounded-full bg-muted p-4 mb-3">
                  <User className="size-6 text-muted-foreground/60" />
                </div>
                <p className="text-sm font-medium text-foreground">No leads in {selectedStage}</p>
                <p className="mt-1 text-xs text-muted-foreground max-w-sm">Real tour requests will appear here when submitted. Discovered businesses remain in Leads Intelligence.</p>
              </div>
            ) : (
              <div className="divide-y">
                {paginatedStageLeads.map((lead) => (
                  <button key={lead.id} type="button" onClick={() => setSelectedLead(lead)} className="flex w-full flex-wrap items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-muted/30 group">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-foreground">{lead.company}</p>
                        {lead.opportunityType === "event" && <Badge variant="outline" className="text-[10px]">Event</Badge>}
                      </div>
                      <p className="truncate text-xs text-muted-foreground mt-0.5">{lead.contact} · {lead.source}</p>
                    </div>
                    <div className="hidden sm:flex items-center gap-6 text-sm">
                      <span className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="size-3" />{lead.branch}</span>
                      <span className="font-medium tabular-nums text-foreground">{lead.value ? formatZAR(lead.value) : "—"}</span>
                      <Badge variant="secondary" className="font-mono">Score {lead.score}</Badge>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </button>
                ))}
              </div>
            )}
            {selectedStageLeads.length > LEADS_PER_PAGE && (
              <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="text-xs text-muted-foreground">
                  Showing {(currentLeadPage - 1) * LEADS_PER_PAGE + 1}–
                  {Math.min(currentLeadPage * LEADS_PER_PAGE, selectedStageLeads.length)} of{" "}
                  {selectedStageLeads.length} leads
                </p>
                <nav aria-label="CRM lead pages" className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setLeadPage(currentLeadPage - 1)}
                    disabled={currentLeadPage === 1}
                  >
                    Previous
                  </Button>
                  <span
                    aria-live="polite"
                    className="min-w-20 text-center text-xs text-muted-foreground"
                  >
                    Page {currentLeadPage} of {leadPageCount}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setLeadPage(currentLeadPage + 1)}
                    disabled={currentLeadPage === leadPageCount}
                  >
                    Next
                  </Button>
                </nav>
              </div>
            )}
          </div>
            </main>
            {["crm-manager", "sales-manager", "group-admin", "group-ceo"].includes(role.id) && (
              <aside className="min-w-0 xl:sticky xl:top-4">
                <RecentOutreachActivity />
              </aside>
            )}
          </div>
        </>
      )}

      {/* Lead Details Modal */}
      <Dialog open={selectedLead !== null} onOpenChange={(open) => !open && setSelectedLead(null)}>
        <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden">
          {selectedLead && (
            <>
              <div className="border-b bg-muted/20 px-6 py-5 flex items-start justify-between">
                <div>
                  <DialogTitle className="text-xl">{selectedLead.company}</DialogTitle>
                  <DialogDescription className="mt-1 flex items-center gap-2">
                    <Badge variant="secondary" className="capitalize">{selectedLead.stage}</Badge>
                    <span className="text-sm">{selectedLead.contact} · {selectedLead.source}</span>
                  </DialogDescription>
                </div>
                <Button variant="outline" size="sm" onClick={() => window.location.href = `mailto:${selectedLead.email}`} disabled={!selectedLead.email}>
                  <Mail className="mr-2 size-4" /> Email Lead
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 divide-y md:divide-y-0 md:divide-x h-[60vh]">
                {/* Left Column - Contact Info */}
                <div className="p-6 space-y-6 md:col-span-2 bg-slate-50/50 overflow-y-auto">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Contact Information</h3>
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 text-sm">
                        <div className="flex size-8 items-center justify-center rounded-full bg-white border shadow-sm"><Mail className="size-3.5 text-muted-foreground" /></div>
                        <span className="truncate">{selectedLead.email ?? "No email provided"}</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <div className="flex size-8 items-center justify-center rounded-full bg-white border shadow-sm"><User className="size-3.5 text-muted-foreground" /></div>
                        <span>{selectedLead.phone ?? "No phone provided"}</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <div className="flex size-8 items-center justify-center rounded-full bg-white border shadow-sm"><Building2 className="size-3.5 text-muted-foreground" /></div>
                        <span>{selectedLead.branch}</span>
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <div className="flex size-8 items-center justify-center rounded-full bg-white border shadow-sm"><Calendar className="size-3.5 text-muted-foreground" /></div>
                        <span>{selectedLead.tourAt ? new Date(selectedLead.tourAt).toLocaleString() : "No tour scheduled"}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 pt-4 border-t border-slate-200">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Opportunity Type</Label>
                      <Select
                        value={selectedLead.opportunityType ?? "workspace"}
                        onValueChange={(value) => {
                          if (isOpportunityType(value)) void updateOpportunityType(value);
                        }}
                      >
                        <SelectTrigger className="h-8 bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="workspace">Workspace lease</SelectItem>
                          <SelectItem value="event">Event or short-term booking</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Linked Organization</Label>
                      <Select value={selectedLead.organizationId ?? ""} onValueChange={(v) => void linkOrganization(v)}>
                        <SelectTrigger className="h-8 bg-white"><SelectValue placeholder="Link organization" /></SelectTrigger>
                        <SelectContent>
                          {organizations.map((org) => <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {!selectedLead.organizationId && (
                        <p className="text-[10px] text-amber-600 flex items-start gap-1 mt-1"><AlertCircle className="size-3 shrink-0 mt-0.5" /> Required before activating as tenant.</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column - Timeline & Actions */}
                <div className="p-6 md:col-span-3 flex flex-col bg-card overflow-y-auto">
                  <div className="mb-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Stage Progression</h3>
                  </div>

                  <div className="flex-1 relative pl-4 space-y-6">
                    <div className="absolute left-6 top-2 bottom-2 w-px bg-slate-200" />

                    {(selectedLead.stageHistory ?? []).slice(0, 8).map((entry) => (
                      <div key={entry.id} className="relative flex items-start gap-4">
                        <div className="relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 border-2 border-primary bg-white mt-0.5">
                          <div className="size-1.5 rounded-full bg-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{entry.to_stage}</p>
                          {entry.from_stage && <p className="text-xs text-muted-foreground">Moved from {entry.from_stage}</p>}
                          <time className="text-[10px] text-muted-foreground mt-0.5 block">{new Date(entry.created_at).toLocaleString()}</time>
                        </div>
                      </div>
                    ))}
                    {(!selectedLead.stageHistory || selectedLead.stageHistory.length === 0) && (
                      <div className="relative flex items-start gap-4">
                        <div className="relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-100 border-2 border-slate-300 bg-white mt-0.5">
                          <div className="size-1.5 rounded-full bg-slate-300" />
                        </div>
                        <div><p className="text-sm text-muted-foreground">Lead created at {selectedLead.stage}</p></div>
                      </div>
                    )}
                  </div>

                  <div className="mt-8 border-t pt-5 space-y-4 bg-muted/20 -mx-6 px-6 pb-2">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Available Actions</h4>
                      <div className="flex flex-wrap gap-2">
                        {leadActionStages.map((stageName) => (
                          <Button key={stageName} type="button" variant="outline" size="sm" onClick={() => void updateLead(selectedLead.id, stageName)} disabled={selectedLead.stage === stageName}>
                            Move to {stageName}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="pt-2">
                       <Button type="button" onClick={activateTenant} disabled={!selectedLead.organizationId || selectedLead.opportunityType !== "workspace"} className="w-full sm:w-auto">
                        <FileText className="mr-2 size-4" /> Record Signed Lease
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Lease Dialog */}
      <Dialog open={leaseDialogOpen} onOpenChange={setLeaseDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record signed lease</DialogTitle>
            <DialogDescription>This creates or updates the tenant record for {selectedLead?.company}.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void saveLease(event)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Branch</Label>
                <Select value={leaseBranchId} onValueChange={setLeaseBranchId}>
                  <SelectTrigger><SelectValue placeholder="Choose branch" /></SelectTrigger>
                  <SelectContent>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Plan tier</Label>
                <Select value={leaseTier} onValueChange={setLeaseTier}>
                  <SelectTrigger><SelectValue placeholder="Choose tier" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day_pass">Day pass</SelectItem>
                    <SelectItem value="flex">Flex</SelectItem>
                    <SelectItem value="dedicated">Dedicated</SelectItem>
                    <SelectItem value="private_office">Private office</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Plan name</Label>
              <Input value={leasePlan} onChange={(e) => setLeasePlan(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Desks</Label>
                <Input type="number" min="0" step="1" required value={leaseDesks} onChange={(e) => setLeaseDesks(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Monthly fee (ZAR)</Label>
                <Input type="number" min="0" step="1" required value={leaseMrr} onChange={(e) => setLeaseMrr(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Lease signed</Label>
                <Input type="date" required value={leaseSignedAt} onChange={(e) => setLeaseSignedAt(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Lease starts</Label>
                <Input type="date" required value={leaseSince} onChange={(e) => setLeaseSince(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setLeaseDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={savingLease || !leaseBranchId || !leaseTier}>{savingLease ? "Saving..." : "Save lease"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}