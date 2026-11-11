import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertCircle,
  Building2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Globe2,
  LoaderCircle,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Play,
  RefreshCw,
  Search,
  Settings2,
  Signal,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSupabaseClient } from "@/lib/supabase";
import { useRole } from "@/lib/role-context";

type CrawlJob = {
  id: string;
  branch_id: string | null;
  connector: string;
  status: string;
  records_seen: number;
  records_created: number;
  records_updated: number;
  records_skipped: number;
  activity: { candidates?: CrawlCandidateActivity[] } | null;
  error_summary: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

type CrawlCandidateActivity = {
  provider_id: string;
  company_name: string;
  website_domain: string | null;
  source_url: string;
  distance_km: number;
  status: "new" | "created" | "duplicate" | "failed";
  detail?: string;
};

type ProspectProfile = {
  company_name: string;
  website_domain: string | null;
  address: string | null;
  city: string | null;
  recommended_branch_id: string | null;
};

type ProspectProfileRelation = ProspectProfile | ProspectProfile[] | null;

type CapturedSource = {
  id: string;
  source_type: string;
  source_url: string;
  page_title: string | null;
  observed_at: string;
  prospect_id: string;
  metadata: { branch_id?: string; distance_km?: number } | null;
  prospect_profiles: ProspectProfileRelation;
};

type CrawledAddress = {
  prospectId: string;
  companyName: string;
  websiteDomain: string | null;
  address: string | null;
  city: string | null;
  distanceKm: number | null;
  sourceUrl: string;
  observedAt: string;
};

type CapturedContact = {
  id: string;
  prospect_id: string;
  kind: "email" | "phone" | "social" | "contact_page" | "live_chat";
  value: string;
  label: string | null;
  confidence: number | null;
  first_seen_at: string;
  prospect_profiles: ProspectProfileRelation;
};

type BranchRow = { id: string; name: string; city: string | null; region: string | null };
type BranchTarget = {
  branch_id: string;
  branch_address: string | null;
  geocode_label: string | null;
  latitude: number;
  longitude: number;
  radius_km: number;
  enabled: boolean;
};

function getProspectProfile(relation: ProspectProfileRelation) {
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}

function getContactHref(contact: CapturedContact) {
  if (contact.kind === "email") return `mailto:${contact.value}`;
  if (contact.kind === "phone") return `tel:${contact.value}`;
  if (contact.value.startsWith("https://") || contact.value.startsWith("http://")) {
    return contact.value;
  }
  return undefined;
}

function getSocialPlatform(value: string) {
  try {
    const domain = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
    const platforms: Record<string, string> = {
      "facebook.com": "Facebook",
      "instagram.com": "Instagram",
      "linkedin.com": "LinkedIn",
      "tiktok.com": "TikTok",
      "twitter.com": "X",
      "x.com": "X",
      "youtube.com": "YouTube",
    };
    return platforms[domain] ?? domain;
  } catch {
    return "Social";
  }
}

const sourceLabels: Record<string, string> = {
  discovery_provider: "Discovery result",
  company_website: "Company website",
  company_social: "Website-linked social",
  business_directory: "Business directory",
  manual: "Manual source",
};

function formatDate(value: string | null) {
  if (!value) return "Not started";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

const contactIcons = {
  email: Mail,
  phone: Phone,
  social: Globe2,
  contact_page: ExternalLink,
  live_chat: MessageCircle,
} as const;

type ContactKind = keyof typeof contactIcons;

function labelForKind(kind: ContactKind, count: number) {
  const plural = count === 1 ? "" : "s";
  const labels: Record<ContactKind, string> = {
    email: `email${plural}`,
    phone: `phone${plural}`,
    social: `social${plural}`,
    contact_page: `contact page${plural}`,
    live_chat: `chat${plural}`,
  };
  return labels[kind];
}

function groupContactsByKind(contacts: CapturedContact[]) {
  return contacts.reduce<Partial<Record<ContactKind, CapturedContact[]>>>(
    (acc, contact) => {
      (acc[contact.kind] ??= []).push(contact);
      return acc;
    },
    {},
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-lg border bg-card p-4">
          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3 w-64 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-3 w-32 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border bg-card px-5 py-12 text-center">
      <div className="mx-auto text-muted-foreground/60">{icon}</div>
      <h3 className="mt-3 font-medium">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export const Route = createFileRoute("/crawler-intelligence")({
  head: () => ({ meta: [{ title: "Crawler Activity — WorkspaceOS" }] }),
  component: CrawlerIntelligence,
});

function CrawlerIntelligence() {
  const { role } = useRole();
  const canView =
    role.id === "sales-manager" ||
    role.id === "crm-manager" ||
    role.id === "group-ceo" ||
    role.id === "superadmin";
  const [jobs, setJobs] = useState<CrawlJob[]>([]);
  const [sources, setSources] = useState<CapturedSource[]>([]);
  const [contacts, setContacts] = useState<CapturedContact[]>([]);
  const [branches, setBranches] = useState<Map<string, string>>(new Map());
  const [branchOptions, setBranchOptions] = useState<BranchRow[]>([]);
  const [targets, setTargets] = useState<Map<string, BranchTarget>>(new Map());
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [branchAddress, setBranchAddress] = useState("");
  const [actionLoading, setActionLoading] = useState<"configure" | "run" | null>(null);
  const [actionNotice, setActionNotice] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sourceType, setSourceType] = useState("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedCompanyDetails, setSelectedCompanyDetails] = useState<{
    companyName: string;
    address: string | null;
    city: string | null;
    websiteDomain: string | null;
    contacts: CapturedContact[];
  } | null>(null);
  const canConfigure = role.id === "group-ceo" || role.id === "superadmin";
  const selectedTarget = targets.get(selectedBranchId);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    const loadCrawlData = async () => {
      const [jobsResult, sourcesResult, contactsResult, branchesResult, targetsResult] =
        await Promise.all([
          supabase
            .from("prospect_jobs")
            .select(
              "id,branch_id,connector,status,records_seen,records_created,records_updated,records_skipped,activity,error_summary,started_at,finished_at,created_at",
            )
            .order("created_at", { ascending: false })
            .limit(100),
          supabase
            .from("prospect_sources")
            .select(
              "id,source_type,source_url,page_title,observed_at,prospect_id,metadata,prospect_profiles(company_name,website_domain,address,city,recommended_branch_id)",
            )
            .order("observed_at", { ascending: false })
            .limit(500),
          supabase
            .from("prospect_contacts")
            .select(
              "id,prospect_id,kind,value,label,confidence,first_seen_at,prospect_profiles(company_name,website_domain,address,city)",
            )
            .order("first_seen_at", { ascending: false })
            .limit(500),
          supabase
            .from("branches")
            .select("id,name,city,region")
            .eq("status", "live")
            .order("name"),
          supabase
            .from("prospect_branch_targets")
            .select("branch_id,branch_address,geocode_label,latitude,longitude,radius_km,enabled"),
        ]);
      if (!active) return;
      const queryError = [
        jobsResult.error,
        sourcesResult.error,
        contactsResult.error,
        branchesResult.error,
        targetsResult.error,
      ].find((item) => item !== null);
      if (queryError) {
        const missingCrawlerTable =
          queryError.message.includes('relation "public.prospect_') &&
          queryError.message.includes("does not exist");
        const missingActivitySchema =
          queryError.message.includes("records_skipped") ||
          queryError.message.includes("prospect_crawl_candidates");
        setError(
          missingCrawlerTable
            ? "Crawler tables are not installed. Apply the Prospect Intelligence migrations first."
            : missingActivitySchema
              ? "Crawler activity schema is out of date. Apply the latest Prospect Intelligence migration."
              : queryError.message,
        );
      }
      setJobs((jobsResult.data ?? []) as CrawlJob[]);
      setSources((sourcesResult.data ?? []) as CapturedSource[]);
      setContacts((contactsResult.data ?? []) as CapturedContact[]);
      setBranches(
        new Map(
          ((branchesResult.data ?? []) as BranchRow[]).map((branch) => [branch.id, branch.name]),
        ),
      );
      const liveBranches = (branchesResult.data ?? []) as BranchRow[];
      setBranchOptions(liveBranches);
      setSelectedBranchId((current) => current || liveBranches[0]?.id || "");
      setTargets(
        new Map(
          ((targetsResult.data ?? []) as BranchTarget[]).map((target) => [
            target.branch_id,
            target,
          ]),
        ),
      );
      setLoading(false);
    };
    void loadCrawlData().catch((cause: unknown) => {
      if (!active) return;
      setError(cause instanceof Error ? cause.message : "Could not load crawler activity.");
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [canView, refreshKey]);

  useEffect(() => {
    setBranchAddress(targets.get(selectedBranchId)?.branch_address ?? "");
  }, [selectedBranchId, targets]);

  const configureBranch = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !selectedBranchId || !branchAddress.trim()) return;
    setActionLoading("configure");
    setActionNotice(null);
    const { data, error } = await supabase.functions.invoke("crawl-prospects", {
      body: { action: "configure", branch_id: selectedBranchId, address: branchAddress.trim() },
    });
    setActionLoading(null);
    if (error) {
      setActionNotice({ kind: "error", message: error.message });
      toast.error(error.message);
      return;
    }
    const message = `30 km search area saved for ${data.geocode_label}.`;
    setActionNotice({ kind: "success", message });
    toast.success(message);
    setRefreshKey((key) => key + 1);
  };

  const runCrawl = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || !selectedBranchId) return;
    setActionLoading("run");
    setActionNotice(null);
    const { data, error } = await supabase.functions.invoke("crawl-prospects", {
      body: { action: "run", branch_id: selectedBranchId },
    });
    setActionLoading(null);
    if (error) {
      let detail = error.message;
      if (error.context instanceof Response) {
        const body = (await error.context
          .clone()
          .json()
          .catch(() => null)) as {
          error?: string;
        } | null;
        detail = body?.error ?? detail;
      }
      setActionNotice({ kind: "error", message: `Crawl failed: ${detail}` });
      toast.error(detail);
      setRefreshKey((key) => key + 1);
      return;
    }
    const message =
      data.status === "failed"
        ? `Crawl failed: ${data.error ?? "The crawler could not complete."}`
        : `Crawl ${data.status}: ${data.records_created} new businesses, ${data.records_skipped ?? 0} already seen and skipped (${data.records_seen} listings checked).${data.error ? ` ${data.error}` : ""}`;
    setActionNotice({ kind: data.status === "succeeded" ? "success" : "error", message });
    if (data.status !== "succeeded") toast.error(message);
    else toast.success(message);
    setRefreshKey((key) => key + 1);
  };

  const filteredSources = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sources.filter((source) => {
      const company = getProspectProfile(source.prospect_profiles);
      const matchesType = sourceType === "all" || source.source_type === sourceType;
      const matchesQuery =
        !normalizedQuery ||
        [
          source.source_url,
          source.page_title,
          company?.company_name,
          company?.website_domain,
          company?.city,
        ].some((value) => value?.toLowerCase().includes(normalizedQuery));
      return matchesType && matchesQuery;
    });
  }, [sources, query, sourceType]);

  const crawledAddressesByBranch = useMemo(() => {
    const addresses = new Map<string, CrawledAddress[]>();
    const seenProspects = new Set<string>();
    const normalizedQuery = query.trim().toLowerCase();

    for (const source of sources) {
      if (source.source_type !== "discovery_provider" || seenProspects.has(source.prospect_id)) {
        continue;
      }
      const profile = getProspectProfile(source.prospect_profiles);
      const branchId = source.metadata?.branch_id ?? profile?.recommended_branch_id;
      if (!branchId) continue;

      const address: CrawledAddress = {
        prospectId: source.prospect_id,
        companyName: profile?.company_name ?? source.page_title ?? "Unknown business",
        websiteDomain: profile?.website_domain ?? null,
        address: profile?.address ?? null,
        city: profile?.city ?? null,
        distanceKm: source.metadata?.distance_km ?? null,
        sourceUrl: source.source_url,
        observedAt: source.observed_at,
      };
      if (
        normalizedQuery &&
        ![address.companyName, address.websiteDomain, address.address, address.city].some(
          (value) => value?.toLowerCase().includes(normalizedQuery),
        )
      ) {
        continue;
      }

      seenProspects.add(source.prospect_id);
      const branchAddresses = addresses.get(branchId) ?? [];
      branchAddresses.push(address);
      addresses.set(branchId, branchAddresses);
    }

    return addresses;
  }, [sources, query]);

  const filteredContacts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return contacts.filter((contact) => {
      const company = getProspectProfile(contact.prospect_profiles);
      return (
        !normalizedQuery ||
        [
          contact.value,
          contact.label,
          company?.company_name,
          company?.website_domain,
          company?.city,
        ].some((value) => value?.toLowerCase().includes(normalizedQuery))
      );
    });
  }, [contacts, query]);

  const groupedContacts = useMemo(() => {
    const grouped = new Map<
      string,
      {
        companyName: string;
        address: string | null;
        city: string | null;
        websiteDomain: string | null;
        contacts: CapturedContact[];
      }
    >();

    filteredContacts.forEach((contact) => {
      const company = getProspectProfile(contact.prospect_profiles);
      const companyKey = company?.company_name ?? contact.prospect_id;
      const existing = grouped.get(companyKey);

      if (existing) {
        existing.address ??= company?.address ?? null;
        existing.city ??= company?.city ?? null;
        existing.websiteDomain ??= company?.website_domain ?? null;
        existing.contacts.push(contact);
      } else {
        grouped.set(companyKey, {
          companyName: company?.company_name ?? "Unknown company",
          address: company?.address ?? null,
          city: company?.city ?? null,
          websiteDomain: company?.website_domain ?? null,
          contacts: [contact],
        });
      }
    });

    return [...grouped.values()];
  }, [filteredContacts]);

  const successfulJobs = jobs.filter(
    (job) => job.status === "succeeded" || job.status === "partial",
  ).length;
  const failedJobs = jobs.filter((job) => job.status === "failed").length;
  const recordsSeen = jobs.reduce((sum, job) => sum + job.records_seen, 0);
  const latestJob = jobs.find((job) => job.branch_id === selectedBranchId);
  const totalBusinesses = useMemo(
    () => [...crawledAddressesByBranch.values()].reduce((sum, list) => sum + list.length, 0),
    [crawledAddressesByBranch],
  );
  const branchAddressTabs = [
    {
      value: "kyalami",
      label: "Kyalami",
      branch: branchOptions.find((branch) => branch.name.toLowerCase().includes("kyalami")),
    },
    {
      value: "rosebank",
      label: "Rosebank",
      branch: branchOptions.find((branch) => branch.name.toLowerCase().includes("rosebank")),
    },
  ];

  if (!canView) {
    return (
      <div className="mx-auto max-w-4xl py-16 text-center">
        <AlertCircle className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-4 font-display text-xl font-semibold">Access restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Crawler activity is available to Sales/CRM Managers and platform executives.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-375">
      <PageHeader
        eyebrow="Prospect Intelligence · Discovery"
        title="Crawler Activity"
        description="Discover businesses within 30 km of Office & Co branches and review their publicly listed contact details."
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey((key) => key + 1)}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {/* ── Compact status bar ─────────────────────────────────────── */}
      <section className="mb-4 rounded-lg border bg-card">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
            <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
              <SelectTrigger className="h-9 w-auto min-w-40 gap-1.5">
                <Building2 className="size-4 text-muted-foreground" />
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {branchOptions.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex min-w-0 items-center gap-2 text-sm">
              <MapPin className="size-4 shrink-0 text-brand" />
              {selectedTarget?.enabled ? (
                <span className="truncate text-muted-foreground">
                  {selectedTarget.geocode_label ?? selectedTarget.branch_address} ·{" "}
                  {selectedTarget.radius_km} km
                </span>
              ) : (
                <span className="truncate text-muted-foreground">No search area configured</span>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                <strong className="text-foreground">{successfulJobs}</strong> ok
              </span>
              <span>
                <strong className="text-foreground">{recordsSeen}</strong> seen
              </span>
              {failedJobs > 0 && (
                <span className="text-destructive">
                  <strong>{failedJobs}</strong> failed
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canConfigure && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Settings2 className="size-4" />
                    Configure area
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Branch search area</DialogTitle>
                    <DialogDescription>
                      The crawl is limited to a 30 km radius from this address.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label htmlFor="branch-address" className="text-xs font-medium">
                        Exact street address
                      </label>
                      <Input
                        id="branch-address"
                        value={branchAddress}
                        onChange={(event) => setBranchAddress(event.target.value)}
                        placeholder="Street, suburb, city, postal code"
                        maxLength={300}
                      />
                    </div>
                    {selectedTarget?.geocode_label && (
                      <p className="text-xs text-muted-foreground">
                        Map match: {selectedTarget.geocode_label}
                      </p>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      type="button"
                      onClick={() => void configureBranch()}
                      disabled={
                        actionLoading !== null || !selectedBranchId || !branchAddress.trim()
                      }
                    >
                      {actionLoading === "configure" ? "Saving…" : "Save 30 km area"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            <Button
              type="button"
              onClick={() => void runCrawl()}
              disabled={
                actionLoading !== null ||
                !selectedBranchId ||
                !selectedTarget?.enabled ||
                selectedTarget.radius_km !== 30
              }
              size="sm"
              className="gap-2"
            >
              {actionLoading === "run" ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              {actionLoading === "run" ? "Crawling…" : "Start crawl"}
            </Button>
          </div>
        </div>
      </section>

      {/* ── Notices ───────────────────────────────────────────────── */}
      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <p className="font-medium">Crawler data unavailable</p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          </div>
        </div>
      )}

      {actionNotice && (
        <div
          role={actionNotice.kind === "error" ? "alert" : "status"}
          className={`mb-4 rounded-md border p-3 text-sm ${
            actionNotice.kind === "error"
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : "border-success/30 bg-success/5 text-foreground"
          }`}
        >
          {actionNotice.message}
        </div>
      )}

      {/* ── Main workspace ────────────────────────────────────────── */}
      <Tabs defaultValue="businesses" className="mt-2">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList aria-label="Crawler workspace" className="flex-wrap">
            <TabsTrigger value="businesses" className="gap-1.5">
              <Building2 className="size-3.5" />
              Businesses
              <span className="ml-1 rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
                {totalBusinesses}
              </span>
            </TabsTrigger>
            <TabsTrigger value="contacts" className="gap-1.5">
              <Signal className="size-3.5" />
              Contacts
              <span className="ml-1 rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
                {contacts.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="sources" className="gap-1.5">
              <Globe2 className="size-3.5" />
              Sources
              <span className="ml-1 rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
                {sources.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="runs" className="gap-1.5">
              <Activity className="size-3.5" />
              Runs
              <span className="ml-1 rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
                {jobs.length}
              </span>
            </TabsTrigger>
          </TabsList>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Company, address, contact…"
                className="h-9 pl-8"
              />
            </div>
            <Select value={sourceType} onValueChange={setSourceType}>
              <SelectTrigger className="h-9 w-full sm:w-44">
                <SelectValue placeholder="All source types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All source types</SelectItem>
                {Object.entries(sourceLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── BUSINESSES ───────────────────────────────────────────── */}
        <TabsContent value="businesses" className="mt-0">
          {latestJob && (
            <details className="group mb-4 rounded-lg border bg-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Badge
                    variant={
                      latestJob.status === "succeeded"
                        ? "default"
                        : latestJob.status === "failed"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {latestJob.status}
                  </Badge>
                  <span className="truncate text-sm">
                    {latestJob.records_created} new · {latestJob.records_skipped} seen ·{" "}
                    {latestJob.records_seen} checked
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                  <span className="hidden sm:inline">
                    {formatDate(latestJob.started_at ?? latestJob.created_at)}
                  </span>
                  <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
                </div>
              </summary>
              <div className="border-t px-4 py-3 text-xs text-muted-foreground">
                {latestJob.error_summary ? (
                  <p className="text-destructive">{latestJob.error_summary}</p>
                ) : (
                  <p>
                    Connector <strong>{latestJob.connector}</strong> · started{" "}
                    {formatDate(latestJob.started_at ?? latestJob.created_at)}
                    {latestJob.finished_at ? ` · finished ${formatDate(latestJob.finished_at)}` : ""}
                  </p>
                )}
              </div>
            </details>
          )}

          {loading ? (
            <SkeletonList />
          ) : crawledAddressesByBranch.size === 0 ? (
            <EmptyState
              icon={<Building2 className="size-8" />}
              title="No businesses crawled yet"
              description="Start a crawl to discover businesses within 30 km of a branch."
            />
          ) : (
            <Tabs defaultValue={branchAddressTabs[0]?.value ?? "kyalami"}>
              <TabsList className="mb-3 grid w-full grid-cols-2 sm:w-fit">
                {branchAddressTabs.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value}>
                    {tab.label}
                    <span className="ml-1.5 rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
                      {tab.branch ? (crawledAddressesByBranch.get(tab.branch.id) ?? []).length : 0}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
              {branchAddressTabs.map((tab) => {
                const addresses = tab.branch
                  ? crawledAddressesByBranch.get(tab.branch.id) ?? []
                  : [];
                return (
                  <TabsContent key={tab.value} value={tab.value} className="mt-0">
                    {!tab.branch ? (
                      <p className="rounded-lg border bg-card px-5 py-8 text-sm text-muted-foreground">
                        The {tab.label} branch is not configured as a live branch.
                      </p>
                    ) : addresses.length === 0 ? (
                      <p className="rounded-lg border bg-card px-5 py-8 text-sm text-muted-foreground">
                        {query.trim()
                          ? `No ${tab.label} businesses match your search.`
                          : `No businesses recorded for ${tab.label} yet.`}
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {addresses.map((address) => {
                          const companyContacts = filteredContacts.filter(
                            (c) => c.prospect_id === address.prospectId,
                          );
                          const contactsByKind = groupContactsByKind(companyContacts);
                          return (
                            <article
                              key={address.prospectId}
                              className="rounded-lg border bg-card p-4 transition-colors hover:border-brand/40"
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-sm font-semibold">
                                      {address.companyName}
                                    </h3>
                                    {address.distanceKm !== null && (
                                      <Badge variant="outline" className="gap-1">
                                        <MapPin className="size-3" />
                                        {address.distanceKm} km
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {address.address ?? "Address not listed"}
                                    {address.city ? ` · ${address.city}` : ""}
                                  </p>
                                  <p className="mt-0.5 text-xs text-muted-foreground">
                                    {address.websiteDomain ?? "No website"} · crawled{" "}
                                    {formatDate(address.observedAt)}
                                  </p>
                                </div>
                                <Button
                                  asChild
                                  variant="ghost"
                                  size="sm"
                                  className="w-fit shrink-0"
                                >
                                  <a
                                    href={address.sourceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Listing <ExternalLink className="ml-1 size-3.5" />
                                  </a>
                                </Button>
                              </div>

                              {companyContacts.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-3">
                                  {(
                                    [
                                      "email",
                                      "phone",
                                      "social",
                                      "contact_page",
                                      "live_chat",
                                    ] as const
                                  ).map((kind) => {
                                    const items = contactsByKind[kind];
                                    if (!items?.length) return null;
                                    const Icon = contactIcons[kind];
                                    return (
                                      <button
                                        key={kind}
                                        type="button"
                                        onClick={() =>
                                          setSelectedCompanyDetails({
                                            companyName: address.companyName,
                                            address: address.address,
                                            city: address.city,
                                            websiteDomain: address.websiteDomain,
                                            contacts: companyContacts,
                                          })
                                        }
                                        className="inline-flex items-center gap-1 rounded-full border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand"
                                      >
                                        <Icon className="size-3" />
                                        {items.length} {labelForKind(kind, items.length)}
                                      </button>
                                    );
                                  })}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setSelectedCompanyDetails({
                                        companyName: address.companyName,
                                        address: address.address,
                                        city: address.city,
                                        websiteDomain: address.websiteDomain,
                                        contacts: companyContacts,
                                      })
                                    }
                                    className="inline-flex items-center gap-1 rounded-full border border-brand/30 px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand/5"
                                  >
                                    View all contacts
                                    <ChevronRight className="size-3" />
                                  </button>
                                </div>
                              )}
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>
                );
              })}
            </Tabs>
          )}
        </TabsContent>

        {/* ── CONTACTS ─────────────────────────────────────────────── */}
        <TabsContent value="contacts" className="mt-0">
          {loading ? (
            <SkeletonList />
          ) : groupedContacts.length === 0 ? (
            <EmptyState
              icon={<Signal className="size-8" />}
              title={contacts.length ? "No contacts match your search" : "No contacts captured yet"}
              description="Public emails, phone numbers, and contact links appear here when a discovery connector stores them."
            />
          ) : (
            <div className="space-y-2">
              {groupedContacts.map((group) => {
                const byKind = groupContactsByKind(group.contacts);
                return (
                  <article
                    key={`${group.companyName}-${group.city ?? "unknown"}`}
                    className="rounded-lg border bg-card p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => setSelectedCompanyDetails(group)}
                          className="text-left text-sm font-semibold text-brand hover:underline"
                        >
                          {group.companyName}
                        </button>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {group.websiteDomain ?? "Website not captured"}
                          {group.city ? ` · ${group.city}` : ""}
                        </p>
                        {group.address && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{group.address}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(["email", "phone", "social", "contact_page"] as const).map((kind) => {
                          const items = byKind[kind];
                          if (!items?.length) return null;
                          const Icon = contactIcons[kind];
                          return (
                            <span
                              key={kind}
                              className="inline-flex items-center gap-1 rounded-full border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground"
                            >
                              <Icon className="size-3" />
                              {items.length} {labelForKind(kind, items.length)}
                            </span>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => setSelectedCompanyDetails(group)}
                          className="inline-flex items-center gap-1 rounded-full border border-brand/30 px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand/5"
                        >
                          View all
                          <ChevronRight className="size-3" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── SOURCES ──────────────────────────────────────────────── */}
        <TabsContent value="sources" className="mt-0">
          <p className="mb-3 text-xs text-muted-foreground">
            OpenStreetMap data is under ODbL, and website crawling respects robots.txt.
          </p>
          {loading ? (
            <SkeletonList />
          ) : filteredSources.length === 0 ? (
            <EmptyState
              icon={<Globe2 className="size-8" />}
              title={sources.length ? "No pages match" : "No sources captured yet"}
              description="Captured pages appear here when connectors store them in the prospect source timeline."
            />
          ) : (
            <div className="divide-y overflow-hidden rounded-lg border bg-card">
              {filteredSources.map((source) => (
                <article
                  key={source.id}
                  className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {source.page_title ||
                          getProspectProfile(source.prospect_profiles)?.company_name ||
                          source.source_url}
                      </span>
                      <Badge variant="outline">
                        {sourceLabels[source.source_type] ?? source.source_type}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {getProspectProfile(source.prospect_profiles)?.company_name ??
                        "Unknown company"}
                      {getProspectProfile(source.prospect_profiles)?.city
                        ? ` · ${getProspectProfile(source.prospect_profiles)?.city}`
                        : ""}{" "}
                      · {formatDate(source.observed_at)}
                    </p>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="w-fit shrink-0">
                    <a href={source.source_url} target="_blank" rel="noreferrer">
                      Open <ExternalLink className="ml-1 size-3.5" />
                    </a>
                  </Button>
                </article>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── RUNS ─────────────────────────────────────────────────── */}
        <TabsContent value="runs" className="mt-0">
          {loading ? (
            <SkeletonList />
          ) : jobs.length === 0 ? (
            <EmptyState
              icon={<Activity className="size-8" />}
              title="No runs recorded"
              description="This page lists connector runs after a discovery job is executed."
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full min-w-175 text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Branch</th>
                    <th className="px-4 py-2.5 font-medium">Connector</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Started</th>
                    <th className="px-4 py-2.5 text-right font-medium">Seen</th>
                    <th className="px-4 py-2.5 text-right font-medium">New</th>
                    <th className="px-4 py-2.5 text-right font-medium">Skipped</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-muted/20">
                      <td className="px-4 py-2.5 font-medium">
                        {branches.get(job.branch_id ?? "") ?? "All branches"}
                      </td>
                      <td className="px-4 py-2.5">{job.connector}</td>
                      <td className="px-4 py-2.5">
                        <Badge
                          variant={
                            job.status === "succeeded"
                              ? "default"
                              : job.status === "failed"
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {job.status}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                        {formatDate(job.started_at ?? job.created_at)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{job.records_seen}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {job.records_created}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {job.records_skipped}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Company details dialog ─────────────────────────────────── */}
      <Dialog
        open={selectedCompanyDetails !== null}
        onOpenChange={(open) => !open && setSelectedCompanyDetails(null)}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          {selectedCompanyDetails && (
            <>
              <DialogHeader className="text-left">
                <DialogTitle>{selectedCompanyDetails.companyName}</DialogTitle>
                <DialogDescription>
                  {selectedCompanyDetails.city ? `${selectedCompanyDetails.city} · ` : ""}
                  {selectedCompanyDetails.websiteDomain ?? "Public company profile"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5">
                {selectedCompanyDetails.address && (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                      Physical address
                    </h3>
                    <p className="rounded-md border p-3 text-sm">
                      {selectedCompanyDetails.address}
                    </p>
                  </section>
                )}
                {(["email", "phone", "contact_page", "live_chat"] as const).map((kind) => {
                  const matchingContacts = selectedCompanyDetails.contacts.filter(
                    (contact) => contact.kind === kind,
                  );
                  if (!matchingContacts.length) return null;
                  const heading =
                    kind === "contact_page"
                      ? "Contact pages"
                      : kind === "live_chat"
                        ? "Live chat"
                        : `${kind}s`;
                  return (
                    <section key={kind}>
                      <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                        {heading}
                      </h3>
                      <div className="space-y-2">
                        {matchingContacts.map((contact) => (
                          <a
                            key={contact.id}
                            className="block break-all rounded-md border p-3 text-sm text-brand hover:bg-muted/30 hover:underline"
                            href={getContactHref(contact)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {contact.value}
                          </a>
                        ))}
                      </div>
                    </section>
                  );
                })}
                {(() => {
                  const socialContacts = selectedCompanyDetails.contacts.filter(
                    (contact) => contact.kind === "social",
                  );
                  if (!socialContacts.length) return null;
                  return (
                    <section>
                      <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                        Public social profiles
                      </h3>
                      <div className="space-y-2">
                        {socialContacts.map((contact) => (
                          <a
                            key={contact.id}
                            className="flex min-w-0 items-center justify-between gap-3 rounded-md border p-3 text-sm hover:bg-muted/30"
                            href={getContactHref(contact)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <span className="min-w-0 break-all text-brand hover:underline">
                              {contact.value}
                            </span>
                            <span className="shrink-0 rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                              {getSocialPlatform(contact.value)}
                            </span>
                          </a>
                        ))}
                      </div>
                    </section>
                  );
                })()}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}