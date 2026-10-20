import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Building2, ExternalLink, FileSignature, FileUp, LoaderCircle, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabaseClient } from "@/lib/supabase";
import { useRole } from "@/lib/role-context";

type Relation<T> = T | T[] | null;

type TenantRow = {
  id: string;
  organization_id: string | null;
  company_id: string | null;
  branch_id: string;
  tier: string;
  plan_name: string | null;
  desks: number | null;
  mrr_zar: number | null;
  since: string | null;
  lease_signed_at: string | null;
  organizations: Relation<{ name: string; industry: string | null; website: string | null }>;
  companies: Relation<{ name: string }>;
  branches: Relation<{ name: string }>;
};

type BranchRow = { id: string; name: string };

function one<T>(relation: Relation<T>): T | null {
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}

function localDate() {
  return new Intl.DateTimeFormat("en-CA").format(new Date());
};

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && quoted && text[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function csvValue(record: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value) return value;
  }
  return "";
}

function csvInteger(value: string) {
  if (!value.trim()) return "";
  const normalized = value.replace(/[R,\s]/gi, "");
  const parsed = Number(normalized);
  if (Number.isFinite(parsed)) return String(Math.round(parsed));
  return value.replace(/[^\d-]/g, "");
}

export const Route = createFileRoute("/tenants")({
  head: () => ({ meta: [{ title: "Registered Tenants — WorkspaceOS" }] }),
  component: Tenants,
});

function Tenants() {
  const { role } = useRole();
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [legacyName, setLegacyName] = useState("");
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [branchId, setBranchId] = useState("");
  const [tier, setTier] = useState("");
  const [planName, setPlanName] = useState("");
  const [desks, setDesks] = useState("0");
  const [mrr, setMrr] = useState("0");
  const [since, setSince] = useState(localDate);
  const [leaseSignedAt, setLeaseSignedAt] = useState(localDate);
  const canManage = ["superadmin", "group-admin", "group-ceo", "crm-manager", "sales-manager", "rosebank-sales", "finance"].includes(role.id);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Supabase is not configured.");
      setLoading(false);
      return;
    }

    let active = true;
    void Promise.all([
      supabase
        .from("tenants")
        .select(
          "id,organization_id,company_id,branch_id,tier,plan_name,desks,mrr_zar,since,lease_signed_at,status,organizations(name,industry,website),companies(name),branches(name)",
        )
        .eq("status", "active")
        .order("since", { ascending: false }),
      supabase.from("branches").select("id,name").eq("status", "live").order("name"),
    ]).then(([tenantResult, branchResult]) => {
      if (!active) return;
      const queryError = tenantResult.error ?? branchResult.error;
      if (queryError) {
        setError(queryError.message);
        setTenants([]);
      } else {
        setTenants((tenantResult.data ?? []) as TenantRow[]);
        setBranches((branchResult.data ?? []) as BranchRow[]);
      }
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const filteredTenants = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return tenants;
    return tenants.filter((tenant) => {
      const organization = one(tenant.organizations);
      const company = one(tenant.companies);
      const branch = one(tenant.branches);
      return [
        organization?.name,
        company?.name,
        organization?.industry,
        organization?.website,
        branch?.name,
        tenant.plan_name,
      ].some((value) => value?.toLowerCase().includes(query));
    });
  }, [tenants, search]);

  const representedOrganizations = new Set(
    tenants.map((tenant) => tenant.organization_id ?? tenant.company_id).filter(Boolean),
  ).size;
  const representedBranches = new Set(tenants.map((tenant) => tenant.branch_id)).size;

  const resetLeaseForm = () => {
    setBranchId("");
    setTier("");
    setPlanName("");
    setDesks("0");
    setMrr("0");
    setSince(localDate());
    setLeaseSignedAt(localDate());
  };

  const importExistingTenant = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supabase = getSupabaseClient();
    const branch = branches.find((item) => item.id === branchId);
    if (!supabase || !branch || !tier) return;
    setSaving(true);
    const { error: importError } = await supabase.rpc("import_existing_tenant", {
      p_organization_name: legacyName.trim(),
      p_branch: branch.name,
      p_tier: tier,
      p_plan_name: planName.trim() || null,
      p_desks: Number(desks),
      p_mrr_zar: Number(mrr),
      p_since: since,
      p_lease_signed_at: leaseSignedAt || null,
    });
    setSaving(false);
    if (importError) {
      toast.error(importError.message);
      return;
    }
    toast.success("Existing tenant imported and linked to any matching organization profile.");
    setImportDialogOpen(false);
    setLegacyName("");
    resetLeaseForm();
    const { data, error: reloadError } = await supabase
      .from("tenants")
      .select("id,organization_id,company_id,branch_id,tier,plan_name,desks,mrr_zar,since,lease_signed_at,status,organizations(name,industry,website),companies(name),branches(name)")
      .eq("status", "active")
      .order("since", { ascending: false });
    if (reloadError) toast.error(reloadError.message);
    else setTenants((data ?? []) as TenantRow[]);
  };

  const loadTenantCsv = async (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("CSV files must be 5 MB or smaller.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      toast.error("Choose a CSV export of the tenant roster.");
      return;
    }
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) {
      toast.error("The CSV needs a header row and at least one tenant row.");
      return;
    }
    const headers = parsed[0].map((header) => header.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
    const records = parsed.slice(1).map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
    );
    const rows = records.map((record) => ({
      organization_name: csvValue(record, "organization_name", "company_name", "company", "organization", "tenant", "name"),
      branch: csvValue(record, "branch", "branch_name", "location"),
      tier: csvValue(record, "tier", "subscription_tier", "membership_tier")
        .toLowerCase().replace(/[ -]+/g, "_"),
      plan_name: csvValue(record, "plan_name", "plan"),
      desks: csvInteger(csvValue(record, "desks", "desk_count", "workspace_count")),
      mrr_zar: csvInteger(csvValue(record, "mrr_zar", "monthly_fee", "monthly_rent", "mrr")),
      since: csvValue(record, "since", "lease_start", "lease_start_date", "start_date"),
      lease_signed_at: csvValue(record, "lease_signed_at", "signed_at", "lease_signed", "signature_date"),
      website: csvValue(record, "website", "website_url"),
      industry: csvValue(record, "industry"),
    })).filter((record) => Object.values(record).some(Boolean));
    if (rows.length > 500) {
      toast.error("Import at most 500 tenants per CSV file.");
      return;
    }
    setCsvRows(rows);
    setCsvFileName(file.name);
    setCsvErrors([]);
  };

  const importTenantCsv = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || csvRows.length === 0) return;
    setSaving(true);
    const { data, error: importError } = await supabase.rpc("import_existing_tenants", {
      p_rows: csvRows,
    });
    setSaving(false);
    if (importError) {
      toast.error(importError.message);
      return;
    }
    const result = data as { imported: number; errors: { row: number; organization_name: string; error: string }[] };
    const errors = result.errors.map((item) => `Row ${item.row}: ${item.organization_name || "Unnamed tenant"} · ${item.error}`);
    setCsvErrors(errors);
    toast.success(`${result.imported} tenant${result.imported === 1 ? "" : "s"} imported${errors.length ? ` · ${errors.length} need attention` : ""}.`);
    const { data: tenantData, error: reloadError } = await supabase
      .from("tenants")
      .select("id,organization_id,company_id,branch_id,tier,plan_name,desks,mrr_zar,since,lease_signed_at,status,organizations(name,industry,website),companies(name),branches(name)")
      .eq("status", "active")
      .order("since", { ascending: false });
    if (reloadError) toast.error(reloadError.message);
    else setTenants((tenantData ?? []) as TenantRow[]);
    if (errors.length === 0) {
      setCsvImportOpen(false);
      setCsvRows([]);
      setCsvFileName("");
    }
  };

  return (
    <div className="mx-auto max-w-350">
      <PageHeader
        eyebrow="Lease Account Management"
        title="Tenants"
        description="Organizations with an active signed lease. Event and other one-off bookings remain bookings, not tenancies."
        actions={canManage ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => {
              setBranchId("");
              setTier("");
              setSince("");
              setLeaseSignedAt("");
              setImportDialogOpen(true);
            }}>
              <Plus className="size-4" />
              Import existing tenant
            </Button>
            <Button variant="outline" onClick={() => setCsvImportOpen(true)}>
              <FileUp className="size-4" />
              Import tenant leases (CSV)
            </Button>
          </div>
        ) : undefined}
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Active lease records" value={String(tenants.length)} />
        <StatCard label="Organizations with leases" value={String(representedOrganizations)} />
        <StatCard label="Branches represented" value={String(representedBranches)} />
      </div>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-base font-semibold">Active leases</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Lease records are created separately from organization registration and event bookings.
            </p>
          </div>
          <div className="relative sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search organizations…"
              className="pl-8"
            />
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="m-4 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm"
          >
            <p className="font-medium">Tenant records unavailable</p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading registered organizations…
          </div>
        ) : filteredTenants.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <FileSignature className="mx-auto size-8 text-muted-foreground/60" />
            <h3 className="mt-3 font-medium">{tenants.length ? "No leases match" : "No active leases yet"}</h3>
            <p className="mx-auto mt-1 max-w-lg text-sm text-muted-foreground">
              {tenants.length
                ? "Try another organization, branch, or plan."
                : "An organization appears here after its signed lease is recorded."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Tenant organization</th>
                  <th className="px-4 py-3 font-medium">Branch</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 text-right font-medium">Desks</th>
                  <th className="px-4 py-3 text-right font-medium">Monthly fee</th>
                  <th className="px-4 py-3 font-medium">Lease starts</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredTenants.map((tenant) => {
                  const organization = one(tenant.organizations);
                  const company = one(tenant.companies);
                  const branch = one(tenant.branches);
                  return (
                  <tr key={tenant.id} className="align-middle hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="grid size-8 shrink-0 place-items-center rounded-md bg-brand-soft text-brand">
                          <Building2 className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {organization?.name ?? company?.name ?? "Unnamed tenant"}
                          </div>
                          {organization?.website && (
                            <a
                              href={organization.website}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex max-w-64 items-center gap-1 truncate text-xs text-brand hover:underline"
                            >
                              {organization.website}
                              <ExternalLink className="size-3 shrink-0" />
                            </a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm">{branch?.name ?? "Branch not set"}</td>
                    <td className="px-4 py-3 text-sm">
                      {tenant.plan_name ?? tenant.tier.replaceAll("_", " ")}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums">
                      {tenant.desks ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums">
                      R {new Intl.NumberFormat("en-ZA").format(tenant.mrr_zar ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {tenant.since
                        ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
                            new Date(`${tenant.since}T00:00:00`),
                          )
                        : "Not set"}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import an existing tenant</DialogTitle>
            <DialogDescription>
              Add a current lease from your existing tenant roster. Matching registered organizations are linked automatically; no portal account is required.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={importExistingTenant} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="legacy-tenant-name">Organization or company name</Label>
              <Input id="legacy-tenant-name" required minLength={2} value={legacyName} onChange={(event) => setLegacyName(event.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="legacy-tenant-branch">Branch</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger id="legacy-tenant-branch"><SelectValue placeholder="Choose branch" /></SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="legacy-tenant-tier">Plan tier</Label>
                <Select value={tier} onValueChange={setTier}>
                  <SelectTrigger id="legacy-tenant-tier"><SelectValue placeholder="Choose tier" /></SelectTrigger>
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
              <Label htmlFor="legacy-tenant-plan">Plan name</Label>
              <Input id="legacy-tenant-plan" value={planName} onChange={(event) => setPlanName(event.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="legacy-tenant-desks">Desks</Label>
                <Input id="legacy-tenant-desks" type="number" min="0" step="1" required value={desks} onChange={(event) => setDesks(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="legacy-tenant-mrr">Monthly fee (ZAR)</Label>
                <Input id="legacy-tenant-mrr" type="number" min="0" step="1" required value={mrr} onChange={(event) => setMrr(event.target.value)} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="legacy-lease-signed">Lease signed (if known)</Label>
                <Input id="legacy-lease-signed" type="date" value={leaseSignedAt} onChange={(event) => setLeaseSignedAt(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="legacy-lease-start">Lease starts</Label>
                <Input id="legacy-lease-start" type="date" required value={since} onChange={(event) => setSince(event.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setImportDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving || !legacyName.trim() || !branchId || !tier}>
                {saving ? <LoaderCircle className="size-4 animate-spin" /> : <FileSignature className="size-4" />}
                Import tenant
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={csvImportOpen} onOpenChange={setCsvImportOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Import tenant leases from CSV</DialogTitle>
            <DialogDescription>
              Upload a spreadsheet saved as a .csv file to add multiple existing tenant lease records. This imports organizations and lease details, not people or member accounts. Required columns: organization_name, branch, tier, since, desks, mrr_zar. Optional: plan_name, lease_signed_at, website, industry. Dates use YYYY-MM-DD; tier uses day_pass, flex, dedicated, private_office, or enterprise.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tenant-roster-csv">CSV file</Label>
              <Input
                id="tenant-roster-csv"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => void loadTenantCsv(event.target.files?.[0])}
              />
              {csvFileName && <p className="text-xs text-muted-foreground">{csvFileName} · {csvRows.length} rows ready</p>}
            </div>
            {csvErrors.length > 0 && (
              <div role="alert" className="max-h-40 overflow-auto rounded-md border border-warning/30 bg-warning/10 p-3 text-xs">
                <p className="mb-2 font-medium">Rows needing attention</p>
                {csvErrors.map((item) => <p key={item} className="mt-1">{item}</p>)}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCsvImportOpen(false)}>Close</Button>
              <Button type="button" onClick={() => void importTenantCsv()} disabled={saving || csvRows.length === 0}>
                {saving ? <LoaderCircle className="size-4 animate-spin" /> : <FileUp className="size-4" />}
                Import {csvRows.length || ""} rows
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
