import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRole } from "@/lib/role-context";
import { getSupabaseClient } from "@/lib/supabase";
import {
  AlertCircle,
  Building2,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Signal,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/leads-intelligence")({
  head: () => ({ meta: [{ title: "Leads Intelligence — WorkspaceOS" }] }),
  component: LeadsIntelligence,
});

type Contact = { kind: string; value: string };
type ProspectSource = { source_type: string; source_url: string };
type SignalRecord = {
  id: string;
  category: string;
  title: string;
  confidence: number | null;
};
type Prospect = {
  id: string;
  company_name: string;
  website_url: string | null;
  website_domain: string | null;
  address: string | null;
  industry: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  discovery_status: string;
  opportunity_score: number;
  discovered_at: string;
  prospect_contacts: Contact[];
  prospect_sources: ProspectSource[];
  prospect_signals: SignalRecord[];
};

const contactIcons = {
  email: Mail,
  phone: Phone,
  social: ExternalLink,
  contact_page: MessageCircle,
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

function groupContactsByKind(contacts: Contact[]) {
  return contacts.reduce<Partial<Record<ContactKind, Contact[]>>>((acc, contact) => {
    const kind = (contact.kind as ContactKind) in contactIcons ? (contact.kind as ContactKind) : null;
    if (!kind) return acc;
    (acc[kind] ??= []).push(contact);
    return acc;
  }, {});
}

function CompanyLogo({ name, domain }: { name: string; domain: string | null }) {
  const [unavailable, setUnavailable] = useState(false);

  return (
    <div className="relative flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted text-muted-foreground">
      <Building2 className="size-5" />
      {domain && !unavailable && (
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`}
          alt={`${name} logo`}
          className="absolute inset-0 size-full bg-background object-contain p-1.5"
          onError={() => setUnavailable(true)}
        />
      )}
    </div>
  );
}

function socialHandle(value: string) {
  try {
    const url = new URL(value);
    const domain = url.hostname.replace(/^www\./, "");
    const firstPath = url.pathname.split("/").filter(Boolean)[0];
    if (["instagram.com", "x.com", "twitter.com"].includes(domain) && firstPath) {
      return `@${firstPath}`;
    }
    return `${domain}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return value;
  }
}

const statusLabels: Record<string, string> = {
  discovered: "Discovered",
  enriching: "Enriching",
  qualified: "Qualified",
  needs_review: "Needs review",
  converted: "In CRM",
  archived: "Archived",
  failed: "Crawl issue",
};

function statusVariant(status: string): "default" | "outline" | "destructive" | "secondary" {
  if (status === "qualified" || status === "converted") return "default";
  if (status === "failed") return "destructive";
  if (status === "needs_review") return "secondary";
  return "outline";
}

function scoreTone(score: number) {
  if (score >= 80) return "text-brand";
  if (score >= 50) return "text-foreground";
  return "text-muted-foreground";
}

function SkeletonList() {
  return (
    <div className="space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="size-12 shrink-0 animate-pulse rounded-lg bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 animate-pulse rounded bg-muted" />
              <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="mt-3 h-3 w-64 animate-pulse rounded bg-muted" />
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

function LeadsIntelligence() {
  const { role } = useRole();
  const canView = ["group-ceo", "sales-manager", "crm-manager"].includes(role.id);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null);
  const [phoneProspect, setPhoneProspect] = useState<Prospect | null>(null);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoadError(
        "Supabase is not configured. Add the project URL and anon key to load prospect records.",
      );
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setLoadError(null);
    void supabase
      .from("prospect_profiles")
      .select(
        "id,company_name,website_url,website_domain,address,industry,city,region,country,discovery_status,opportunity_score,discovered_at,prospect_contacts(kind,value),prospect_sources(source_type,source_url),prospect_signals(id,category,title,confidence)",
      )
      .order("discovered_at", { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setLoadError(
            error.message.includes("prospect_profiles")
              ? "Prospect tables are not installed. Apply the Prospect Intelligence migration to Supabase."
              : error.message,
          );
          setProspects([]);
        } else {
          setProspects((data ?? []) as Prospect[]);
        }
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canView, refreshKey]);

  const filteredProspects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return prospects.filter((prospect) => {
      const matchesStatus = status === "all" || prospect.discovery_status === status;
      const matchesQuery =
        !query ||
        [
          prospect.company_name,
          prospect.website_domain,
          prospect.industry,
          prospect.city,
          ...prospect.prospect_contacts.map((contact) => contact.value),
        ].some((value) => value?.toLowerCase().includes(query));
      return matchesStatus && matchesQuery;
    });
  }, [prospects, search, status]);

  const openProspect = (prospect: Prospect) => {
    setSelectedProspect(prospect);
  };

  const qualifiedCount = prospects.filter((prospect) =>
    ["qualified", "converted"].includes(prospect.discovery_status),
  ).length;
  const reviewCount = prospects.filter(
    (prospect) => prospect.discovery_status === "needs_review",
  ).length;
  const hotCount = prospects.filter((prospect) => prospect.opportunity_score >= 80).length;

  const selectedContacts = selectedProspect?.prospect_contacts ?? [];
  const emails = selectedContacts.filter((contact) => contact.kind === "email");
  const phones = selectedContacts.filter((contact) => contact.kind === "phone");
  const socialProfiles = selectedContacts.filter((contact) => contact.kind === "social");
  const contactPages = selectedContacts.filter((contact) => contact.kind === "contact_page");
  const googleMapsUrl = selectedProspect?.prospect_sources.find(
    (source) =>
      source.source_type === "discovery_provider" &&
      source.source_url.includes("google.com/maps"),
  )?.source_url;

  if (!canView) {
    return (
      <div className="mx-auto max-w-4xl py-16 text-center">
        <AlertCircle className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-4 font-display text-xl font-semibold">Access restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Leads Intelligence is available to the sales and executive teams.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-375">
      <PageHeader
        eyebrow="Prospect Intelligence"
        title="Leads Intelligence"
        description="Companies discovered around Office & Co branches, enriched from their public websites, and tracked through qualification."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" className="gap-2">
              <Link to="/outreach" search={{ mode: "campaign" }}>
                <Mail className="size-4" />
                Campaign email
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => setRefreshKey((key) => key + 1)}
              disabled={loading}
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      />

      {/* ── Compact stat + control bar ─────────────────────────────── */}
      <section className="mb-4 rounded-lg border bg-card">
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span>
              <strong className="text-foreground">{prospects.length}</strong> discovered
            </span>
            <span>
              <strong className="text-foreground">{qualifiedCount}</strong> qualified
            </span>
            <span>
              <strong className="text-brand">{hotCount}</strong> hot
            </span>
            {reviewCount > 0 && (
              <span>
                <strong className="text-foreground">{reviewCount}</strong> needs review
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Company, city, contact…"
                className="h-9 pl-8"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 w-full sm:w-44">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* ── Notices ───────────────────────────────────────────────── */}
      {loadError && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" />
          <div>
            <div className="font-medium">Prospect data is unavailable</div>
            <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
          </div>
        </div>
      )}

      {/* ── Prospects list ────────────────────────────────────────── */}
      {loading ? (
        <SkeletonList />
      ) : filteredProspects.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-8" />}
          title={
            search || status !== "all"
              ? "No prospects match these filters"
              : "No prospects discovered yet"
          }
          description={
            loadError
              ? "Resolve the data connection above to load persisted prospects."
              : "When an authorized discovery connector finds a company, its profile and evidence will appear here."
          }
        />
      ) : (
        <>
          <div className="space-y-2">
            {filteredProspects.map((prospect) => {
              const contactsByKind = groupContactsByKind(prospect.prospect_contacts);
              const phoneContacts = contactsByKind.phone ?? [];
              const visiblePhones = new Set(phoneContacts.slice(0, 2).map((c) => c.value));
              const additionalPhoneCount = phoneContacts.length - visiblePhones.size;
              const isHot = prospect.opportunity_score >= 80;

              return (
                <article
                  key={prospect.id}
                  className="group rounded-lg border bg-card p-4 transition-colors hover:border-brand/40"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <CompanyLogo
                        key={prospect.id}
                        name={prospect.company_name}
                        domain={prospect.website_domain}
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openProspect(prospect)}
                            className="cursor-pointer text-left text-sm font-semibold text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {prospect.company_name}
                          </button>
                          <Badge variant={statusVariant(prospect.discovery_status)}>
                            {statusLabels[prospect.discovery_status] ?? prospect.discovery_status}
                          </Badge>
                          {isHot && (
                            <Badge variant="secondary" className="gap-1">
                              <Sparkles className="size-3" />
                              Hot
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {[prospect.industry, prospect.city, prospect.region]
                            .filter(Boolean)
                            .join(" · ") || "Location not available"}
                        </p>
                        {prospect.address && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {prospect.address}
                          </p>
                        )}
                        {prospect.website_url && (
                          <a
                            href={prospect.website_url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-xs text-brand hover:underline"
                          >
                            {prospect.website_domain || prospect.website_url}
                            <ExternalLink className="size-3" />
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <div className="text-right">
                        <p className={`inline-flex items-center gap-1.5 text-sm font-semibold ${scoreTone(prospect.opportunity_score)}`}>
                          <Sparkles className="size-3.5" />
                          {prospect.opportunity_score}
                          <span className="text-xs font-normal text-muted-foreground">/100</span>
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {new Date(prospect.discovered_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                      >
                        <button type="button" onClick={() => openProspect(prospect)}>
                          Open profile
                          <ChevronRight className="size-3" />
                        </button>
                      </Button>
                    </div>
                  </div>

                  {/* Contact chips + signals row */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
                    {prospect.prospect_contacts.length === 0 && (
                      <span className="text-xs text-muted-foreground">No contacts captured</span>
                    )}
                    {(["email", "phone", "social", "contact_page", "live_chat"] as const).map(
                      (kind) => {
                        const items = contactsByKind[kind];
                        if (!items?.length) return null;
                        const Icon = contactIcons[kind];
                        const isPhoneOverflow =
                          kind === "phone" && additionalPhoneCount > 0;
                        return (
                          <span
                            key={kind}
                            className="inline-flex items-center gap-1 rounded-full border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground"
                          >
                            <Icon className="size-3" />
                            {items.length}{" "}
                            {isPhoneOverflow ? "phones" : labelForKind(kind, items.length)}
                          </span>
                        );
                      },
                    )}
                    {additionalPhoneCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setPhoneProspect(prospect)}
                        className="inline-flex items-center gap-1 rounded-full border border-brand/30 px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand/5"
                      >
                        <Plus className="size-3" />
                        {additionalPhoneCount} more
                      </button>
                    )}
                    {prospect.prospect_signals.length > 0 && (
                      <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground">
                        <Signal className="size-3 text-brand" />
                        {prospect.prospect_signals.length} signal
                        {prospect.prospect_signals.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Showing {filteredProspects.length} of {prospects.length} discovered companies
          </p>
        </>
      )}

      {/* ── Company profile dialog ─────────────────────────────────── */}
      <Dialog
        open={selectedProspect !== null}
        onOpenChange={(open) => !open && setSelectedProspect(null)}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          {selectedProspect && (
            <>
              <DialogHeader className="flex flex-row items-center gap-4 pr-7 text-left">
                <CompanyLogo
                  key={selectedProspect.id}
                  name={selectedProspect.company_name}
                  domain={selectedProspect.website_domain}
                />
                <div className="min-w-0">
                  <DialogTitle className="break-words">
                    {selectedProspect.company_name}
                  </DialogTitle>
                  <DialogDescription className="mt-1">
                    {[selectedProspect.industry, selectedProspect.city, selectedProspect.region]
                      .filter(Boolean)
                      .join(" · ") || "Company contact profile"}
                  </DialogDescription>
                </div>
              </DialogHeader>

              <div className="grid gap-5">
                {googleMapsUrl && (
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit items-center gap-2 text-sm font-medium text-brand hover:underline"
                  >
                    <MapPin className="size-4" />
                    View on Google Maps <ExternalLink className="size-4" />
                  </a>
                )}

                {selectedProspect.website_url && (
                  <a
                    href={selectedProspect.website_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-fit items-center gap-2 text-sm font-medium text-brand hover:underline"
                  >
                    Visit company website <ExternalLink className="size-4" />
                  </a>
                )}

                {selectedProspect.address && (
                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                      Physical address
                    </h3>
                    <p className="rounded-md border p-3 text-sm">{selectedProspect.address}</p>
                  </section>
                )}

                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">Email</h3>
                  {emails.length ? (
                    emails.map((contact) => (
                      <a
                        key={`${contact.kind}-${contact.value}`}
                        href={`mailto:${contact.value}`}
                        className="flex items-center gap-2 text-sm text-brand hover:underline"
                      >
                        <Mail className="size-4 shrink-0" />
                        {contact.value}
                      </a>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No public email captured.</p>
                  )}
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">Phone</h3>
                  {phones.length ? (
                    phones.map((contact) => (
                      <a
                        key={`${contact.kind}-${contact.value}`}
                        href={`tel:${contact.value}`}
                        className="flex items-center gap-2 text-sm text-brand hover:underline"
                      >
                        <Phone className="size-4 shrink-0" />
                        {contact.value}
                      </a>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No public phone captured.</p>
                  )}
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                    Social media
                  </h3>
                  {socialProfiles.length ? (
                    socialProfiles.map((contact) => (
                      <a
                        key={`${contact.kind}-${contact.value}`}
                        href={contact.value}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 break-all text-sm text-brand hover:underline"
                      >
                        <ExternalLink className="size-4 shrink-0" />
                        {socialHandle(contact.value)}
                      </a>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No public social profiles captured.
                    </p>
                  )}
                </section>

                {contactPages.length > 0 && (
                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground">
                      Contact page
                    </h3>
                    {contactPages.map((contact) => (
                      <a
                        key={`${contact.kind}-${contact.value}`}
                        href={contact.value}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 break-all text-sm text-brand hover:underline"
                      >
                        <MessageCircle className="size-4 shrink-0" />
                        {contact.value}
                      </a>
                    ))}
                  </section>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Phone numbers dialog ───────────────────────────────────── */}
      <Dialog
        open={phoneProspect !== null}
        onOpenChange={(open) => !open && setPhoneProspect(null)}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
          {phoneProspect && (
            <>
              <DialogHeader>
                <DialogTitle>All phone numbers</DialogTitle>
                <DialogDescription>{phoneProspect.company_name}</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                {phoneProspect.prospect_contacts
                  .filter((contact) => contact.kind === "phone")
                  .map((contact, index) => (
                    <a
                      key={`${contact.value}-${index}`}
                      href={`tel:${contact.value}`}
                      className="flex items-center gap-2 rounded-md border p-3 text-sm text-brand hover:bg-muted/40 hover:underline"
                    >
                      <Phone className="size-4 shrink-0" />
                      {contact.value}
                    </a>
                  ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}