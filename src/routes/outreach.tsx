import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  ExternalLink,
  FileText,
  LoaderCircle,
  Mail,
  PhoneCall,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseClient } from "@/lib/supabase";
import { useRole } from "@/lib/role-context";

type ProspectEmail = { kind: string; value: string };
type ProspectEmailRelation = ProspectEmail[] | null;
type ProspectSource = {
  source_type: string;
  metadata: { branch_id?: string } | null;
};
type OutreachProspect = {
  id: string;
  company_name: string;
  website_domain: string | null;
  recommended_branch_id: string | null;
  prospect_contacts: ProspectEmailRelation;
  prospect_sources: ProspectSource[] | null;
};
type OutreachBranch = { id: string; name: string };
type OutreachDelivery = {
  id: string;
  recipient_email: string;
  company_name: string | null;
  subject: string;
  status: string;
  consent_status: string;
  sent_at: string | null;
  replied_at: string | null;
  created_at: string;
  campaign_id: string | null;
};
type OutreachTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
};

const templateFieldLabels: Record<string, string> = {
  branch_name: "Branch name",
  available_spaces: "Available spaces",
  availability_checked_at: "Availability checked at",
  reply_summary: "Reply summary",
  tour_date: "Tour date",
  tour_time: "Tour time",
  tour_location: "Tour location",
  proposal_link: "Proposal link",
  contract_link: "Contract link",
  onboarding_link: "Onboarding link",
};

function getProspectEmails(prospect: OutreachProspect) {
  return [
    ...new Set(
      (prospect.prospect_contacts ?? [])
        .filter((contact) => contact.kind === "email")
        .map((contact) => contact.value.trim())
        .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
    ),
  ];
}

function getProspectBranchIds(prospect: OutreachProspect) {
  const sourceBranchIds = (prospect.prospect_sources ?? [])
    .filter((source) => source.source_type === "discovery_provider")
    .map((source) => source.metadata?.branch_id)
    .filter((branchId): branchId is string => Boolean(branchId));
  if (sourceBranchIds.length) return [...new Set(sourceBranchIds)];
  return prospect.recommended_branch_id ? [prospect.recommended_branch_id] : [];
}

function formatDeliveryDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function deliveryVariant(status: string): "default" | "outline" | "destructive" | "secondary" {
  if (["failed", "bounced", "unsubscribed"].includes(status)) return "destructive";
  if (["sent", "delivered", "replied"].includes(status)) return "default";
  return "outline";
}

function statusLabel(status: string) {
  return status === "unsubscribed" ? "Opted out" : status;
}

/* ── Shared small components ──────────────────────────────── */

function StepIndicator({ step, isCampaign }: { step: 1 | 2 | 3; isCampaign: boolean }) {
  const steps = [
    { n: 1, label: isCampaign ? "Recipients & consent" : "Compose" },
    { n: 2, label: "Review preview" },
    { n: 3, label: "Send" },
  ] as const;
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {steps.map((s, i) => {
        const state = s.n < step ? "done" : s.n === step ? "current" : "todo";
        return (
          <li key={s.n} className="flex items-center gap-2">
            <span
              className={`flex size-5 items-center justify-center rounded-full border text-[10px] font-semibold ${
                state === "done"
                  ? "border-brand bg-brand text-brand-foreground"
                  : state === "current"
                    ? "border-brand text-brand"
                    : "border-muted-foreground/30 text-muted-foreground"
              }`}
            >
              {state === "done" ? <Check className="size-3" /> : s.n}
            </span>
            <span
              className={
                state === "todo" ? "text-muted-foreground" : "font-medium text-foreground"
              }
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <ArrowRight className="size-3 text-muted-foreground/50" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function EmailPreviewFrame({
  subject,
  body,
  toEmail,
  companyName,
}: {
  subject: string;
  body: string;
  toEmail: string;
  companyName: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Mail className="size-3.5" />
          Preview
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2 rounded-full bg-muted-foreground/30" />
          <span className="size-2 rounded-full bg-muted-foreground/30" />
          <span className="size-2 rounded-full bg-muted-foreground/30" />
        </span>
      </div>
      <dl className="divide-y border-b text-xs">
        <div className="flex gap-3 px-4 py-2">
          <dt className="w-14 shrink-0 text-muted-foreground">To</dt>
          <dd className="min-w-0 truncate text-foreground">
            {toEmail || companyName || "—"}
          </dd>
        </div>
        <div className="flex gap-3 px-4 py-2">
          <dt className="w-14 shrink-0 text-muted-foreground">Subject</dt>
          <dd className="min-w-0 truncate text-foreground">
            {subject.trim() || "(no subject)"}
          </dd>
        </div>
      </dl>
      <div className="px-4 py-4">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">
          {body}
        </pre>
      </div>
    </div>
  );
}

function CompliancePanel({
  isCampaign,
  consentConfirmed,
  selectedCount,
  emailCount,
  countError,
  missingTemplateTokens,
}: {
  isCampaign: boolean;
  consentConfirmed: boolean;
  selectedCount: number;
  emailCount: number;
  countError: string | null;
  missingTemplateTokens: string[];
}) {
  const checks = isCampaign
    ? [
        {
          ok: !countError && selectedCount > 0 && emailCount > 0,
          label:
            selectedCount === 0
              ? "Select at least one prospect"
              : `${selectedCount} prospect${selectedCount === 1 ? "" : "s"} · ${emailCount} unique email${emailCount === 1 ? "" : "s"}`,
        },
        { ok: consentConfirmed, label: "Recipients explicitly opted in" },
        { ok: true, label: "Unsubscribed and bounced addresses excluded" },
        { ok: true, label: "Every send logged to the outreach table" },
      ]
    : [
        {
          ok: missingTemplateTokens.length === 0,
          label:
            missingTemplateTokens.length === 0
              ? "All template fields complete"
              : `Missing fields: ${missingTemplateTokens
                  .map((t) => templateFieldLabels[t] ?? t)
                  .join(", ")}`,
        },
        { ok: true, label: "Recipient address specified" },
        { ok: true, label: "Clear yes / no call-to-action included" },
        { ok: true, label: "Delivery logged to the outreach table" },
      ];

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="size-4 text-brand" />
        <h2 className="font-display text-sm font-semibold">Compliance guardrails</h2>
      </div>
      <ul className="space-y-2 text-xs">
        {checks.map((c, i) => (
          <li key={i} className="flex items-start gap-2">
            {c.ok ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/40" />
            )}
            <span className={c.ok ? "text-foreground" : "text-muted-foreground"}>
              {c.label}
            </span>
          </li>
        ))}
        {countError && (
          <li className="flex items-start gap-2 text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{countError}</span>
          </li>
        )}
      </ul>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-lg border bg-card p-4">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3 w-64 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card px-5 py-12 text-center">
      <div className="mx-auto text-muted-foreground/60">{icon}</div>
      <h3 className="mt-3 font-medium">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export const Route = createFileRoute("/outreach")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode === "campaign" ? ("campaign" as const) : ("single" as const),
  }),
  head: () => ({ meta: [{ title: "Prospect Outreach — WorkspaceOS" }] }),
  component: Outreach,
});

function Outreach() {
  const { mode } = Route.useSearch();
  const isCampaign = mode === "campaign";
  const { role } = useRole();
  const canSend = ["sales-manager", "crm-manager", "group-ceo", "superadmin"].includes(role.id);

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [toEmail, setToEmail] = useState("");
  const [subject, setSubject] = useState("Quick question about your workspace needs");
  const [callbackPreference, setCallbackPreference] = useState<"yes" | "no" | "unspecified">(
    "yes",
  );
  const [consentStatus, setConsentStatus] = useState<
    "explicitly_opted_in" | "requires_confirmation" | "not_requested"
  >("requires_confirmation");
  const [body, setBody] = useState(
    "We are reviewing the local workspace demand in your area and would love to understand whether your business is exploring a new office or private meeting environment.",
  );
  const [campaignName, setCampaignName] = useState("Local workspace prospect campaign");
  const [campaignCountError, setCampaignCountError] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [campaignConsentConfirmed, setCampaignConsentConfirmed] = useState(false);
  const [prospects, setProspects] = useState<OutreachProspect[]>([]);
  const [branches, setBranches] = useState<OutreachBranch[]>([]);
  const [campaignAudience, setCampaignAudience] = useState<"all" | "kyalami" | "rosebank">("all");
  const [selectedProspectId, setSelectedProspectId] = useState("");
  const [selectedProspectContactEmail, setSelectedProspectContactEmail] = useState("");
  const [selectedCampaignProspectIds, setSelectedCampaignProspectIds] = useState<string[]>([]);
  const [prospectSearch, setProspectSearch] = useState("");
  const [templates, setTemplates] = useState<OutreachTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateValues, setTemplateValues] = useState<Record<string, string>>({});
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [deliveries, setDeliveries] = useState<OutreachDelivery[]>([]);
  const [deliveryLoading, setDeliveryLoading] = useState(true);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setCampaignCountError("Supabase is not configured.");
      setDeliveryError("Supabase is not configured.");
      return;
    }
    let active = true;
    const loadOutreachData = async () => {
      const [prospectsResult, deliveriesResult, templatesResult, branchesResult] = await Promise.all([
        supabase
          .from("prospect_profiles")
          .select("id,company_name,website_domain,recommended_branch_id,prospect_contacts(kind,value),prospect_sources(source_type,metadata)")
          .order("company_name")
          .limit(1000),
        supabase
          .from("outreach_deliveries")
          .select(
            "id,recipient_email,company_name,subject,status,consent_status,sent_at,replied_at,created_at,campaign_id",
          )
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("crm_email_templates")
          .select("id,name,subject,body")
          .eq("enabled", true)
          .order("sort_order"),
        supabase.from("branches").select("id,name").eq("status", "live"),
      ]);
      if (!active) return;

      if (prospectsResult.error) setCampaignCountError(prospectsResult.error.message);
      else {
        setProspects((prospectsResult.data ?? []) as OutreachProspect[]);
        setCampaignCountError(null);
      }
      if (deliveriesResult.error) setDeliveryError(deliveriesResult.error.message);
      else {
        setDeliveries((deliveriesResult.data ?? []) as OutreachDelivery[]);
        setDeliveryError(null);
      }
      setDeliveryLoading(false);
      if (templatesResult.error) {
        setTemplateError(templatesResult.error.message);
      } else {
        setTemplates((templatesResult.data ?? []) as OutreachTemplate[]);
        setTemplateError(null);
      }
      if (branchesResult.error) {
        setCampaignCountError(branchesResult.error.message);
      } else {
        setBranches((branchesResult.data ?? []) as OutreachBranch[]);
      }
    };
    void loadOutreachData().catch((error: unknown) => {
      if (!active) return;
      const message = error instanceof Error ? error.message : "Could not load outreach data.";
      setCampaignCountError(message);
      setDeliveryError(message);
      setDeliveryLoading(false);
    });
    return () => {
      active = false;
    };
  }, [historyRefresh]);

  useEffect(() => {
    if (!isCampaign || !prospects.length) return;
    const branch = campaignAudience === "all"
      ? null
      : branches.find((item) => item.name.toLowerCase().includes(campaignAudience));
    const audience = prospects.filter((prospect) => {
      if (!getProspectEmails(prospect).length) return false;
      return !branch || getProspectBranchIds(prospect).includes(branch.id);
    });
    setSelectedCampaignProspectIds(audience.map((prospect) => prospect.id));
    setCampaignConsentConfirmed(false);
  }, [branches, campaignAudience, isCampaign, prospects]);

  useEffect(() => {
    setSelectedTemplateId("");
    setTemplateValues({});
    setSubject(
      isCampaign ? "A note from Office & Co" : "Quick question about your workspace needs",
    );
    setBody(
      isCampaign
        ? "We are sharing an update about workspace options and would be glad to learn whether your business has current requirements."
        : "We are reviewing the local workspace demand in your area and would love to understand whether your business is exploring a new office or private meeting environment.",
    );
  }, [isCampaign]);

  const selectedCampaignProspects = prospects.filter((prospect) =>
    selectedCampaignProspectIds.includes(prospect.id),
  );
  const campaignEmails = new Set(
    selectedCampaignProspects.flatMap((prospect) =>
      getProspectEmails(prospect)
        .map((email) => email.toLowerCase())
        .filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)),
    ),
  );
  const campaignEmailCount = campaignEmails.size;
  const selectedProspect = prospects.find((prospect) => prospect.id === selectedProspectId);
  const audienceBranch = campaignAudience === "all"
    ? null
    : branches.find((branch) => branch.name.toLowerCase().includes(campaignAudience));
  const filteredProspects = prospects.filter((prospect) => {
    const matchesBranch =
      campaignAudience === "all" ||
      Boolean(audienceBranch && getProspectBranchIds(prospect).includes(audienceBranch.id));
    const matchesSearch = [prospect.company_name, prospect.website_domain].some((value) =>
      value?.toLowerCase().includes(prospectSearch.trim().toLowerCase()),
    );
    return matchesBranch && matchesSearch;
  });
  const prospectCandidates = filteredProspects.filter(
    (prospect) => getProspectEmails(prospect).length > 0,
  );
  const visibleDeliveries = deliveries.filter((delivery) =>
    historyFilter === "all" ? true : delivery.status === historyFilter,
  );
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const templateTokens = selectedTemplate
    ? [
        ...new Set(
          `${selectedTemplate.subject}\n${selectedTemplate.body}`.match(/\{\{([a-z_]+)\}\}/gi) ??
            [],
        ),
      ]
        .map((token) => token.slice(2, -2).toLowerCase())
        .filter((token) => !["contact_name", "company_name"].includes(token))
    : [];
  const missingTemplateTokens = templateTokens.filter((token) => !templateValues[token]?.trim());

  const renderTemplateText = (value: string) => {
    const replacements: Record<string, string> = {
      ...templateValues,
      contact_name: contactName.trim() || "there",
      company_name: companyName.trim() || "your company",
    };
    return value.replace(/\{\{([a-z_]+)\}\}/gi, (placeholder, key: string) =>
      replacements[key.toLowerCase()]?.trim() || placeholder,
    );
  };

  const chooseProspect = (prospectId: string) => {
    setSelectedProspectId(prospectId);
    setSelectedTemplateId("");
    setTemplateValues({});
    const prospect = prospects.find((item) => item.id === prospectId);
    if (!prospect) {
      setCompanyName("");
      setContactName("");
      setToEmail("");
      return;
    }
    setCompanyName(prospect.company_name);
    setToEmail(getProspectEmails(prospect)[0] ?? "");
    setContactName("");
  };

  const chooseTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    const template = templates.find((item) => item.id === templateId);
    if (!template) {
      setSubject("Quick question about your workspace needs");
      setBody(
        "We are reviewing the local workspace demand in your area and would love to understand whether your business is exploring a new office or private meeting environment.",
      );
      setTemplateValues({});
      return;
    }
    setSubject(template.subject);
    setBody(template.body);
    setTemplateValues({});
  };

  const toggleCampaignProspect = (prospectId: string) => {
    setSelectedCampaignProspectIds((current) =>
      current.includes(prospectId)
        ? current.filter((id) => id !== prospectId)
        : [...current, prospectId],
    );
    setCampaignConsentConfirmed(false);
  };

  const selectVisibleCampaignProspects = () => {
    const visibleIds = prospectCandidates.map((prospect) => prospect.id);
    const allVisibleSelected = visibleIds.every((id) =>
      selectedCampaignProspectIds.includes(id),
    );
    setSelectedCampaignProspectIds((current) =>
      allVisibleSelected
        ? current.filter((id) => !visibleIds.includes(id))
        : [...new Set([...current, ...visibleIds])],
    );
    setCampaignConsentConfirmed(false);
  };

  const preview = useMemo(() => {
    const summary = renderTemplateText(
      body.trim() || "We would like to learn more about your current space needs.",
    );
    if (isCampaign) {
      return `Hello,\n\n${summary}\n\nTo opt out of future marketing emails, reply STOP.\n\nRegards,\nOffice & Co\nhello@officeand.co`;
    }
    const intro = contactName.trim() || "there";
    const yesNo =
      callbackPreference === "yes"
        ? "If this is helpful, please reply YES and we will arrange a short call."
        : callbackPreference === "no"
          ? "If you would prefer not to be contacted by phone, simply reply NO and we will pause follow-up."
          : "If this is helpful, please reply YES to confirm a short call. If not, reply NO and we will pause follow-up.";
    return `Hi ${intro},\n\nI’m reaching out from Office & Co on behalf of ${companyName || "your team"}.\n\n${summary}\n\n${yesNo}\n\nThank you,\nOffice & Co\nhello@officeand.co`;
  }, [body, callbackPreference, companyName, contactName, isCampaign, templateValues]);

  const renderedSubject = renderTemplateText(subject.trim());
  const renderedBody = renderTemplateText(body.trim());

  const isReady = isCampaign
    ? campaignConsentConfirmed &&
      selectedCampaignProspectIds.length > 0 &&
      campaignEmailCount > 0 &&
      !campaignCountError &&
      Boolean(renderedSubject) &&
      Boolean(renderedBody) &&
      Boolean(campaignName.trim()) &&
      !/\{\{[a-z_]+\}\}/i.test(`${renderedSubject}\n${renderedBody}`)
    : Boolean(renderedSubject) &&
      Boolean(renderedBody) &&
      missingTemplateTokens.length === 0 &&
      Boolean(toEmail.trim());

  const currentStep: 1 | 2 | 3 = sending ? 3 : isReady ? 2 : 1;

  const refreshDeliveries = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setDeliveryLoading(true);
    const { data } = await supabase
      .from("outreach_deliveries")
      .select(
        "id,recipient_email,company_name,subject,status,consent_status,sent_at,replied_at,created_at,campaign_id",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (data) setDeliveries(data as OutreachDelivery[]);
    setDeliveryLoading(false);
  };

  const send = async () => {
    if (!canSend) {
      toast.error("Only sales managers and executives can send outreach emails.");
      return;
    }
    if (!renderedSubject || !renderedBody) {
      toast.error("Subject and message body are required.");
      return;
    }
    if (!isCampaign && missingTemplateTokens.length) {
      toast.error(
        `Complete the template fields: ${missingTemplateTokens
          .map((token) => templateFieldLabels[token] ?? token)
          .join(", ")}.`,
      );
      return;
    }
    if (
      isCampaign &&
      (!campaignName.trim() ||
        !campaignConsentConfirmed ||
        !selectedCampaignProspectIds.length ||
        !campaignEmailCount)
    ) {
      toast.error(
        "Choose at least one recipient, confirm their opt-in, and add an email subject and message.",
      );
      return;
    }
    if (isCampaign && /\{\{[a-z_]+\}\}/i.test(`${renderedSubject}\n${renderedBody}`)) {
      toast.error(
        "Campaign messages cannot contain unfilled template fields. Select or compose campaign-specific copy.",
      );
      return;
    }
    if (!isCampaign && !toEmail.trim()) {
      toast.error("A recipient email address is required.");
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Supabase is not configured in this environment.");
      return;
    }

    setSending(true);
    const { data, error } = await supabase.functions.invoke("send-outreach", {
      body: isCampaign
        ? {
            action: "campaign",
            campaignName: campaignName.trim(),
            prospectIds: selectedCampaignProspectIds,
            subject: renderedSubject,
            body: renderedBody,
            consentConfirmed: campaignConsentConfirmed,
          }
        : {
            toEmail: toEmail.trim(),
            subject: renderedSubject,
            body: renderedBody,
            companyName: companyName.trim(),
            contactName: contactName.trim(),
            prospectId: selectedProspectId || null,
            callbackPreference,
            consentStatus,
          },
    });
    setSending(false);

    if (error) {
      let detail = error.message || "The email could not be sent.";
      if (error.context instanceof Response) {
        const responseBody = (await error.context
          .clone()
          .json()
          .catch(() => null)) as { error?: string } | null;
        detail = responseBody?.error ?? detail;
      }
      toast.error(detail);
      return;
    }

    const summary = isCampaign
      ? `Campaign ${data?.status}: ${data?.sent ?? 0} sent, ${data?.suppressed ?? 0} suppressed, ${data?.failed ?? 0} failed.`
      : data?.messageId
        ? `Email queued and logged: ${data.messageId}`
        : "Email sent successfully.";
    toast.success(summary);
    setSelectedCampaignProspectIds([]);
    setCampaignConsentConfirmed(false);
    void refreshDeliveries();
  };

  if (!canSend) {
    return (
      <div className="mx-auto max-w-4xl py-16 text-center">
        <ShieldCheck className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-4 font-display text-xl font-semibold">Access restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Prospect outreach is limited to Sales/CRM Managers and platform executives.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Prospect intelligence · outreach"
        title="Prospect outreach"
        description={
          isCampaign
            ? "Compose a campaign for unique crawler-captured email addresses."
            : "Send a consent-aware follow-up with a clear yes/no call option."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border bg-card p-0.5">
              <Button
                asChild
                size="sm"
                variant={isCampaign ? "ghost" : "secondary"}
                className="h-7 px-2.5 text-xs"
              >
                <Link to="/outreach" search={{ mode: "single" }}>
                  Single email
                </Link>
              </Button>
              <Button
                asChild
                size="sm"
                variant={isCampaign ? "secondary" : "ghost"}
                className="h-7 px-2.5 text-xs"
              >
                <Link to="/outreach" search={{ mode: "campaign" }}>
                  Campaign
                </Link>
              </Button>
            </div>
            <Badge variant="outline" className="gap-1.5">
              <Sparkles className="size-3.5" />
              Server-side delivery
            </Badge>
          </div>
        }
      />

      {/* ── Step indicator + compact status bar ───────────────────── */}
      <section className="mb-4 rounded-lg border bg-card">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <StepIndicator step={currentStep} isCampaign={isCampaign} />
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {isCampaign ? (
              <>
                <span>
                  <strong className="text-foreground">{selectedCampaignProspectIds.length}</strong>{" "}
                  selected
                </span>
                <span>
                  <strong className="text-foreground">{campaignEmailCount}</strong> emails
                </span>
              </>
            ) : (
              <>
                <span>
                  <strong className="text-foreground">{templates.length}</strong> templates
                </span>
                <span>
                  <strong className="text-foreground">{deliveries.length}</strong> recent sends
                </span>
              </>
            )}
          </div>
        </div>
      </section>

      <Tabs defaultValue="compose" className="mt-5">
        <TabsList aria-label="Outreach workspace">
          <TabsTrigger value="compose">Compose</TabsTrigger>
          <TabsTrigger value="history">
            Delivery history
            <Badge variant="secondary" className="ml-2">
              {deliveries.length}
            </Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="compose" className="mt-4">
      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        {/* ── Compose column ──────────────────────────────────────── */}
        <section className="space-y-4">
          {/* Recipients card */}
          <div className="rounded-xl border bg-card">
            <div className="border-b px-5 py-3">
              <h2 className="font-display text-base font-semibold">
                {isCampaign ? "Campaign recipients" : "Recipient"}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isCampaign
                  ? "Choose which discovered prospects receive this campaign. Each email is sent individually."
                  : "Pick a discovered prospect or enter a recipient manually."}
              </p>
            </div>
            <div className="space-y-4 p-5">
              {isCampaign ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="campaign-name">Campaign name</Label>
                    <Input
                      id="campaign-name"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      maxLength={120}
                    />
                  </div>

                  <div className="rounded-md border bg-muted/10">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="size-4 text-brand" />
                        <span className="font-medium">
                          {selectedCampaignProspectIds.length} selected ·{" "}
                          {campaignEmailCount} email
                          {campaignEmailCount === 1 ? "" : "s"}
                        </span>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={selectVisibleCampaignProspects}
                        disabled={prospectCandidates.length === 0}
                      >
                        {prospectCandidates.every((p) =>
                          selectedCampaignProspectIds.includes(p.id),
                        )
                          ? "Clear visible"
                          : "Select visible"}
                      </Button>
                    </div>
                    <div className="space-y-2 border-b px-3 py-3">
                      <Label htmlFor="campaign-audience">Campaign audience</Label>
                      <Select
                        value={campaignAudience}
                        onValueChange={(value) => {
                          setCampaignAudience(value as typeof campaignAudience);
                          setProspectSearch("");
                          setCampaignConsentConfirmed(false);
                        }}
                      >
                        <SelectTrigger id="campaign-audience">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All branches</SelectItem>
                          <SelectItem value="kyalami">Kyalami</SelectItem>
                          <SelectItem value="rosebank">Rosebank</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {campaignAudience === "all"
                          ? "Includes every crawled business with a captured email address."
                          : `Includes businesses crawled around ${audienceBranch?.name ?? campaignAudience}.`}
                      </p>
                    </div>
                    <div className="border-b px-3 py-2">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={prospectSearch}
                          onChange={(e) => setProspectSearch(e.target.value)}
                          placeholder="Search prospect or website"
                          className="h-8 pl-8 text-sm"
                        />
                      </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {prospectCandidates.length === 0 ? (
                        <p className="p-3 text-xs text-muted-foreground">
                          No crawler-captured email contacts match.
                        </p>
                      ) : (
                        <div className="divide-y">
                          {prospectCandidates.map((prospect) => {
                            const emails = getProspectEmails(prospect);
                            const isSelected = selectedCampaignProspectIds.includes(
                              prospect.id,
                            );
                            return (
                              <label
                                key={prospect.id}
                                className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40 ${
                                  isSelected ? "bg-brand/5" : ""
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleCampaignProspect(prospect.id)}
                                  className="mt-0.5 size-4 shrink-0 accent-current"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium">
                                    {prospect.company_name}
                                  </span>
                                  <span className="block truncate text-xs text-muted-foreground">
                                    {emails.join(", ")}
                                    {prospect.website_domain
                                      ? ` · ${prospect.website_domain}`
                                      : ""}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {campaignCountError && (
                    <p role="alert" className="text-xs text-destructive">
                      Could not load campaign recipients: {campaignCountError}
                    </p>
                  )}

                  <label className="flex cursor-pointer items-start gap-3 rounded-md border bg-muted/10 p-3 text-sm transition-colors hover:bg-muted/20">
                    <input
                      type="checkbox"
                      checked={campaignConsentConfirmed}
                      onChange={(e) => setCampaignConsentConfirmed(e.target.checked)}
                      className="mt-0.5 size-4 shrink-0 accent-current"
                    />
                    <span>
                      I confirm I have documented consent or another valid legal basis to send
                      marketing emails to every selected contact, and none have opted out.
                    </span>
                  </label>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="single-prospect">Captured prospect (optional)</Label>
                    <Select
                      value={selectedProspectId || "manual"}
                      onValueChange={(value) => {
                        setSelectedProspectContactEmail("");
                        chooseProspect(value === "manual" ? "" : value);
                      }}
                    >
                      <SelectTrigger id="single-prospect">
                        <SelectValue placeholder="Choose a saved prospect" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">Enter recipient manually</SelectItem>
                        {prospects
                          .filter((prospect) => getProspectEmails(prospect).length > 0)
                          .map((prospect) => (
                            <SelectItem key={prospect.id} value={prospect.id}>
                              {prospect.company_name} · {getProspectEmails(prospect)[0]}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="company-name">Company</Label>
                      <Input
                        id="company-name"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contact-name">Contact name</Label>
                      <Input
                        id="contact-name"
                        value={contactName}
                        onChange={(e) => setContactName(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    {selectedProspect && getProspectEmails(selectedProspect).length > 1 && (
                      <div className="mb-2 space-y-2">
                        <Label htmlFor="captured-recipient">Captured email address</Label>
                        <Select
                          value={
                            selectedProspectContactEmail || getProspectEmails(selectedProspect)[0]
                          }
                          onValueChange={(value) => {
                            setSelectedProspectContactEmail(value);
                            setToEmail(value);
                          }}
                        >
                          <SelectTrigger id="captured-recipient">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {getProspectEmails(selectedProspect).map((email) => (
                              <SelectItem key={email} value={email}>
                                {email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <Label htmlFor="recipient-email">Recipient email</Label>
                    <Input
                      id="recipient-email"
                      type="email"
                      value={toEmail}
                      onChange={(e) => {
                        setToEmail(e.target.value);
                        if (e.target.value !== selectedProspectContactEmail)
                          setSelectedProspectContactEmail("");
                      }}
                      placeholder="name@company.com"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Template + content card */}
          <div className="rounded-xl border bg-card">
            <div className="border-b px-5 py-3">
              <h2 className="font-display text-base font-semibold">
                {isCampaign ? "Campaign content" : "Template & content"}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {isCampaign
                  ? "Compose the subject and body that will be sent to each recipient individually."
                  : "Start from a saved template or compose your own message."}
              </p>
            </div>
            <div className="space-y-4 p-5">
              {!isCampaign && (
                <div className="space-y-2">
                  <Label htmlFor="saved-template">Saved template</Label>
                  <Select
                    value={selectedTemplateId || "none"}
                    onValueChange={(value) => chooseTemplate(value === "none" ? "" : value)}
                  >
                    <SelectTrigger id="saved-template">
                      <SelectValue placeholder="Start from scratch" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Start from scratch</SelectItem>
                      {templates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {templates.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No enabled CRM templates are available; compose your own message below.
                    </p>
                  )}
                  {templateError && (
                    <p className="text-xs text-muted-foreground">
                      Saved templates unavailable: {templateError}
                    </p>
                  )}
                </div>
              )}

              {!isCampaign && templateTokens.length > 0 && (
                <div className="rounded-md border bg-muted/10 p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium">
                    <FileText className="size-3.5 text-brand" />
                    Template fields
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {templateTokens.map((token) => (
                      <div key={token} className="space-y-1.5">
                        <Label htmlFor={`template-${token}`} className="text-xs">
                          {templateFieldLabels[token] ?? token.replace(/_/g, " ")}
                        </Label>
                        <Input
                          id={`template-${token}`}
                          value={templateValues[token] ?? ""}
                          onChange={(e) =>
                            setTemplateValues((current) => ({
                              ...current,
                              [token]: e.target.value,
                            }))
                          }
                          placeholder={`Enter ${
                            templateFieldLabels[token]?.toLowerCase() ??
                            token.replace(/_/g, " ")
                          }`}
                          className="h-8 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="subject">Email subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={200}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="message-body">Message</Label>
                <Textarea
                  id="message-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={6}
                  maxLength={5000}
                />
              </div>

              {!isCampaign && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="callback-preference">Call preference</Label>
                    <Select
                      value={callbackPreference}
                      onValueChange={(value) =>
                        setCallbackPreference(value as typeof callbackPreference)
                      }
                    >
                      <SelectTrigger id="callback-preference">
                        <SelectValue placeholder="Choose a default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes — ask for a quick call</SelectItem>
                        <SelectItem value="no">No — pause follow-up</SelectItem>
                        <SelectItem value="unspecified">Unspecified — neutral ask</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="consent-status">Consent status</Label>
                    <Select
                      value={consentStatus}
                      onValueChange={(value) =>
                        setConsentStatus(value as typeof consentStatus)
                      }
                    >
                      <SelectTrigger id="consent-status">
                        <SelectValue placeholder="Consent state" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="explicitly_opted_in">Explicitly opted in</SelectItem>
                        <SelectItem value="requires_confirmation">
                          Requires confirmation
                        </SelectItem>
                        <SelectItem value="not_requested">Not requested</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {/* Sticky send bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3">
              <p className="text-xs text-muted-foreground">
                {isCampaign
                  ? "Each message is sent separately. Confirm opted-in recipients before sending."
                  : "This send includes a clear yes/no CTA and should only be used where a compliant consent path exists."}
              </p>
              <Button
                type="button"
                onClick={() => void send()}
                disabled={sending || !isReady}
                className="gap-2"
              >
                {sending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                {sending
                  ? "Sending…"
                  : isCampaign
                    ? `Send to ${campaignEmailCount}`
                    : "Send email"}
              </Button>
            </div>
          </div>
        </section>

        {/* ── Preview + guardrails ────────────────────────────────── */}
        <aside className="space-y-4">
          <EmailPreviewFrame
            subject={renderedSubject}
            body={preview}
            toEmail={
              isCampaign ? `${campaignEmailCount} recipients` : toEmail || companyName
            }
            companyName={companyName}
          />
          <CompliancePanel
            isCampaign={isCampaign}
            consentConfirmed={campaignConsentConfirmed}
            selectedCount={selectedCampaignProspectIds.length}
            emailCount={campaignEmailCount}
            countError={campaignCountError}
            missingTemplateTokens={missingTemplateTokens}
          />
        </aside>
      </div>

        </TabsContent>
        <TabsContent value="history" className="mt-4">
      {/* ── Delivery history ──────────────────────────────────────── */}
      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Delivery history</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Latest {deliveries.length} outreach attempts and prospect responses.
            </p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <Select value={historyFilter} onValueChange={setHistoryFilter}>
              <SelectTrigger aria-label="Filter delivery history" className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="replied">Replied</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="bounced">Bounced</SelectItem>
                <SelectItem value="unsubscribed">Opted out</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Refresh delivery history"
              title="Refresh delivery history"
              onClick={() => void refreshDeliveries()}
              disabled={deliveryLoading}
            >
              <RefreshCw className={`size-4 ${deliveryLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {deliveryLoading ? (
          <SkeletonList />
        ) : deliveryError ? (
          <div
            role="alert"
            className="rounded-lg border border-warning/30 bg-warning/10 px-5 py-4 text-sm"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" />
              <div>
                <p className="font-medium">Delivery history is unavailable</p>
                <p className="mt-1 text-xs text-muted-foreground">{deliveryError}</p>
              </div>
            </div>
          </div>
        ) : visibleDeliveries.length === 0 ? (
          <EmptyState
            icon={<Mail className="size-8" />}
            title={deliveries.length ? "No deliveries match" : "No outreach sent yet"}
            description={
              deliveries.length
                ? "Try a different status filter to see more delivery attempts."
                : "Sends made from this page will appear here and in the outreach_deliveries table."
            }
          />
        ) : (
          <div className="divide-y overflow-hidden rounded-lg border bg-card">
            {visibleDeliveries.map((delivery) => (
              <article
                key={delivery.id}
                className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/20 sm:flex-row sm:items-center sm:justify-between sm:px-5"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                    <Building2 className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {delivery.company_name || delivery.recipient_email}
                      </span>
                      <Badge variant={deliveryVariant(delivery.status)}>
                        {statusLabel(delivery.status)}
                      </Badge>
                      {delivery.campaign_id && (
                        <Badge variant="secondary" className="gap-1">
                          <Users className="size-3" />
                          Campaign
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {delivery.recipient_email} · {delivery.subject}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-0.5 text-xs text-muted-foreground sm:items-end">
                  <p>{formatDeliveryDate(delivery.sent_at ?? delivery.created_at)}</p>
                  <p className="capitalize">
                    Consent: {delivery.consent_status.replace(/_/g, " ")}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}