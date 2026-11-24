import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = !process.argv.includes("--apply");
const officeRows = [
  ["100", "Stellr", 137, 10],
  ["100.1", "Stellr", 32, null],
  ["101", "Stellr", 66, 17],
  ["102", "Stellr", 20, 5],
  ["103", "Colony", 45, 11],
  ["104", "Jec Tech", 20, 5],
  ["105", "U Maganlal", 13.1, 3],
  ["106", "Staff Office", 10, 3],
  ["107", "SA Debt Help", 11, 3],
  ["108", "Ubongo", 20, 5],
  ["109", "Lembasoni Mineral", 10.8, 3],
  ["110", "Connected Devices", 16, 4],
  ["111", "SAISC", 11, 3],
  ["112", "CAMCO", 16, 4],
  ["113", "TopRock Minerals and Mining", 10, 3],
  ["114", "Knit Cash", 16, 4],
  ["115", "SA Debt Help", 32.7, 8],
  ["116", "Ubongo", 36.16, 9],
  ["117", "Lembasoni Mineral", 64, 16],
  ["118", "Opsi", 10.5, null],
  ["119", "Pinpointeone", 12, 3],
  ["120", "Pinpointeone", 10, 3],
  ["121", "Tech Society", 25, 6],
  ["122", "Rgrant Logistics", 11, 3],
  ["123", "Rgrant Logistics", 39, 10],
  ["124", "Best Pos", 40, 10],
  ["125", "Secure Cab", 56, 14],
  ["201", "Cognisys", 70, 18],
  ["201B", "Masthead", 50.8, 13],
  ["202", "Secure Cab", 76, 19],
  ["203", "Vacant 201 (office assignment needs review)", 397, 99],
];
const sharedSpaces = [
  { code: "boardroom-main", name: "Main Boardroom", sourceFolder: "Rosebank/Main Brdrm_" },
  { code: "boardroom-1", name: "Boardroom 1", sourceFolder: "Rosebank/Brdrm 1_" },
  { code: "boardroom-2", name: "Boardroom 2", sourceFolder: "Rosebank/Brdrm 2_" },
  { code: "boardroom-3", name: "Boardroom 3", sourceFolder: "Rosebank/Brdrm 3_" },
];
const aliases = new Map([
  ["u maganlal", ["urvashi u maganlal psychology"]],
  ["lembasoni mineral", ["lemba soni", "lembasoni mineral"]],
  ["toprock minerals and mining", ["top rock mineral and mining", "top rock minerals and mining"]],
  ["knit cash", ["knitcash - luddites group"]],
  ["pinpointeone", ["pinpointone"]],
  ["cognisys", ["cognysis"]],
]);

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function nameMatches(pdfName, databaseName) {
  const expected = normalize(pdfName);
  const actual = normalize(databaseName);
  if (expected === actual) return true;
  const accepted = aliases.get(pdfName.toLowerCase()) ?? [];
  return accepted.some((name) => normalize(name) === actual);
}

async function loadEnvironment() {
  const contents = await readFile(resolve(root, ".env"), "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

function officeCode(number) {
  return `office-${number.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

async function run() {
  await loadEnvironment();
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase URL and service-role key are required in .env.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("id,slug")
    .eq("slug", "rosebank")
    .maybeSingle();
  if (branchError) throw new Error(`Could not load Rosebank branch: ${branchError.message}`);
  if (!branch) throw new Error("Rosebank branch was not found.");

  const { data: tenants, error: tenantError } = await supabase
    .from("tenants")
    .select("id,office_number,companies(name),organizations(name)")
    .eq("branch_id", branch.id)
    .eq("status", "active");
  if (tenantError) throw new Error(`Could not load active Rosebank tenants: ${tenantError.message}`);

  const occupantByOffice = new Map(officeRows.map(([number, occupant]) => [normalize(number), occupant]));
  const records = officeRows.map(([officeNumber, occupant, sqm, desks]) => {
    const officeTenants = (tenants ?? []).filter(
      (tenant) => normalize(tenant.office_number) === normalize(officeNumber),
    );
    const namedTenants = (tenants ?? []).filter((tenant) => {
      const company = Array.isArray(tenant.companies) ? tenant.companies[0] : tenant.companies;
      const organization = Array.isArray(tenant.organizations)
        ? tenant.organizations[0]
        : tenant.organizations;
      return nameMatches(occupant, company?.name) || nameMatches(occupant, organization?.name);
    });

    let status = "needs_review";
    let tenantId = null;
    let match = "unmatched";
    if (officeNumber === "106") {
      status = "shared";
      match = "staff-space";
    } else if (["201", "201B", "203"].includes(officeNumber)) {
      match = "ambiguous-pdf-row";
    } else if (officeTenants.length === 1) {
      const tenant = officeTenants[0];
      const company = Array.isArray(tenant.companies) ? tenant.companies[0] : tenant.companies;
      const organization = Array.isArray(tenant.organizations)
        ? tenant.organizations[0]
        : tenant.organizations;
      if (nameMatches(occupant, company?.name) || nameMatches(occupant, organization?.name)) {
        status = "occupied";
        tenantId = tenant.id;
        match = "office-and-name";
      } else {
        match = "office-name-conflict";
      }
    } else if (officeTenants.length > 1) {
      match = "multiple-tenants-at-office";
    } else if (namedTenants.length === 1) {
      const tenant = namedTenants[0];
      const tenantOfficeOccupant = occupantByOffice.get(normalize(tenant.office_number));
      const company = Array.isArray(tenant.companies) ? tenant.companies[0] : tenant.companies;
      const organization = Array.isArray(tenant.organizations)
        ? tenant.organizations[0]
        : tenant.organizations;
      const tenantName = company?.name ?? organization?.name ?? "";
      if (tenantOfficeOccupant && !nameMatches(tenantOfficeOccupant, tenantName)) {
        match = "tenant-office-conflicts-with-pdf";
      } else {
        tenantId = tenant.id;
        status = "occupied";
        match = "unique-name-match";
      }
    } else if (namedTenants.length > 1) {
      match = "multiple-name-matches";
    }

    return {
      branch_id: branch.id,
      code: officeCode(officeNumber),
      name: `Office ${officeNumber}`,
      category: "office",
      status,
      office_number: officeNumber,
      tenant_id: tenantId,
      source_folder: `Office Numbers PDF/rosebank/${officeNumber}`,
      metadata: {
        source_document: "Office and Co Office Numbers.pdf",
        pdf_occupant: occupant,
        pdf_sqm: sqm,
        pdf_desks: desks,
        occupancy_match: match,
      },
    };
  });

  const boardrooms = sharedSpaces.map((space) => ({
    branch_id: branch.id,
    code: space.code,
    name: space.name,
    category: "meeting_room",
    status: "shared",
    office_number: null,
    tenant_id: null,
    source_folder: space.sourceFolder,
    metadata: {
      source_document: "Rosebank-20261124T122456Z-1-001.zip",
      source_folder: space.sourceFolder,
      occupancy_match: "shared-space-folder",
    },
  }));
  const rows = [...records, ...boardrooms];
  const counts = rows.reduce((result, row) => {
    result[row.status] = (result[row.status] ?? 0) + 1;
    if (row.tenant_id) result.linkedTenants = (result.linkedTenants ?? 0) + 1;
    return result;
  }, {});
  const reviewOffices = records
    .filter((row) => row.status === "needs_review")
    .map((row) => row.office_number);

  if (dryRun) {
    console.log(
      `Rosebank preview: ${records.length} PDF offices and ${boardrooms.length} named boardrooms; ` +
        `${counts.occupied ?? 0} linked occupants, ${counts.needs_review ?? 0} offices need review, ` +
        `${counts.shared ?? 0} staff/shared offices.`,
    );
    console.log(`Review office numbers: ${reviewOffices.join(", ") || "none"}.`);
    console.log("No database changes made. Run with --apply to upsert these facility spaces.");
    return;
  }

  const { error: upsertError } = await supabase
    .from("facility_spaces")
    .upsert(rows, { onConflict: "branch_id,code" });
  if (upsertError) throw new Error(`Could not import Rosebank facility spaces: ${upsertError.message}`);

  console.log(
    `Imported ${records.length} Rosebank office records and ${boardrooms.length} boardrooms. ` +
      `${counts.occupied ?? 0} occupants linked; ${counts.needs_review ?? 0} offices remain flagged for review.`,
  );
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
