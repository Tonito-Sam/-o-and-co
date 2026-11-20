import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(
  root,
  "welcomemedia",
  "Kyalami-and Union-Station",
  "Office & Co Kyalami",
);
const bucket = "facility-space-photos";
const dryRun = process.argv.includes("--dry-run");
const imageTypes = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

async function loadLocalEnvironment() {
  try {
    const contents = await readFile(resolve(root, ".env"), "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function slug(value) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function officeNumbers(value) {
  return [...new Set(value.match(/\d{3}/g) ?? [])].sort();
}

function officeNumbersFromFolder(folderName) {
  const match = folderName.match(
    /^Office\s+(\d{3}(?:\s*(?:(?:&|\+|,|\/|-|and)\s*)?\d{3})*)/i,
  );
  return officeNumbers(match?.[1] ?? "");
}

function tokensMatch(left, right) {
  return left.length === right.length && left.every((token, index) => token === right[index]);
}

function resolveTenant(space, tenants) {
  const spaceNumbers = officeNumbers(space.officeNumber ?? "");
  const overlapping = tenants.filter((tenant) => {
    const tenantNumbers = officeNumbers(tenant.office_number ?? "");
    return tenantNumbers.some((number) => spaceNumbers.includes(number));
  });
  const exact = overlapping.filter((tenant) =>
    tokensMatch(officeNumbers(tenant.office_number ?? ""), spaceNumbers),
  );
  if (exact.length === 1) return { tenantId: exact[0].id, match: "matched" };
  if (exact.length > 1 || overlapping.length > 0) return { tenantId: null, match: "ambiguous" };
  return { tenantId: null, match: "unmatched" };
}

async function collectImages(folder) {
  const result = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
      } else if (imageTypes.has(extname(entry.name).toLowerCase())) {
        const details = await stat(path);
        result.push({
          path,
          filename: entry.name,
          relativePath: relative(sourceRoot, path).split("\\").join("/"),
          size: details.size,
        });
      }
    }
  }
  await visit(folder);
  return result;
}

async function findSpaceSources() {
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  const spaces = new Map();
  const officeSources = new Map();
  const vacantRoot = resolve(sourceRoot, "Vacant Offices");
  const amenitiesRoot = resolve(sourceRoot, "Amenities & Communal areas");

  for (const entry of entries.filter((item) => item.isDirectory())) {
    if (entry.name === "Vacant Offices" || entry.name === "Amenities & Communal areas") continue;
    const numbers = officeNumbersFromFolder(entry.name);
    if (!numbers.length) continue;
    const code = `office-${numbers.join("-")}`;
    const current = officeSources.get(code) ?? {};
    current.occupied = {
      folder: resolve(sourceRoot, entry.name),
      sourceFolder: entry.name,
      numbers,
    };
    officeSources.set(code, current);
  }

  for (const entry of await readdir(vacantRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const numbers = officeNumbersFromFolder(entry.name);
    if (!numbers.length) continue;
    const code = `office-${numbers.join("-")}`;
    const current = officeSources.get(code) ?? {};
    current.vacant = {
      folder: resolve(vacantRoot, entry.name),
      sourceFolder: `Vacant Offices/${entry.name}`,
      numbers,
    };
    officeSources.set(code, current);
  }

  for (const [code, sources] of officeSources) {
    const officeNumber = sources.occupied?.numbers.join(" ") ?? sources.vacant.numbers.join(" ");
    const conflicted = Boolean(sources.occupied && sources.vacant);
    spaces.set(code, {
      code,
      name: `Office ${officeNumber.replace(/\s+/g, " / ")}`,
      category: "office",
      officeNumber,
      sources,
      sourceConflict: conflicted,
    });
  }

  for (const entry of await readdir(amenitiesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const name = entry.name.trim();
    const code = `amenity-${slug(name)}`;
    const isMeetingRoom = /boardroom|meeting room/i.test(name);
    spaces.set(code, {
      code,
      name,
      category: isMeetingRoom ? "meeting_room" : name.toLowerCase().includes("gym") ? "amenity" : "communal",
      officeNumber: null,
      sources: {
        shared: {
          folder: resolve(amenitiesRoot, entry.name),
          sourceFolder: `Amenities & Communal areas/${entry.name}`,
        },
      },
      sourceConflict: false,
    });
  }

  return [...spaces.values()];
}

function chooseOfficeSource(space, tenantMatch) {
  if (space.sources.occupied && space.sources.vacant) {
    if (tenantMatch.match === "matched") {
      return { status: "occupied", tenantId: tenantMatch.tenantId, source: space.sources.occupied };
    }
    if (tenantMatch.match === "unmatched") {
      return { status: "vacant", tenantId: null, source: space.sources.vacant };
    }
    return { status: "needs_review", tenantId: null, source: null };
  }

  if (space.sources.vacant) {
    if (tenantMatch.match === "matched" || tenantMatch.match === "ambiguous") {
      return { status: "needs_review", tenantId: null, source: null };
    }
    return { status: "vacant", tenantId: null, source: space.sources.vacant };
  }

  if (tenantMatch.match === "matched") {
    return { status: "occupied", tenantId: tenantMatch.tenantId, source: space.sources.occupied };
  }
  return { status: "needs_review", tenantId: null, source: space.sources.occupied };
}

function hashPath(path) {
  return createHash("sha256").update(path).digest("hex");
}

async function run() {
  await loadLocalEnvironment();
  const spaces = await findSpaceSources();
  const sourceImages = await collectImages(sourceRoot);
  const allPhotos = sourceImages.length;
  const totalBytes = sourceImages.reduce((total, image) => total + image.size, 0);
  const duplicateSources = spaces.filter((space) => space.sourceConflict);

  if (dryRun) {
    console.log(`Kyalami source check: ${spaces.length} spaces, ${allPhotos} photos, ${(totalBytes / 1e9).toFixed(2)} GB.`);
    console.log(`Occupied/vacant source conflicts: ${duplicateSources.map((space) => space.officeNumber).join(", ") || "none"}.`);
    console.log("Tenant matching and photo-source selection will use active Kyalami tenant records during import.");
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Set SUPABASE_URL, VITE_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY in .env or the process environment.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: branch, error: branchError } = await supabase
    .from("branches")
    .select("id,slug")
    .eq("slug", "kyalami")
    .maybeSingle();
  if (branchError) throw new Error(`Could not load the Kyalami branch: ${branchError.message}`);
  if (!branch) throw new Error("Kyalami branch was not found.");

  const { data: tenants, error: tenantError } = await supabase
    .from("tenants")
    .select("id,office_number")
    .eq("branch_id", branch.id)
    .eq("status", "active");
  if (tenantError) throw new Error(`Could not load active Kyalami tenants: ${tenantError.message}`);

  const resolvedSpaces = await Promise.all(spaces.map(async (space) => {
    const tenantMatch = space.category === "office"
      ? resolveTenant(space, tenants ?? [])
      : { tenantId: null, match: "not_applicable" };
    const selection = space.category === "office"
      ? chooseOfficeSource(space, tenantMatch)
      : { status: "shared", tenantId: null, source: space.sources.shared };
    return {
      ...space,
      ...selection,
      tenantMatch: tenantMatch.match,
      sourceFolder:
        selection.source?.sourceFolder ??
        space.sources.occupied?.sourceFolder ??
        space.sources.vacant?.sourceFolder ??
        "",
      images: selection.source
        ? await collectImages(selection.source.folder)
        : [],
    };
  }));
  const upsertSpaces = await supabase
    .from("facility_spaces")
    .upsert(
      resolvedSpaces.map((space) => ({
        branch_id: branch.id,
        code: space.code,
        name: space.name,
        category: space.category,
        status: space.status,
        office_number: space.officeNumber,
        tenant_id: space.tenantId,
        source_folder: space.sourceFolder,
        metadata: {
          source_conflicts: space.sourceConflict
            ? ["Occupied and vacant source folders both exist; the selected set follows the active tenant record."]
            : [],
          tenant_match: space.tenantMatch,
          source_tenant_label: null,
        },
      })),
      { onConflict: "branch_id,code" },
    )
    .select("id,code");
  if (upsertSpaces.error) throw new Error(`Could not save facility spaces: ${upsertSpaces.error.message}`);

  const idByCode = new Map((upsertSpaces.data ?? []).map((space) => [space.code, space.id]));
  const photosToImport = resolvedSpaces.flatMap((space) => {
    const spaceId = idByCode.get(space.code);
    if (!spaceId) throw new Error(`Database did not return an ID for ${space.code}.`);
    return space.images.map((image, index) => ({
      spaceId,
      path: image.path,
      filename: image.filename,
      relativePath: image.relativePath,
      size: image.size,
      index,
      objectPath: `${branch.slug}/${spaceId}/${hashPath(image.relativePath)}${extname(image.filename).toLowerCase()}`,
    }));
  });
  const spaceIds = [...idByCode.values()];
  const { data: existingPhotos, error: existingPhotosError } = await supabase
    .from("facility_space_photos")
    .select("id,object_path")
    .in("space_id", spaceIds);
  if (existingPhotosError) throw new Error(`Could not check existing facility photos: ${existingPhotosError.message}`);

  const desiredObjectPaths = new Set(photosToImport.map((photo) => photo.objectPath));
  const existingObjectPaths = new Set((existingPhotos ?? []).map((photo) => photo.object_path));
  const staleImportedPhotos = (existingPhotos ?? []).filter(
    (photo) =>
      /^[a-z0-9-]+\/[0-9a-f-]{36}\/[0-9a-f]{64}\.(?:jpg|jpeg|png|webp)$/i.test(photo.object_path) &&
      !desiredObjectPaths.has(photo.object_path),
  );
  let uploadedPhotoCount = 0;
  let reusedPhotoCount = 0;

  for (let offset = 0; offset < photosToImport.length; offset += 3) {
    const batch = photosToImport.slice(offset, offset + 3);
    await Promise.all(batch.map(async (photo) => {
      if (existingObjectPaths.has(photo.objectPath)) {
        reusedPhotoCount += 1;
        return;
      }

      const extension = extname(photo.filename).toLowerCase();
      const file = await readFile(photo.path);
      const { error: uploadError } = await supabase.storage.from(bucket).upload(photo.objectPath, file, {
        contentType: imageTypes.get(extension),
        upsert: true,
      });
      if (uploadError) throw new Error(`Could not upload ${photo.relativePath}: ${uploadError.message}`);

      const { error: photoError } = await supabase.from("facility_space_photos").upsert(
        {
          branch_id: branch.id,
          space_id: photo.spaceId,
          object_path: photo.objectPath,
          source_filename: photo.filename,
          caption: null,
          sort_order: photo.index,
        },
        { onConflict: "object_path" },
      );
      if (photoError) throw new Error(`Could not save photo metadata for ${photo.relativePath}: ${photoError.message}`);
      uploadedPhotoCount += 1;
    }));
    console.log(
      `Processed ${Math.min(offset + batch.length, photosToImport.length)} / ${photosToImport.length} photos.`,
    );
  }

  for (let offset = 0; offset < staleImportedPhotos.length; offset += 100) {
    const batch = staleImportedPhotos.slice(offset, offset + 100);
    const { error: storageError } = await supabase.storage
      .from(bucket)
      .remove(batch.map((photo) => photo.object_path));
    if (storageError) throw new Error(`Could not remove stale imported photos: ${storageError.message}`);

    const { error: recordError } = await supabase
      .from("facility_space_photos")
      .delete()
      .in("id", batch.map((photo) => photo.id));
    if (recordError) throw new Error(`Could not remove stale photo records: ${recordError.message}`);
  }

  console.log(
    `Imported ${resolvedSpaces.length} Kyalami spaces; uploaded ${uploadedPhotoCount} new photos, reused ${reusedPhotoCount}, and removed ${staleImportedPhotos.length} stale imported photos.`,
  );
  console.log(`Conflicting occupied/vacant source folders: ${duplicateSources.map((space) => space.officeNumber).join(", ") || "none"}.`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
