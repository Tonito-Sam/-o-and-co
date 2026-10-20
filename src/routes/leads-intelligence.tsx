import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRole } from "@/lib/role-context";
import { getSupabaseClient } from "@/lib/supabase";
import { AlertCircle, Building2, ExternalLink, LoaderCircle, Mail, MapPin, MessageCircle, Phone, Plus, RefreshCw, Search, Signal, Sparkles, Users } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/leads-intelligence")({
  head: () => ({ meta: [{ title: "Leads Intelligence — WorkspaceOS" }] }),
  component: LeadsIntelligence,
});

type Contact = { kind: string; value: string };
type ProspectSource = { source_type: string; source_url: string };
type SignalRecord = { id: string; category: string; title: string; confidence: number | null };
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

function CompanyLogo({ name, domain }: { name: string; domain: string | null }) {
  const [unavailable, setUnavailable] = useState(false);

  return (
    <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted text-muted-foreground">
      <Building2 className="size-6" />
      {domain && !unavailable && (
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`}
          alt={`${name} logo`}
          className="absolute inset-0 size-full bg-background object-contain p-2"
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
      setLoadError("Supabase is not configured. Add the project URL and anon key to load prospect records.");
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setLoadError(null);
    void supabase
      .from("prospect_profiles")
      .select("id,company_name,website_url,website_domain,address,industry,city,region,country,discovery_status,opportunity_score,discovered_at,prospect_contacts(kind,value),prospect_sources(source_type,source_url),prospect_signals(id,category,title,confidence)")
      .order("discovered_at", { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setLoadError(error.message.includes("prospect_profiles")
            ? "Prospect tables are not installed. Apply the Prospect Intelligence migration to Supabase."
            : error.message);
          setProspects([]);
        } else {
          setProspects((data ?? []) as Prospect[]);
        }
        setLoading(false);
      });

    return () => { active = false; };
  }, [canView, refreshKey]);

  const filteredProspects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return prospects.filter((prospect) => {
      const matchesStatus = status === "all" || prospect.discovery_status === status;
      const matchesQuery = !query || [prospect.company_name, prospect.website_domain, prospect.industry, prospect.city, ...prospect.prospect_contacts.map((contact) => contact.value)]
        .some((value) => value?.toLowerCase().includes(query));
      return matchesStatus && matchesQuery;
    });
  }, [prospects, search, status]);

  const openProspect = (prospect: Prospect) => {
    setSelectedProspect(prospect);
  };

  const qualifiedCount = prospects.filter((prospect) => ["qualified", "converted"].includes(prospect.discovery_status)).length;
  const reviewCount = prospects.filter((prospect) => prospect.discovery_status === "needs_review").length;
  const hotCount = prospects.filter((prospect) => prospect.opportunity_score >= 80).length;
  const selectedContacts = selectedProspect?.prospect_contacts ?? [];
  const emails = selectedContacts.filter((contact) => contact.kind === "email");
  const phones = selectedContacts.filter((contact) => contact.kind === "phone");
  const socialProfiles = selectedContacts.filter((contact) => contact.kind === "social");
  const contactPages = selectedContacts.filter((contact) => contact.kind === "contact_page");
  const googleMapsUrl = selectedProspect?.prospect_sources.find(
    (source) =>
      source.source_type === "discovery_provider" && source.source_url.includes("google.com/maps"),
  )?.source_url;

  if (!canView) {
    return (
      <div className="mx-auto max-w-4xl py-16 text-center">
        <AlertCircle className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-4 font-display text-xl font-semibold">Access restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">Leads Intelligence is available to the sales and executive teams.</p>
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
                <Mail className="size-4" />Campaign email
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setRefreshKey((key) => key + 1)} disabled={loading}>
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />Refresh
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Discovered prospects" value={String(prospects.length)} hint="From enabled sources" accent="brand" />
        <StatCard label="Qualified" value={String(qualifiedCount)} hint="Ready for CRM" accent="success" />
        <StatCard label="Hot opportunities" value={String(hotCount)} hint="Score 80–100" accent="warning" />
        <StatCard label="Needs review" value={String(reviewCount)} hint="Exceptions only" />
      </div>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold">Discovered companies</h2>
            <p className="mt-1 text-xs text-muted-foreground">Contact channels and signals are linked to their source evidence.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Company, city, contact…" className="pl-8" />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loadError && (
          <div role="alert" className="m-4 flex items-start gap-3 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" />
            <div><div className="font-medium">Prospect data is unavailable</div><p className="mt-1 text-xs text-muted-foreground">{loadError}</p></div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading prospect records</div>
        ) : filteredProspects.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <Building2 className="mx-auto size-8 text-muted-foreground/60" />
            <h3 className="mt-3 font-medium">{search || status !== "all" ? "No prospects match these filters" : "No prospects discovered yet"}</h3>
            <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
              {loadError ? "Resolve the data connection above to load persisted prospects." : "When an authorized discovery connector finds a company, its profile and evidence will appear here."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left">
              <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Public contacts</th>
                  <th className="px-4 py-3 font-medium">Signals</th>
                  <th className="px-4 py-3 font-medium">Score</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Discovered</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredProspects.map((prospect) => {
                  const phoneContacts = prospect.prospect_contacts.filter(
                    (contact) => contact.kind === "phone",
                  );
                  const visiblePhoneContacts = new Set(phoneContacts.slice(0, 2));
                  const additionalPhoneCount = phoneContacts.length - visiblePhoneContacts.size;

                  return (
                  <tr key={prospect.id} className="align-top hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openProspect(prospect)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openProspect(prospect);
                          }
                        }}
                        className="cursor-pointer text-left font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={`View ${prospect.company_name} profile`}
                      >
                        {prospect.company_name}
                      </button>
                      {prospect.industry && <div className="mt-0.5 text-xs text-muted-foreground">{prospect.industry}</div>}
                      {prospect.website_url && <a href={prospect.website_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-brand hover:underline">{prospect.website_domain || prospect.website_url}<ExternalLink className="size-3" /></a>}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div>{[prospect.city, prospect.region].filter(Boolean).join(", ") || "Not available"}</div>
                      {prospect.address && (
                        <div className="mt-1 max-w-64 text-xs text-muted-foreground">
                          {prospect.address}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex max-w-56 flex-wrap gap-1.5">
                        {prospect.prospect_contacts.filter((contact) =>
                          contact.kind !== "phone" || visiblePhoneContacts.has(contact),
                        ).map((contact) => {
                          const Icon = contact.kind === "email" ? Mail : contact.kind === "phone" ? Phone : contact.kind === "live_chat" ? MessageCircle : ExternalLink;
                          return <Badge key={`${contact.kind}-${contact.value}`} variant="outline" className="max-w-full gap-1 truncate text-[10px] font-normal"><Icon className="size-3 shrink-0" />{contact.kind === "live_chat" ? "Chat available" : contact.value}</Badge>;
                        })}
                        {additionalPhoneCount > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 gap-1 px-2 text-[10px]"
                            aria-label={`Show ${additionalPhoneCount} more phone numbers for ${prospect.company_name}`}
                            onClick={() => setPhoneProspect(prospect)}
                          >
                            <Plus className="size-3" />{additionalPhoneCount}
                          </Button>
                        )}
                        {prospect.prospect_contacts.length === 0 && <span className="text-xs text-muted-foreground">None found</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-sm"><Signal className="size-3.5 text-brand" />{prospect.prospect_signals.length}</div>
                      {prospect.prospect_signals.slice(0, 2).map((signal) => <div key={signal.id} className="mt-1 max-w-44 truncate text-[11px] text-muted-foreground" title={signal.title}>{signal.title}</div>)}
                    </td>
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 font-semibold"><Sparkles className="size-3.5 text-brand" />{prospect.opportunity_score}</span><span className="text-xs text-muted-foreground">/100</span></td>
                    <td className="px-4 py-3"><Badge variant={prospect.discovery_status === "qualified" ? "default" : "outline"}>{statusLabels[prospect.discovery_status] ?? prospect.discovery_status}</Badge></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(prospect.discovered_at).toLocaleDateString()}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loadError && !loading && prospects.length > 0 && <div className="flex items-center gap-2 border-t px-4 py-3 text-xs text-muted-foreground"><Users className="size-3.5" />Showing {filteredProspects.length} of {prospects.length} discovered companies</div>}
      </section>

      <Dialog open={selectedProspect !== null} onOpenChange={(open) => !open && setSelectedProspect(null)}>
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
                  <DialogTitle className="break-words">{selectedProspect.company_name}</DialogTitle>
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
                    <MapPin className="size-4" />View on Google Maps <ExternalLink className="size-4" />
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
                  {emails.length ? emails.map((contact) => (
                    <a
                      key={`${contact.kind}-${contact.value}`}
                      href={`mailto:${contact.value}`}
                      className="flex items-center gap-2 text-sm text-brand hover:underline"
                    >
                      <Mail className="size-4 shrink-0" />{contact.value}
                    </a>
                  )) : <p className="text-sm text-muted-foreground">No public email captured.</p>}
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">Phone</h3>
                  {phones.length ? phones.map((contact) => (
                    <a
                      key={`${contact.kind}-${contact.value}`}
                      href={`tel:${contact.value}`}
                      className="flex items-center gap-2 text-sm text-brand hover:underline"
                    >
                      <Phone className="size-4 shrink-0" />{contact.value}
                    </a>
                  )) : <p className="text-sm text-muted-foreground">No public phone captured.</p>}
                </section>

                <section className="space-y-2">
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">Social media</h3>
                  {socialProfiles.length ? socialProfiles.map((contact) => (
                    <a
                      key={`${contact.kind}-${contact.value}`}
                      href={contact.value}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 break-all text-sm text-brand hover:underline"
                    >
                      <ExternalLink className="size-4 shrink-0" />{socialHandle(contact.value)}
                    </a>
                  )) : <p className="text-sm text-muted-foreground">No public social profiles captured.</p>}
                </section>

                {contactPages.length > 0 && (
                  <section className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground">Contact page</h3>
                    {contactPages.map((contact) => (
                      <a
                        key={`${contact.kind}-${contact.value}`}
                        href={contact.value}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 break-all text-sm text-brand hover:underline"
                      >
                        <MessageCircle className="size-4 shrink-0" />{contact.value}
                      </a>
                    ))}
                  </section>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={phoneProspect !== null} onOpenChange={(open) => !open && setPhoneProspect(null)}>
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
                      <Phone className="size-4 shrink-0" />{contact.value}
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