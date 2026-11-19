import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ExternalLink,
  FileSignature,
  FileUp,
  LoaderCircle,
  Plus,
  Search,
  BriefcaseBusiness,
  LayoutGrid,
  List,
  Building,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { PageHeader } from "@/components/PageHeader";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSupabaseClient } from "@/lib/supabase";
import { useRole } from "@/lib/role-context";

type Relation<T> = T | T[] | null;

type TenantRow = {
  id: string;
  organization_id: string | null;
  company_id: string | null;
  branch_id: string;
  office_number: string | null;
  tier: string | null;
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
}

// --- Utility Functions ---
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

function normalizedHeader(value: unknown) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function excelDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 0) {
    const date = XLSX.SSF.parse_date_code(value);
    if (date) return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  const text = String(value ?? "").trim();
  if (!text) return "";
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function excelAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = String(value ?? "").replace(/[R,\s]/gi, "").trim();
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function parseClientRosterWorkbook(workbook: XLSX.WorkBook, fileName: string) {
  const branch = /kyalami/i.test(fileName) ? "kyalami" : /rosebank/i.test(fileName) ? "rosebank" : "";
  if (!branch) throw new Error("Name the workbook Kyalami or Rosebank so its branch can be identified.");
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("The workbook does not contain a worksheet.");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true });
  const headers = (matrix[1] ?? []).map(normalizedHeader);
  const column = (predicate: (header: string) => boolean) => headers.findIndex(predicate);
  const officeIndex = column((header) => header === "office number");
  const companyIndex = column((header) => header === "company name");
  if (officeIndex < 0 || companyIndex < 0) throw new Error("The workbook needs Office number and Company Name columns in row 2.");
  const findColumn = (...names: string[]) => column((header) => names.includes(header));
  const startIndex = findColumn("rental start date full", "rental start date");
  const endIndex = findColumn("rental ending date change to actual when client gives notice", "rental ending date");
  const escalationIndex = findColumn("next escalation date");
  const rentIndexes = ["rent office", "rent co space", "rent virtual"].map((name) => findColumn(name)).filter((index) => index >= 0);
  const depositIndex = findColumn("deposit paid");
  const termIndex = findColumn("lease term");
  const sizeIndex = findColumn("office sqm");
  const industryIndex = findColumn("client industry");
  const notesIndex = findColumn("additional notes");
  const boardroomIndexes = headers.flatMap((header, index) => header.includes("boardroom") ? [index] : []);
  const date = (row: unknown[], index: number) => index < 0 ? "" : excelDate(row[index]);
  const amount = (row: unknown[], index: number) => index < 0 ? null : excelAmount(row[index]);

  return matrix.slice(4).flatMap((row) => {
    const officeNumber = String(row[officeIndex] ?? "").trim().replace(/\s+/g, " ");
    const organizationName = String(row[companyIndex] ?? "").trim();
    if (!officeNumber || !organizationName || /^total$/i.test(organizationName)) return [];

    const sourceData: Record<string, { header: string; value: string }> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      let columnName = "";
      let columnNumber = index + 1;
      while (columnNumber > 0) {
        columnNumber -= 1;
        columnName = String.fromCharCode(65 + (columnNumber % 26)) + columnName;
        columnNumber = Math.floor(columnNumber / 26);
      }
      sourceData[columnName] = { header: String((matrix[1] ?? [])[index] ?? "").trim(), value: String(row[index] ?? "").trim() };
    });
    const rent = rentIndexes.map((index) => amount(row, index)).find((value) => value !== null) ?? null;
    const boardroom = boardroomIndexes.map((index) => {
        const label = String((matrix[1] ?? [])[index] ?? "").trim();
        const value = String(row[index] ?? "").trim();
        return value ? `${label}: ${value}` : "";
      }).filter(Boolean).join("; ");

    return [{
      branch, organization_name: organizationName, office_number: officeNumber,
      tier: /^virtual$/i.test(officeNumber) ? "flex" : "private_office",
      office_size: amount(row, sizeIndex), office_rental_zar: rent,
      lease_term: termIndex < 0 ? "" : String(row[termIndex] ?? "").trim(),
      lease_start_date: date(row, startIndex), rental_end_date: date(row, endIndex),
      next_escalation_date: date(row, escalationIndex), deposit_paid_zar: amount(row, depositIndex),
      industry: industryIndex < 0 ? "" : String(row[industryIndex] ?? "").trim(),
      office_details: notesIndex < 0 ? "" : String(row[notesIndex] ?? "").trim(),
      boardroom_access: boardroom, source_data: sourceData,
    }];
  });
}

export const Route = createFileRoute("/tenants")({
  head: () => ({ meta: [{ title: "Registered Tenants — WorkspaceOS" }] }),
  component: Tenants,
});

function Tenants() {
  const { role } = useRole();
  const isBranchManager = role.id === "branch-manager";
  const assignedBranchIds = useMemo(() => role.branchIds ?? [], [role.branchIds]);
  const assignedBranchNames = useMemo(
    () => (role.branchNames?.length ? role.branchNames : role.branch ? [role.branch] : []),
    [role.branch, role.branchNames],
  );
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list"); // NEW: View Toggle

  // Dialog States
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [legacyName, setLegacyName] = useState("");
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [csvFileName, setCsvFileName] = useState("");
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [rosterRows, setRosterRows] = useState<Record<string, unknown>[]>([]);
  const [branchId, setBranchId] = useState("");
  const [tier, setTier] = useState("");
  const [planName, setPlanName] = useState("");
  const [desks, setDesks] = useState("0");
  const [mrr, setMrr] = useState("0");
  const [since, setSince] = useState(localDate);
  const [leaseSignedAt, setLeaseSignedAt] = useState(localDate);

  const canManage = [
    "superadmin", "group-admin", "group-ceo", "crm-manager", "sales-manager", "rosebank-sales", "finance", "branch-manager",
  ].includes(role.id);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Supabase is not configured."); setLoading(false); return;
    }

    let active = true;
    const loadTenants = async () => {
      const branchResult = await supabase.from("branches").select("id,name").eq("status", "live").order("name");
      if (!active) return;
      if (branchResult.error) {
        setError(branchResult.error.message); setTenants([]); setBranches([]); setLoading(false); return;
      }

      const allBranches = (branchResult.data ?? []) as BranchRow[];
      const assignedNames = new Set(assignedBranchNames.map((name) => name.trim().toLowerCase()));
      const allowedBranches = isBranchManager
        ? allBranches.filter((branch) => assignedBranchIds.includes(branch.id) || assignedNames.has(branch.name.trim().toLowerCase()))
        : allBranches;
      setBranches(allowedBranches);

      const allowedBranchIds = allowedBranches.map((branch) => branch.id);
      if (isBranchManager && allowedBranchIds.length === 0) {
        setError("No branch is assigned to this Branch Manager account."); setTenants([]); setLoading(false); return;
      }

      let tenantQuery = supabase
        .from("tenants")
        .select("id,organization_id,company_id,branch_id,office_number,tier,plan_name,desks,mrr_zar,since,lease_signed_at,status,organizations(name,industry,website),companies(name),branches(name)")
        .eq("status", "active")
        .order("since", { ascending: false });
      if (isBranchManager) tenantQuery = tenantQuery.in("branch_id", allowedBranchIds);

      const tenantResult = await tenantQuery;
      if (!active) return;
      if (tenantResult.error) {
        setError(tenantResult.error.message); setTenants([]);
      } else {
        setTenants((tenantResult.data ?? []) as TenantRow[]); setError("");
      }
      setLoading(false);
    };
    void loadTenants();
    return () => { active = false; };
  }, [assignedBranchIds, assignedBranchNames, isBranchManager]);

  const branchTenants = useMemo(
    () => selectedBranchId === "all" ? tenants : tenants.filter((tenant) => tenant.branch_id === selectedBranchId),
    [selectedBranchId, tenants]
  );

  const filteredTenants = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return branchTenants;
    return branchTenants.filter((tenant) => {
      const organization = one(tenant.organizations);
      const company = one(tenant.companies);
      const branch = one(tenant.branches);
      return [organization?.name, company?.name, organization?.industry, organization?.website, branch?.name, tenant.plan_name, tenant.office_number]
        .some((value) => value?.toLowerCase().includes(query));
    });
  }, [branchTenants, search]);

  const representedOrganizations = new Set(branchTenants.map((t) => t.organization_id ?? t.company_id).filter(Boolean)).size;
  const representedBranches = new Set(branchTenants.map((t) => t.branch_id)).size;

  const resetLeaseForm = () => {
    setBranchId(""); setTier(""); setPlanName(""); setDesks("0"); setMrr("0"); setSince(localDate()); setLeaseSignedAt(localDate());
  };

  const importExistingTenant = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supabase = getSupabaseClient();
    const branch = branches.find((item) => item.id === branchId);
    if (!supabase || !branch || !tier) return;
    setSaving(true);
    const { error: importError } = await supabase.rpc("import_existing_tenant", {
      p_organization_name: legacyName.trim(), p_branch: branch.name, p_tier: tier,
      p_plan_name: planName.trim() || null, p_desks: Number(desks), p_mrr_zar: Number(mrr),
      p_since: since, p_lease_signed_at: leaseSignedAt || null,
    });
    setSaving(false);
    if (importError) { toast.error(importError.message); return; }
    toast.success("Existing tenant imported and linked.");
    setImportDialogOpen(false); setLegacyName(""); resetLeaseForm();

    let reloadQuery = supabase.from("tenants").select("id,organization_id,company_id,branch_id,office_number,tier,plan_name,desks,mrr_zar,since,lease_signed_at,status,organizations(name,industry,website),companies(name),branches(name)").eq("status", "active").order("since", { ascending: false });
    if (isBranchManager) reloadQuery = reloadQuery.in("branch_id", branches.map((item) => item.id));
    const { data, error: reloadError } = await reloadQuery;
    if (reloadError) toast.error(reloadError.message);
    else setTenants((data ?? []) as TenantRow[]);
  };

  const loadTenantFile = async (file?: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Spreadsheet files must be 5 MB or smaller."); return; }
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!extension || !["csv", "xls", "xlsx"].includes(extension)) { toast.error("Choose a CSV, XLS, or XLSX tenant roster."); return; }
    if (extension !== "csv") {
      try {
        const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true });
        const parsedRows = parseClientRosterWorkbook(workbook, file.name);
        if (!parsedRows.length) throw new Error("No occupied tenant rows were found in the workbook.");
        if (parsedRows.length > 500) throw new Error("Import at most 500 tenant rows per file.");
        setRosterRows(parsedRows); setCsvRows([]); setCsvFileName(file.name); setCsvErrors([]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not read the spreadsheet.");
      }
      return;
    }
    setRosterRows([]);
    const parsed = parseCsv(await file.text());
    if (parsed.length < 2) { toast.error("The CSV needs a header row and at least one tenant row."); return; }
    const headers = parsed[0].map((header) => header.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
    const records = parsed.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
    const rows = records.map((record) => ({
        organization_name: csvValue(record, "organization_name", "company_name", "company", "organization", "tenant", "name"),
        branch: csvValue(record, "branch", "branch_name", "location"),
        tier: csvValue(record, "tier", "subscription_tier", "membership_tier").toLowerCase().replace(/[ -]+/g, "_"),
        plan_name: csvValue(record, "plan_name", "plan"),
        desks: csvInteger(csvValue(record, "desks", "desk_count", "workspace_count")),
        mrr_zar: csvInteger(csvValue(record, "mrr_zar", "monthly_fee", "monthly_rent", "mrr")),
        since: csvValue(record, "since", "lease_start", "lease_start_date", "start_date"),
        lease_signed_at: csvValue(record, "lease_signed_at", "signed_at", "lease_signed", "signature_date"),
        website: csvValue(record, "website", "website_url"),
        industry: csvValue(record, "industry"),
      })).filter((record) => Object.values(record).some(Boolean));
    if (rows.length > 500) { toast.error("Import at most 500 tenants per file."); return; }
    setCsvRows(rows); setCsvFileName(file.name); setCsvErrors([]);
  };

  const importTenantCsv = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || (csvRows.length === 0 && rosterRows.length === 0)) return;
    setSaving(true);
    const { data, error: importError } = rosterRows.length
      ? await supabase.functions.invoke("import-client-roster", { body: { rows: rosterRows } })
      : await supabase.rpc("import_existing_tenants", { p_rows: csvRows });
    setSaving(false);
    if (importError) { toast.error(importError.message); return; }
    const result = data as { imported: number; errors: { row: number; organization_name: string; error: string }[] };
    const errors = result.errors.map((item) => `Row ${item.row}: ${item.organization_name || "Unnamed tenant"} · ${item.error}`);
    setCsvErrors(errors);
    toast.success(`${result.imported} tenant${result.imported === 1 ? "" : "s"} imported${errors.length ? ` · ${errors.length} need attention` : ""}.`);

    let reloadQuery = supabase.from("tenants").select("id,organization_id,company_id,branch_id,office_number,tier,plan_name,desks,mrr_zar,since,lease_signed_at,status,organizations(name,industry,website),companies(name),branches(name)").eq("status", "active").order("since", { ascending: false });
    if (isBranchManager) reloadQuery = reloadQuery.in("branch_id", branches.map((item) => item.id));
    const { data: tenantData, error: reloadError } = await reloadQuery;
    if (reloadError) toast.error(reloadError.message);
    else setTenants((tenantData ?? []) as TenantRow[]);
    if (errors.length === 0) { setCsvImportOpen(false); setCsvRows([]); setCsvFileName(""); }
  };

  const getDomain = (website: string | null) => {
    if (!website) return null;
    return website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  };

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  return (
    <div className="mx-auto max-w-[1400px] space-y-8 pb-12">
      <PageHeader
        eyebrow="Lease Account Management"
        title="Tenants"
        description="Organizations with an active signed lease. Manage their workspace allocations, MRR, and onboarding status."
        actions={
          canManage ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" className="bg-white" onClick={() => { setBranchId(""); setTier(""); setSince(""); setLeaseSignedAt(""); setImportDialogOpen(true); }}>
                <Plus className="mr-2 size-4 text-muted-foreground" /> Import Tenant
              </Button>
              <Button onClick={() => setCsvImportOpen(true)}>
                <FileUp className="mr-2 size-4" /> Bulk Import
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Metrics Bar */}
      <div className="grid grid-cols-1 divide-y rounded-xl border bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0 shadow-sm">
        <div className="flex items-center gap-4 p-6">
          <div className="flex size-12 items-center justify-center rounded-full bg-blue-50 text-blue-600"><FileSignature className="size-5" /></div>
          <div><p className="text-sm font-medium text-muted-foreground">Active Leases</p><p className="text-2xl font-semibold text-foreground">{tenants.length}</p></div>
        </div>
        <div className="flex items-center gap-4 p-6">
          <div className="flex size-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600"><BriefcaseBusiness className="size-5" /></div>
          <div><p className="text-sm font-medium text-muted-foreground">Organizations</p><p className="text-2xl font-semibold text-foreground">{representedOrganizations}</p></div>
        </div>
        <div className="flex items-center gap-4 p-6">
          <div className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Building className="size-5" /></div>
          <div><p className="text-sm font-medium text-muted-foreground">Branches Active</p><p className="text-2xl font-semibold text-foreground">{representedBranches}</p></div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {!isBranchManager && branches.length > 0 ? (
            <Tabs value={selectedBranchId} onValueChange={setSelectedBranchId}>
              <TabsList className="h-9 bg-transparent p-0">
                <TabsTrigger value="all" className="rounded-full px-4 data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground">All Branches</TabsTrigger>
                {branches.map((branch) => (
                  <TabsTrigger key={branch.id} value={branch.id} className="rounded-full px-4 data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground">{branch.name}</TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : <div />}

          <div className="flex items-center gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tenants..." className="h-9 bg-background pl-9" />
            </div>
            {/* View Toggle */}
            <div className="flex items-center rounded-lg border bg-background p-1 shadow-sm">
              <button
                onClick={() => setViewMode("list")}
                className={`rounded-md p-1.5 transition-colors ${viewMode === "list" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                title="List View"
              >
                <List className="size-4" />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`rounded-md p-1.5 transition-colors ${viewMode === "grid" ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                title="Grid View"
              >
                <LayoutGrid className="size-4" />
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
            <p className="font-semibold">Tenant records unavailable</p>
            <p className="mt-1 text-destructive/80">{error}</p>
          </div>
        )}

        {/* Data Rendering */}
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border bg-card py-24 text-muted-foreground">
            <LoaderCircle className="size-6 animate-spin text-primary" />
            <p className="text-sm">Loading tenant directory...</p>
          </div>
        ) : filteredTenants.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 py-24 text-center">
            <FileSignature className="size-10 text-muted-foreground/50" />
            <h3 className="mt-4 text-base font-semibold">
              {branchTenants.length ? "No tenants match your search" : "No active leases yet"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {branchTenants.length ? "Try adjusting your search terms or selecting a different branch." : "An organization will appear here once its signed lease is recorded."}
            </p>
          </div>
        ) : viewMode === "list" ? (

          /* --- LIST VIEW --- */
          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1020px] text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="px-6 py-4">Organization</th>
                    <th className="px-6 py-4">Branch</th>
                    <th className="px-6 py-4">Office / Room</th>
                    <th className="px-6 py-4">Plan</th>
                    <th className="px-6 py-4 text-right">Monthly Fee</th>
                    <th className="px-6 py-4 text-right">Lease Start</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredTenants.map((tenant) => {
                    const organization = one(tenant.organizations);
                    const company = one(tenant.companies);
                    const branch = one(tenant.branches);
                    const displayName = organization?.name ?? company?.name ?? "Unnamed Tenant";
                    const domain = getDomain(organization?.website ?? null);

                    return (
                      <tr key={tenant.id} className="group transition-colors hover:bg-muted/30">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-white shadow-sm">
                              {domain ? (
                                <img src={`https://logo.clearbit.com/${domain}`} alt={displayName} className="size-full object-contain p-1" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }} />
                              ) : null}
                              <div className={`flex size-full items-center justify-center bg-slate-100 text-xs font-bold text-slate-600 ${domain ? 'hidden' : ''}`}>
                                {displayName.substring(0, 2).toUpperCase()}
                              </div>
                            </div>

                            <div>
                              <div className="flex items-center gap-2 font-medium text-foreground">
                                {displayName}
                                {organization?.website && (
                                  <a href={organization.website} target="_blank" rel="noreferrer" className="opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-primary">
                                    <ExternalLink className="size-3.5" />
                                  </a>
                                )}
                              </div>
                              {organization?.industry && <div className="text-xs text-muted-foreground">{organization.industry}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="inline-flex items-center gap-2 rounded-md bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                            <Building2 className="size-3.5 opacity-70" /> {branch?.name ?? "Unassigned"}
                          </div>
                        </td>
                        <td className="px-6 py-4 font-medium tabular-nums">{tenant.office_number || "—"}</td>
                        <td className="px-6 py-4"><span className="capitalize text-muted-foreground">{tenant.plan_name || tenant.tier?.replace('_', ' ') || "Standard"}</span></td>
                        <td className="px-6 py-4 text-right font-medium tabular-nums">R {new Intl.NumberFormat("en-ZA").format(tenant.mrr_zar ?? 0)}</td>
                        <td className="px-6 py-4 text-right text-muted-foreground tabular-nums">
                          {tenant.since ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${tenant.since}T00:00:00`)) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        ) : (

          /* --- GRID VIEW --- */
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTenants.map((tenant) => {
              const organization = one(tenant.organizations);
              const company = one(tenant.companies);
              const branch = one(tenant.branches);
              const displayName = organization?.name ?? company?.name ?? "Unnamed Tenant";
              const domain = getDomain(organization?.website ?? null);

              return (
                <div key={tenant.id} className="group relative flex flex-col justify-between overflow-hidden rounded-xl border bg-card p-5 shadow-sm transition-all hover:border-primary/20 hover:shadow-md">
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        {/* Company Logo with Initials Fallback */}
                        <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-white shadow-sm">
                          {domain ? (
                            <img src={`https://logo.clearbit.com/${domain}`} alt={displayName} className="size-full object-contain p-1" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden'); }} />
                          ) : null}
                          <div className={`flex size-full items-center justify-center bg-slate-100 text-xs font-bold text-slate-600 ${domain ? 'hidden' : ''}`}>
                            {getInitials(displayName)}
                          </div>
                        </div>

                        <div>
                          <h3 className="font-semibold leading-tight text-foreground">{displayName}</h3>
                          {organization?.industry && <p className="text-xs text-muted-foreground">{organization.industry}</p>}
                        </div>
                      </div>
                    </div>

                    {organization?.website && (
                      <a href={organization.website} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                        {organization.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-4 rounded-xl bg-muted/30 p-3">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Monthly Fee</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">R {new Intl.NumberFormat("en-ZA").format(tenant.mrr_zar ?? 0)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Lease Starts</p>
                      <p className="mt-0.5 text-sm font-medium tabular-nums text-foreground">
                        {tenant.since ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${tenant.since}T00:00:00`)) : "Not set"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center gap-2 border-t pt-4">
                    <Building2 className="size-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-muted-foreground">{branch?.name ?? "Branch not set"}</span>
                    <span className="ml-auto rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                      Office {tenant.office_number || "not assigned"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* --- Dialogs --- */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import an existing tenant</DialogTitle>
            <DialogDescription>Add a current lease from your existing tenant roster.</DialogDescription>
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
                {saving ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <FileSignature className="mr-2 size-4" />}
                Import tenant
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={csvImportOpen} onOpenChange={setCsvImportOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Import tenant roster</DialogTitle>
            <DialogDescription>Upload a CSV, XLS, or XLSX file.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tenant-roster-csv">Roster file</Label>
              <Input
                id="tenant-roster-csv"
                type="file"
                accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => void loadTenantFile(event.target.files?.[0])}
              />
              {csvFileName && <p className="text-xs text-muted-foreground">{csvFileName} · {rosterRows.length || csvRows.length} rows ready</p>}
            </div>
            {csvErrors.length > 0 && (
              <div role="alert" className="max-h-40 overflow-auto rounded-md border border-warning/30 bg-warning/10 p-3 text-xs">
                <p className="mb-2 font-medium">Rows needing attention</p>
                {csvErrors.map((item) => <p key={item} className="mt-1">{item}</p>)}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCsvImportOpen(false)}>Close</Button>
              <Button type="button" onClick={() => void importTenantCsv()} disabled={saving || (csvRows.length === 0 && rosterRows.length === 0)}>
                {saving ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <FileUp className="mr-2 size-4" />}
                Import {rosterRows.length || csvRows.length || ""} rows
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}