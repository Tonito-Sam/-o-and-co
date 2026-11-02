import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import { LoaderCircle, Mail, RotateCcw, Save } from "lucide-react";
import { leads, stages, formatZAR, type Lead } from "@/lib/mock";
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

type LeadRecord = (typeof leads)[number] & {
  organizationId?: string | null;
  opportunityType?: "workspace" | "event" | "other";
  tourAt?: string | null;
  email?: string;
  phone?: string;
  submittedAt?: string;
  stageHistory?: { id: string; from_stage: string | null; to_stage: string; created_at: string }[];
};

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

const templatePreviewValues: Record<string, string> = {
  contact_name: "Alex",
  company_name: "Example Company",
  branch_name: "Rosebank",
  available_spaces: "[Current matching spaces and prices]",
  availability_checked_at: "[time checked before sending]",
  reply_summary: "[summary of the prospect's reply]",
  tour_date: "[tour date]",
  tour_time: "[tour time]",
  tour_location: "[branch address]",
  proposal_link: "[proposal link]",
  contract_link: "[contract link]",
  onboarding_link: "[onboarding link]",
};

function previewTemplate(value: string) {
  return value.replace(/\{\{([a-z_]+)\}\}/gi, (placeholder, key: string) =>
    templatePreviewValues[key] ?? placeholder,
  );
}

function EmailTemplateManager() {
  const { role } = useRole();
  const [templates, setTemplates] = useState<CrmEmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoadError("Supabase is not configured.");
      setLoading(false);
      return;
    }

    let active = true;
    void supabase
      .from("crm_email_templates")
      .select("id,name,trigger_label,description,subject,body,enabled,sort_order,updated_at,updated_by")
      .order("sort_order")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setLoadError(error.message);
        } else {
          const rows = (data ?? []) as CrmEmailTemplate[];
          setTemplates(rows);
          if (rows.length) {
            setSelectedTemplateId(rows[0].id);
            setDraft({
              name: rows[0].name,
              subject: rows[0].subject,
              body: rows[0].body,
              enabled: rows[0].enabled,
            });
          }
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;
  const hasChanges = Boolean(
    selectedTemplate && draft && (
      selectedTemplate.name !== draft.name ||
      selectedTemplate.subject !== draft.subject ||
      selectedTemplate.body !== draft.body ||
      selectedTemplate.enabled !== draft.enabled
    ),
  );

  const selectTemplate = (template: CrmEmailTemplate) => {
    if (hasChanges) {
      toast.error("Save or discard your edits before switching templates.");
      return;
    }
    setSelectedTemplateId(template.id);
    setDraft({
      name: template.name,
      subject: template.subject,
      body: template.body,
      enabled: template.enabled,
    });
  };

  const discardChanges = () => {
    if (!selectedTemplate) return;
    setDraft({
      name: selectedTemplate.name,
      subject: selectedTemplate.subject,
      body: selectedTemplate.body,
      enabled: selectedTemplate.enabled,
    });
  };

  const saveTemplate = async () => {
    if (!selectedTemplate || !draft) return;
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Supabase is not configured.");
      return;
    }

    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("crm_email_templates")
        .update({
          ...draft,
          updated_at: new Date().toISOString(),
          updated_by: userData.user?.id ?? null,
        })
        .eq("id", selectedTemplate.id)
        .select("id,name,trigger_label,description,subject,body,enabled,sort_order,updated_at,updated_by")
        .single();
      if (error) throw new Error(error.message);

      const updated = data as CrmEmailTemplate;
      setTemplates((current) => current.map((template) => template.id === updated.id ? updated : template));
      setDraft({
        name: updated.name,
        subject: updated.subject,
        body: updated.body,
        enabled: updated.enabled,
      });
      toast.success("Email template saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this template.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading email templates</div>;
  }

  if (loadError) {
    return <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm">Could not load email templates: {loadError}</div>;
  }

  if (!templates.length || !selectedTemplate || !draft) {
    return <div className="rounded-md border p-6 text-sm text-muted-foreground">No CRM email templates are available.</div>;
  }

  return (
    <section className="grid min-w-0 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="font-display text-sm font-semibold">Template library</h2>
          <p className="mt-1 text-xs text-muted-foreground">{templates.length} communication templates</p>
        </div>
        <div className="divide-y">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => selectTemplate(template)}
              aria-pressed={template.id === selectedTemplate.id}
              className={`w-full px-4 py-3 text-left transition-colors hover:bg-muted/40 ${template.id === selectedTemplate.id ? "bg-muted/50" : ""}`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{template.name}</span>
                <Badge variant={template.enabled ? "secondary" : "outline"}>
                  {template.enabled ? "Enabled" : "Paused"}
                </Badge>
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">{template.trigger_label}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="min-w-0 space-y-6">
        <div className="border-b pb-4">
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 size-5 text-brand" />
            <div>
              <h2 className="font-display text-base font-semibold">{selectedTemplate.trigger_label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{selectedTemplate.description}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-medium">
            Template name
            <input
              value={draft.name}
              maxLength={120}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Email subject
            <input
              value={draft.subject}
              maxLength={200}
              onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Email message
            <Textarea
              value={draft.body}
              maxLength={5000}
              rows={12}
              onChange={(event) => setDraft({ ...draft, body: event.target.value })}
              className="font-normal"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
              className="size-4 accent-current"
            />
            Template enabled
          </label>
          <p className="text-xs text-muted-foreground">
            Available fields: {"{{contact_name}}, {{company_name}}, {{branch_name}}, {{available_spaces}}, {{availability_checked_at}}, {{reply_summary}}, {{tour_date}}, {{tour_time}}, {{tour_location}}, {{proposal_link}}, {{contract_link}}, {{onboarding_link}}"}
          </p>
        </div>

        <section className="border-t pt-5">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">Preview</h3>
          <div className="mt-3 space-y-2 rounded-md border bg-muted/20 p-4 text-sm">
            <p><span className="font-medium">Subject: </span>{previewTemplate(draft.subject)}</p>
            <pre className="whitespace-pre-wrap font-sans text-sm">{previewTemplate(draft.body)}</pre>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            {hasChanges ? "Unsaved changes" : `Last saved ${new Date(selectedTemplate.updated_at).toLocaleString()}`}
          </p>
          <div className="flex gap-2">
            {hasChanges && (
              <Button type="button" variant="outline" size="sm" onClick={discardChanges} disabled={saving}>
                <RotateCcw className="size-4" />Discard
              </Button>
            )}
            <Button type="button" size="sm" onClick={() => void saveTemplate()} disabled={!hasChanges || saving || !draft.name.trim() || !draft.subject.trim() || !draft.body.trim()}>
              {saving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
              {saving ? "Saving" : "Save template"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function RecentOutreachActivity() {
  const [activity, setActivity] = useState<OutreachActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }

    let active = true;
    const refresh = async () => {
      const { data, error: queryError } = await supabase
        .from("outreach_deliveries")
        .select("id,recipient_email,company_name,subject,status,callback_preference,sent_at,replied_at,created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      if (!active) return;
      if (queryError) setError(queryError.message);
      else {
        setActivity((data ?? []) as OutreachActivity[]);
        setError(null);
      }
      setLoading(false);
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 15000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <section className="mb-5 overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="font-display text-sm font-semibold">Recent outreach</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Delivery and prospect responses</p>
        </div>
        <Badge variant="outline">Live</Badge>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 px-4 py-5 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />Loading outreach activity
        </div>
      ) : error ? (
        <p role="alert" className="px-4 py-5 text-sm text-muted-foreground">Could not load outreach activity: {error}</p>
      ) : activity.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted-foreground">No outreach activity yet.</p>
      ) : (
        <div className="divide-y">
          {activity.map((delivery) => {
            const statusLabel = delivery.status === "replied" && delivery.callback_preference === "yes"
              ? "Call requested"
              : delivery.status === "unsubscribed"
                ? "Follow-ups stopped"
                : delivery.status === "sent"
                  ? "Awaiting response"
                  : delivery.status;
            return (
              <div key={delivery.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{delivery.company_name || delivery.recipient_email}</p>
                  <p className="truncate text-xs text-muted-foreground">{delivery.subject}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={delivery.status === "replied" ? "default" : delivery.status === "unsubscribed" ? "outline" : "secondary"}>
                    {statusLabel}
                  </Badge>
                  <time className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(delivery.replied_at ?? delivery.sent_at ?? delivery.created_at).toLocaleString()}
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

function CRM() {
  const { canSeeRevenue, role } = useRole();
  const canManageTemplates = ["crm-manager", "sales-manager", "group-admin", "group-ceo", "superadmin"].includes(role.id);
  const [activeView, setActiveView] = useState<"pipeline" | "templates">("pipeline");
  const [selectedLead, setSelectedLead] = useState<LeadRecord | null>(null);
  const [selectedStage, setSelectedStage] = useState<(typeof stages)[number]>(stages[0]);
  const [crmLeads, setCrmLeads] = useState<LeadRecord[]>([]);
  const [organizations, setOrganizations] = useState<CrmOrganization[]>([]);
  const [branches, setBranches] = useState<CrmBranch[]>([]);
  const [leaseDialogOpen, setLeaseDialogOpen] = useState(false);
  const [leaseBranchId, setLeaseBranchId] = useState("");
  const [leaseTier, setLeaseTier] = useState("");
  const [leasePlan, setLeasePlan] = useState("");
  const [leaseDesks, setLeaseDesks] = useState("0");
  const [leaseMrr, setLeaseMrr] = useState("0");
  const [leaseSince, setLeaseSince] = useState(new Date().toISOString().slice(0, 10));
  const [leaseSignedAt, setLeaseSignedAt] = useState(new Date().toISOString().slice(0, 10));
  const [savingLease, setSavingLease] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    void Promise.all([
      supabase
        .from("leads")
        .select("id,company_name,contact_name,contact_email,contact_phone,source,stage,sales_stage,value_zar,score,branch_id,organization_id,opportunity_type,tour_at,branches!leads_branch_id_fkey(name)")
        .order("created_at", { ascending: false }),
      supabase.from("lead_activities").select("id,lead_id,from_stage,to_stage,created_at").order("created_at", { ascending: false }),
      supabase.from("organizations").select("id,name").order("name"),
      supabase.from("branches").select("id,name").eq("status", "live").order("name"),
    ]).then(([leadResult, activityResult, organizationResult, branchResult]) => {
      if (leadResult.error) {
        toast.error(`Could not load CRM leads: ${leadResult.error.message}`);
        return;
      }
      const branchNames = new Map((branchResult.data ?? []).map((branch) => [branch.id, branch.name]));
      const activitiesByLead = new Map<string, NonNullable<LeadRecord["stageHistory"]>>();
      for (const activity of activityResult.data ?? []) {
        const history = activitiesByLead.get(activity.lead_id) ?? [];
        history.push(activity);
        activitiesByLead.set(activity.lead_id, history);
      }
      setCrmLeads((leadResult.data ?? []).map((record) => {
        const stage = record.sales_stage && stages.includes(record.sales_stage as (typeof stages)[number])
          ? record.sales_stage as (typeof stages)[number]
          : stageFromDatabase[record.stage] ?? "New Lead";
        return {
          id: record.id,
          company: record.company_name,
          contact: record.contact_name ?? "Contact not provided",
          email: record.contact_email ?? undefined,
          phone: record.contact_phone ?? undefined,
          source: record.source ?? "Sales team",
          stage,
          value: record.value_zar ?? 0,
          score: record.score ?? 0,
          branch: record.branch_id ? branchNames.get(record.branch_id) ?? "Branch not set" : "Branch not set",
          owner: "Sales team",
          organizationId: record.organization_id,
          opportunityType: record.opportunity_type ?? "workspace",
          tourAt: record.tour_at,
          stageHistory: activitiesByLead.get(record.id) ?? [],
        };
      }));
      if (activityResult.error) toast.error(activityResult.error.message);
      if (organizationResult.error) toast.error(organizationResult.error.message);
      else setOrganizations((organizationResult.data ?? []) as CrmOrganization[]);
      if (branchResult.error) toast.error(branchResult.error.message);
      else setBranches((branchResult.data ?? []) as CrmBranch[]);
    });
  }, []);

  const byStage = useMemo(
    () => stages.map((s) => ({ stage: s, items: crmLeads.filter((l) => l.stage === s) })),
    [crmLeads],
  );
  const totalPipe = useMemo(
    () => crmLeads.reduce((sum, lead) => sum + (lead.value ?? 0), 0),
    [crmLeads],
  );
  const selectedStageLeads = byStage.find((column) => column.stage === selectedStage)?.items ?? [];
  const activeLeadCount = crmLeads.filter((lead) => !["Active Tenant", "Lost"].includes(lead.stage)).length;
  const qualifiedLeadCount = crmLeads.filter((lead) =>
    [
      "Qualified",
      "Tour Scheduled",
      "Proposal Sent",
      "Negotiation",
      "Contract Sent",
      "Contract Signed",
    ].includes(lead.stage),
  ).length;
  const stagesInUse = byStage.filter((column) => column.items.length > 0).length;

  const updateLead = async (leadId: string, targetStage: (typeof stages)[number]) => {
    const existing = crmLeads.find((lead) => lead.id === leadId);
    const supabase = getSupabaseClient();
    if (!existing || !supabase) return;
    const updatedLead = {
      ...existing,
      stage: targetStage,
      stageHistory: [
        {
          id: `pending-${Date.now()}`,
          from_stage: existing.stage,
          to_stage: targetStage,
          created_at: new Date().toISOString(),
        },
        ...(existing.stageHistory ?? []),
      ],
    };
    const { error } = await supabase
      .from("leads")
      .update({ sales_stage: updatedLead.stage, stage: stageToDatabase[updatedLead.stage] })
      .eq("id", leadId);
    if (error) {
      toast.error(`Could not update lead stage: ${error.message}`);
      return;
    }
    setCrmLeads((current) => current.map((lead) => lead.id === leadId ? updatedLead : lead));
    setSelectedLead((current) => current?.id === leadId ? updatedLead : current);
  };

  const advanceLeadStage = (targetStage: (typeof stages)[number]) => {
    if (!selectedLead) return;
    void updateLead(selectedLead.id, targetStage);
  };

  const updateOpportunityType = async (opportunityType: "workspace" | "event" | "other") => {
    if (!selectedLead) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.from("leads").update({ opportunity_type: opportunityType }).eq("id", selectedLead.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    const updatedLead = { ...selectedLead, opportunityType };
    setSelectedLead(updatedLead);
    setCrmLeads((current) => current.map((lead) => lead.id === updatedLead.id ? updatedLead : lead));
  };

  const stepLeadThroughLifecycle = () => {
    if (!selectedLead || ["Onboarding", "Active Tenant", "Lost"].includes(selectedLead.stage)) return;

    const currentStageIndex = stages.indexOf(selectedLead.stage as (typeof stages)[number]);
    const nextStage = stages[currentStageIndex + 1];

    if (!nextStage) return;

    advanceLeadStage(nextStage);
  };

  const moveLeadToProposalSent = () => {
    if (!selectedLead) return;
    advanceLeadStage("Proposal Sent");
  };

  const moveLeadToNegotiation = () => {
    if (!selectedLead) return;
    advanceLeadStage("Negotiation");
  };

  const moveLeadToContractSent = () => {
    if (!selectedLead) return;
    advanceLeadStage("Contract Sent");
  };

  const moveLeadToContractSigned = () => {
    if (!selectedLead) return;
    advanceLeadStage("Contract Signed");
  };

  const moveLeadToOnboarding = () => {
    if (!selectedLead) return;
    advanceLeadStage("Onboarding");
  };

  const activateTenant = () => {
    if (!selectedLead) return;
    if (!selectedLead.organizationId) {
      toast.error("Link the registered organization before recording its lease.");
      return;
    }
    if (!branches.some((branch) => branch.id === leaseBranchId)) {
      const leadBranch = branches.find((branch) => branch.name === selectedLead.branch);
      setLeaseBranchId(leadBranch?.id ?? branches[0]?.id ?? "");
    }
    setLeaseDialogOpen(true);
  };

  const linkOrganization = async (organizationId: string) => {
    if (!selectedLead) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.rpc("link_lead_to_organization", {
      p_lead_id: selectedLead.id,
      p_organization_id: organizationId,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    const updatedLead = { ...selectedLead, organizationId };
    setSelectedLead(updatedLead);
    setCrmLeads((current) => current.map((lead) => lead.id === updatedLead.id ? updatedLead : lead));
    toast.success("Organization linked to this lead.");
  };

  const saveLease = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedLead || !leaseTier) return;
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSavingLease(true);
    const { error } = await supabase.rpc("activate_lead_as_tenant", {
      p_lead_id: selectedLead.id,
      p_branch_id: leaseBranchId || null,
      p_tier: leaseTier,
      p_plan_name: leasePlan.trim() || null,
      p_desks: Number(leaseDesks),
      p_mrr_zar: Number(leaseMrr),
      p_since: leaseSince,
      p_lease_signed_at: leaseSignedAt,
    });
    setSavingLease(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const activatedLead = { ...selectedLead, stage: "Active Tenant" as const };
    setSelectedLead(activatedLead);
    setCrmLeads((current) => current.map((lead) => lead.id === activatedLead.id ? activatedLead : lead));
    setLeaseDialogOpen(false);
    toast.success("Signed lease recorded and tenant activated.");
  };

  return (
    <div className="mx-auto max-w-375">
      <PageHeader
        eyebrow="CRM & Sales Automation"
        title={activeView === "templates" ? "Email templates" : "Pipeline"}
        description={
          activeView === "templates"
            ? "Manage shared email copy for prospect discovery and sales follow-up."
            : "Registered enquiries and tour requests through qualification, contract, and tenant activation."
        }
      />
      {canManageTemplates && (
        <div className="mb-5 flex gap-1 border-b" role="tablist" aria-label="CRM views">
          <Button type="button" role="tab" aria-selected={activeView === "pipeline"} variant={activeView === "pipeline" ? "secondary" : "ghost"} onClick={() => setActiveView("pipeline")}>
            Pipeline
          </Button>
          <Button type="button" role="tab" aria-selected={activeView === "templates"} variant={activeView === "templates" ? "secondary" : "ghost"} onClick={() => setActiveView("templates")}>
            Email templates
          </Button>
        </div>
      )}
      {activeView === "templates" && canManageTemplates ? (
        <EmailTemplateManager />
      ) : (
        <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={canSeeRevenue ? "Pipeline value" : "Open opportunities"}
          value={canSeeRevenue ? formatZAR(totalPipe) : String(activeLeadCount)}
          hint={`${crmLeads.length} registered leads`}
          accent="brand"
        />
        <StatCard label="Active leads" value={String(activeLeadCount)} hint="Not yet activated" />
        <StatCard
          label="Qualified"
          value={String(qualifiedLeadCount)}
          hint="Tour through contract"
          accent="success"
        />
        <StatCard
          label="Stages in use"
          value={`${stagesInUse} / ${stages.length}`}
          hint="Based on current leads"
        />
      </div>
      {["crm-manager", "sales-manager", "group-admin", "group-ceo"].includes(role.id) && <RecentOutreachActivity />}

      <section className="mb-5 rounded-lg border bg-card p-3 sm:p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold">Sales stages</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Select a stage to inspect its leads.
            </p>
          </div>
          <Badge variant="outline" className="shrink-0">
            {crmLeads.length} leads
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {byStage.map((column, index) => (
            <button
              key={column.stage}
              type="button"
              onClick={() => setSelectedStage(column.stage)}
              aria-pressed={selectedStage === column.stage}
              className={`min-h-18 rounded-md border p-2.5 text-left transition-colors ${
                selectedStage === column.stage
                  ? "border-primary bg-primary/5"
                  : "bg-background hover:bg-muted/50"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <Badge
                  variant={column.items.length ? "default" : "outline"}
                  className="h-5 min-w-5 justify-center px-1 text-[10px]"
                >
                  {column.items.length}
                </Badge>
              </span>
              <span className="mt-2 block text-xs font-medium leading-snug">{column.stage}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="font-display text-sm font-semibold">{selectedStage}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {selectedStageLeads.length} leads at this stage
            </p>
          </div>
          {selectedStageLeads.length > 0 && (
            <Badge variant="outline">
              {formatZAR(selectedStageLeads.reduce((sum, lead) => sum + (lead.value ?? 0), 0))}
            </Badge>
          )}
        </div>
        {selectedStageLeads.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium">No leads in {selectedStage}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Real tour requests will appear here when submitted. Discovered businesses remain in
              Leads Intelligence until added to the sales pipeline.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {selectedStageLeads.map((lead) => (
              <button
                key={lead.id}
                type="button"
                onClick={() => setSelectedLead(lead)}
                className="grid w-full gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/30 sm:grid-cols-[minmax(0,1fr)_minmax(8rem,0.7fr)_auto_auto] sm:items-center"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{lead.company}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {lead.contact} · {lead.source}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {lead.branch || "Branch not set"}
                </span>
                <span className="text-sm tabular-nums">
                  {lead.value ? formatZAR(lead.value) : "—"}
                </span>
                <Badge variant="secondary" className="w-fit">
                  Score {lead.score ?? "—"}
                </Badge>
              </button>
            ))}
          </div>
        )}
      </section>

      <Dialog open={selectedLead !== null} onOpenChange={(open) => !open && setSelectedLead(null)}>
        <DialogContent className="max-w-3xl">
          {selectedLead && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedLead.company}</DialogTitle>
                <DialogDescription>Lead record details and sales context.</DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-md border bg-background/60 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Lead ID
                  </div>
                  <div className="mt-1 font-medium">{selectedLead.id}</div>
                </div>
                <div className="rounded-md border bg-background/60 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Contact
                  </div>
                  <div className="mt-1 font-medium">{selectedLead.contact}</div>
                </div>
                <div className="rounded-md border bg-background/60 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Email
                  </div>
                  <div className="mt-1 font-medium">{selectedLead.email ?? "—"}</div>
                </div>
                <div className="rounded-md border bg-background/60 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Phone
                  </div>
                  <div className="mt-1 font-medium">{selectedLead.phone ?? "—"}</div>
                </div>
                <div className="rounded-md border bg-background/60 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Source
                  </div>
                  <div className="mt-1 font-medium">{selectedLead.source}</div>
                </div>
                <div className="rounded-md border bg-background/60 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Stage
                  </div>
                  <div className="mt-1 font-medium">{selectedLead.stage}</div>
                </div>
                <div className="rounded-md border bg-background/60 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Deal value
                  </div>
                  <div className="mt-1 font-medium">
                    {selectedLead.value ? formatZAR(selectedLead.value) : "—"}
                  </div>
                </div>
                <div className="rounded-md border bg-background/60 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    AI score
                  </div>
                  <div className="mt-1 font-medium">{selectedLead.score}</div>
                </div>
                <div className="rounded-md border bg-background/60 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Tour</div>
                  <div className="mt-1 font-medium">
                    {selectedLead.tourAt ? new Date(selectedLead.tourAt).toLocaleString() : "Not scheduled"}
                  </div>
                </div>
                <div className="rounded-md border bg-background/60 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Branch
                  </div>
                  <div className="mt-1 font-medium">{selectedLead.branch}</div>
                </div>
                <div className="rounded-md border bg-background/60 p-3">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Owner
                  </div>
                  <div className="mt-1 font-medium">{selectedLead.owner}</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="crm-opportunity-type">Opportunity</Label>
                <Select
                  value={selectedLead.opportunityType ?? "workspace"}
                  onValueChange={(value) => void updateOpportunityType(value as "workspace" | "event" | "other")}
                >
                  <SelectTrigger id="crm-opportunity-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="workspace">Workspace lease</SelectItem>
                    <SelectItem value="event">Event or short-term booking</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="crm-organization">Registered organization</Label>
                <Select
                  value={selectedLead.organizationId ?? ""}
                  onValueChange={(value) => void linkOrganization(value)}
                >
                  <SelectTrigger id="crm-organization">
                    <SelectValue placeholder="Link a registered organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((organization) => (
                      <SelectItem key={organization.id} value={organization.id}>
                        {organization.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  A lead becomes a tenant only after the organization is linked and its lease is signed.
                </p>
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Stage history
                </div>
                <div className="space-y-2">
                  {(selectedLead.stageHistory ?? []).slice(0, 8).map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between gap-2 rounded-md border bg-background/60 px-3 py-2 text-sm">
                      <span className="font-medium">
                        {entry.from_stage ? `${entry.from_stage} → ` : ""}{entry.to_stage}
                      </span>
                      <time className="text-[11px] text-muted-foreground">
                        {new Date(entry.created_at).toLocaleString()}
                      </time>
                    </div>
                  ))}
                  {selectedLead.stageHistory?.length === 0 && (
                    <p className="text-sm text-muted-foreground">No stage changes recorded.</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={moveLeadToProposalSent}>
                  Proposal sent
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={moveLeadToNegotiation}>
                  Negotiation
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={moveLeadToContractSent}>
                  Contract sent
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={moveLeadToContractSigned}
                >
                  Contract signed
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={moveLeadToOnboarding}>
                  Onboarding
                </Button>
                <Button type="button" size="sm" onClick={activateTenant} disabled={!selectedLead.organizationId || selectedLead.opportunityType !== "workspace"}>
                  Record signed lease
                </Button>
                {!['Onboarding', 'Active Tenant', 'Lost'].includes(selectedLead.stage) && (
                  <Button type="button" variant="ghost" size="sm" onClick={stepLeadThroughLifecycle}>
                    Auto-advance one stage
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={leaseDialogOpen} onOpenChange={setLeaseDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record signed lease</DialogTitle>
            <DialogDescription>
              This creates or updates the tenant record for {selectedLead?.company}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void saveLease(event)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="crm-lease-branch">Branch</Label>
                <Select value={leaseBranchId} onValueChange={setLeaseBranchId}>
                  <SelectTrigger id="crm-lease-branch"><SelectValue placeholder="Choose branch" /></SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="crm-lease-tier">Plan tier</Label>
                <Select value={leaseTier} onValueChange={setLeaseTier}>
                  <SelectTrigger id="crm-lease-tier"><SelectValue placeholder="Choose tier" /></SelectTrigger>
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
              <Label htmlFor="crm-lease-plan">Plan name</Label>
              <Input id="crm-lease-plan" value={leasePlan} onChange={(event) => setLeasePlan(event.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="crm-lease-desks">Desks</Label>
                <Input id="crm-lease-desks" type="number" min="0" step="1" required value={leaseDesks} onChange={(event) => setLeaseDesks(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="crm-lease-mrr">Monthly fee (ZAR)</Label>
                <Input id="crm-lease-mrr" type="number" min="0" step="1" required value={leaseMrr} onChange={(event) => setLeaseMrr(event.target.value)} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="crm-lease-signed">Lease signed</Label>
                <Input id="crm-lease-signed" type="date" required value={leaseSignedAt} onChange={(event) => setLeaseSignedAt(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="crm-lease-start">Lease starts</Label>
                <Input id="crm-lease-start" type="date" required value={leaseSince} onChange={(event) => setLeaseSince(event.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setLeaseDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={savingLease || !leaseBranchId || !leaseTier}>
                {savingLease ? "Saving lease…" : "Save lease"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
        </>
      )}
    </div>
  );
}
