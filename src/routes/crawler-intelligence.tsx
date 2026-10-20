import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertCircle,
  Building2,
  ExternalLink,
  Globe2,
  LoaderCircle,
  MapPin,
  Play,
  RefreshCw,
  Search,
  Signal,
} from "lucide-react";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
  error_summary: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

type ProspectProfile = {
  company_name: string;
  website_domain: string | null;
  address: string | null;
  city: string | null;
};

type ProspectProfileRelation = ProspectProfile | ProspectProfile[] | null;

type CapturedSource = {
  id: string;
  source_type: string;
  source_url: string;
  page_title: string | null;
  observed_at: string;
  prospect_id: string;
  prospect_profiles: ProspectProfileRelation;
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

export const Route = createFileRoute("/crawler-intelligence")({
  head: () => ({ meta: [{ title: "Crawler Activity — WorkspaceOS" }] }),
  component: CrawlerIntelligence,
});

function CrawlerIntelligence() {
  const { role } = useRole();
  const canView =
    role.id === "sales-manager" || role.id === "crm-manager" || role.id === "group-ceo" || role.id === "superadmin";
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
              "id,branch_id,connector,status,records_seen,records_created,records_updated,error_summary,started_at,finished_at,created_at",
            )
            .order("created_at", { ascending: false })
            .limit(100),
          supabase
            .from("prospect_sources")
            .select(
              "id,source_type,source_url,page_title,observed_at,prospect_id,prospect_profiles(company_name,website_domain,address,city)",
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
        setError(
          queryError.message.includes("prospect_jobs") ||
            queryError.message.includes("prospect_sources") ||
            queryError.message.includes("prospect_contacts")
            ? "Crawler tables are not installed. Apply the Prospect Intelligence migrations first."
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
        : `Crawl ${data.status}: ${data.records_created} new businesses, ${data.records_updated} updated (${data.records_seen} listings checked).${data.error ? ` ${data.error}` : ""}`;
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

      {error && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm"
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
          className={`mb-5 rounded-md border p-3 text-sm ${
            actionNotice.kind === "error"
              ? "border-destructive/30 bg-destructive/5 text-destructive"
              : "border-success/30 bg-success/5 text-foreground"
          }`}
        >
          {actionNotice.message}
        </div>
      )}

      <section className="mb-7 rounded-lg border bg-card p-4 sm:p-5">
        <div className="mb-4 flex items-start gap-3">
          <MapPin className="mt-0.5 size-5 shrink-0 text-brand" />
          <div>
            <h2 className="font-display text-base font-semibold">Branch search area</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Each crawl is limited to a 30 km radius from the saved branch address.
            </p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(12rem,0.8fr)_minmax(16rem,1.5fr)_auto_auto] md:items-end">
          <div className="space-y-1.5">
            <label htmlFor="crawl-branch" className="text-xs font-medium">
              Branch
            </label>
            <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
              <SelectTrigger id="crawl-branch">
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
          </div>
          {canConfigure ? (
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
          ) : (
            <div className="min-w-0 text-sm">
              <p className="text-xs font-medium">Saved location</p>
              {selectedTarget?.branch_address ? (
                <>
                  <p className="mt-1 truncate font-medium">{selectedTarget.branch_address}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Map match: {selectedTarget.geocode_label}
                  </p>
                </>
              ) : (
                <p className="mt-1 truncate text-muted-foreground">
                  Not configured by a platform executive
                </p>
              )}
            </div>
          )}
          {canConfigure && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void configureBranch()}
              disabled={actionLoading !== null || !selectedBranchId || !branchAddress.trim()}
            >
              {actionLoading === "configure" ? "Saving…" : "Save 30 km area"}
            </Button>
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
        <p className="mt-3 text-xs text-muted-foreground">
          {selectedTarget?.enabled ? (
            <>
              Search center: {selectedTarget.geocode_label ?? selectedTarget.branch_address} · 30 km
            </>
          ) : canConfigure ? (
            "Save the branch's exact address to enable crawling. The matched map location will be shown here."
          ) : (
            "A platform executive must save this branch's exact address before it can be crawled."
          )}
        </p>
      </section>

      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Company, contact, page, domain…"
            className="pl-8"
          />
        </div>
        <Select value={sourceType} onValueChange={setSourceType}>
          <SelectTrigger className="w-full sm:w-48">
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

      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Recorded runs"
          value={String(jobs.length)}
          hint="Discovery job history"
          accent="brand"
        />
        <StatCard
          label="Successful or partial"
          value={String(successfulJobs)}
          hint="Runs with results"
          accent="success"
        />
        <StatCard label="Records seen" value={String(recordsSeen)} hint="Reported by connectors" />
        <StatCard
          label="Failed runs"
          value={String(failedJobs)}
          hint="Require investigation"
          accent={failedJobs ? "warning" : undefined}
        />
      </div>

      <section className="mb-8">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Latest discovery run</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Newest run for the selected branch. Earlier attempts remain recorded but are hidden
              here.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border bg-card">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Loading latest run…
            </div>
          ) : !latestJob ? (
            <div className="px-5 py-12 text-center">
              <Activity className="mx-auto size-8 text-muted-foreground/60" />
              <h3 className="mt-3 font-medium">No discovery run recorded</h3>
              <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
                This page will list connector runs after a discovery job is configured and executed.
                It does not indicate that a crawler is currently running.
              </p>
            </div>
          ) : (
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 font-medium">Connector</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Started</th>
                  <th className="px-4 py-3 text-right font-medium">Seen</th>
                  <th className="px-4 py-3 text-right font-medium">New</th>
                  <th className="px-4 py-3 text-right font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-4 py-3 font-medium">
                    {branches.get(latestJob.branch_id ?? "") ?? "All branches"}
                  </td>
                  <td className="px-4 py-3">{latestJob.connector}</td>
                  <td className="max-w-sm px-4 py-3">
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
                    {latestJob.error_summary && (
                      <p className="mt-1 text-xs text-destructive">{latestJob.error_summary}</p>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {formatDate(latestJob.started_at ?? latestJob.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{latestJob.records_seen}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{latestJob.records_created}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{latestJob.records_updated}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </section>

      <Tabs defaultValue="contacts" className="mt-6">
        <TabsList aria-label="Crawler details" className="h-auto flex-wrap justify-start">
          <TabsTrigger value="contacts" className="gap-1.5">
            <Signal className="size-3.5" />Business contacts ({contacts.length})
          </TabsTrigger>
          <TabsTrigger value="sources" className="gap-1.5">
            <Globe2 className="size-3.5" />Website evidence ({sources.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="contacts">
        <div className="mb-3">
          <h2 className="font-display text-lg font-semibold">Captured business contacts</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Public contact details linked to discovered companies and their source records.
          </p>
        </div>
        <div className="overflow-hidden rounded-lg border bg-card">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Loading captured contacts…
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Signal className="mx-auto size-8 text-muted-foreground/60" />
              <h3 className="mt-3 font-medium">
                {contacts.length ? "No contacts match" : "No business contacts captured yet"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Public emails, phone numbers, and contact links appear here when a discovery
                connector stores them.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {groupedContacts.map((group) => (
                <article
                  key={`${group.companyName}-${group.city ?? "unknown"}`}
                  className="grid gap-4 p-4 md:grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.2fr)] md:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedCompanyDetails(group)}
                        className="cursor-pointer text-left text-sm font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {group.companyName}
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {group.websiteDomain ?? "Website not captured"}
                      {group.city ? ` · ${group.city}` : ""}
                    </p>
                    {group.address && (
                      <p className="mt-1 text-xs text-muted-foreground">{group.address}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    {(["email", "phone", "social", "contact_page"] as const).map((kind) => {
                      const count = group.contacts.filter((contact) => contact.kind === kind).length;
                      if (!count) return null;
                      const label = kind === "contact_page" ? "Contact pages" : `${kind}s`;
                      return (
                        <div key={kind} className="rounded-md border bg-muted/20 px-3 py-2">
                          <p className="font-medium capitalize">{label}</p>
                          <p className="mt-1 text-muted-foreground">{count} captured</p>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setSelectedCompanyDetails(group)}
                      className="rounded-md border border-brand/30 px-3 py-2 text-left font-medium text-brand hover:bg-brand/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      View all {group.contacts.length} contacts
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
        </TabsContent>

        <TabsContent value="sources">
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold">Captured website evidence</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              OpenStreetMap data is under ODbL, and website crawling respects robots.txt.
            </p>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border bg-card">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              Loading captured evidence…
            </div>
          ) : filteredSources.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Globe2 className="mx-auto size-8 text-muted-foreground/60" />
              <h3 className="mt-3 font-medium">
                {sources.length ? "No captured pages match" : "No website evidence captured yet"}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Captured pages appear here when connectors store them in the prospect source
                timeline.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredSources.map((source) => (
                <article
                  key={source.id}
                  className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"
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
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {getProspectProfile(source.prospect_profiles)?.company_name ??
                        "Unknown company"}
                      {getProspectProfile(source.prospect_profiles)?.website_domain
                        ? ` · ${getProspectProfile(source.prospect_profiles)?.website_domain}`
                        : ""}
                      {getProspectProfile(source.prospect_profiles)?.city
                        ? ` · ${getProspectProfile(source.prospect_profiles)?.city}`
                        : ""}{" "}
                      · {formatDate(source.observed_at)}
                    </p>
                  </div>
                  <Button asChild variant="ghost" size="sm" className="w-fit shrink-0">
                    <a href={source.source_url} target="_blank" rel="noreferrer">
                      Open source <ExternalLink className="ml-1 size-3.5" />
                    </a>
                  </Button>
                </article>
              ))}
            </div>
          )}
        </div>
        </TabsContent>
      </Tabs>

      <Dialog open={selectedCompanyDetails !== null} onOpenChange={(open) => !open && setSelectedCompanyDetails(null)}>
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
                  const heading = kind === "contact_page"
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
