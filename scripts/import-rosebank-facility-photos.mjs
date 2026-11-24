import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(root, "Rosebank-enhanced", "Rosebank");
const apply = process.argv.includes("--apply");
const selections = [
  { code: "office-105", folder: "Off 105_" },
  { code: "office-107", folder: "Off 107_" },
  { code: "office-109", folder: "Off 109_" },
  { code: "office-110", folder: "Off 110_" },
  { code: "office-111", folder: "Off 111_" },
  { code: "office-113", folder: "Off 113_" },
  { code: "office-115", folder: "Off 115_" },
  { code: "office-123", folder: "Off 123_" },
  { code: "office-124", folder: "Off 124_" },
  { code: "boardroom-main", folder: "Main Brdrm_" },
  { code: "boardroom-1", folder: "Brdrm 1_" },
  { code: "boardroom-2", folder: "Brdrm 2_" },
  { code: "boardroom-3", folder: "Brdrm 3_" },
];

async function loadEnvironment() {
  const contents = await readFile(resolve(root, ".env"), "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

async function findPhoto(folder) {
  const directory = join(sourceRoot, folder);
  const files = (await readdir(directory))
    .filter((name) => name.toLowerCase().endsWith("_enhanced.jpg"))
    .sort((a, b) => a.localeCompare(b));
  if (!files.length) throw new Error(`No enhanced JPEG files found in ${directory}.`);
  return { filename: files[0], path: join(directory, files[0]) };
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
    .single();
  if (branchError) throw new Error(`Could not load Rosebank branch: ${branchError.message}`);

  const { data: spaces, error: spacesError } = await supabase
    .from("facility_spaces")
    .select("id,code,name")
    .eq("branch_id", branch.id);
  if (spacesError) throw new Error(`Could not load Rosebank spaces: ${spacesError.message}`);

  const { data: photos, error: photosError } = await supabase
    .from("facility_space_photos")
    .select("id,space_id,source_filename,sort_order")
    .eq("branch_id", branch.id);
  if (photosError) throw new Error(`Could not load existing Rosebank photos: ${photosError.message}`);

  const spaceByCode = new Map((spaces ?? []).map((space) => [space.code, space]));
  const photoRows = photos ?? [];
  const nextSortOrder = new Map();
  for (const photo of photoRows) {
    nextSortOrder.set(photo.space_id, Math.max(nextSortOrder.get(photo.space_id) ?? -1, photo.sort_order));
  }

  const plan = [];
  for (const selection of selections) {
    const space = spaceByCode.get(selection.code);
    if (!space) throw new Error(`Rosebank facility space ${selection.code} was not found.`);
    const photo = await findPhoto(selection.folder);
    const existing = photoRows.some(
      (row) => row.space_id === space.id && row.source_filename === photo.filename,
    );
    if (existing) continue;

    const sortOrder = (nextSortOrder.get(space.id) ?? -1) + 1;
    nextSortOrder.set(space.id, sortOrder);
    plan.push({ ...selection, ...photo, space, sortOrder });
  }

  if (!apply) {
    console.log(`Rosebank photo preview: ${plan.length} facility photos ready for upload.`);
    for (const item of plan) console.log(`${item.code}: ${item.filename}`);
    console.log("No database changes made. Run with --apply to upload and register these photos.");
    return;
  }

  for (const item of plan) {
    const objectPath = `${branch.slug}/${item.space.id}/rosebank-enhanced-${item.filename}`;
    const bytes = await readFile(item.path);
    const { error: uploadError } = await supabase.storage
      .from("facility-space-photos")
      .upload(objectPath, bytes, { contentType: "image/jpeg", upsert: true });
    if (uploadError) {
      throw new Error(`Could not upload ${item.filename}: ${uploadError.message}`);
    }

    const { error: insertError } = await supabase.from("facility_space_photos").insert({
      branch_id: branch.id,
      space_id: item.space.id,
      object_path: objectPath,
      source_filename: item.filename,
      caption: `Enhanced Rosebank photo — ${item.space.name}`,
      sort_order: item.sortOrder,
    });
    if (insertError) {
      const { error: cleanupError } = await supabase.storage
        .from("facility-space-photos")
        .remove([objectPath]);
      const cleanupMessage = cleanupError ? ` Cleanup also failed: ${cleanupError.message}` : "";
      throw new Error(`Could not register ${item.filename}: ${insertError.message}.${cleanupMessage}`);
    }
    console.log(`Uploaded ${item.code}: ${item.filename}`);
  }

  console.log(`Imported ${plan.length} Rosebank facility photos.`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
