import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-crawler-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Branch = { id: string; name: string; city: string | null; region: string | null };
type Target = {
  branch_address: string | null;
  latitude: number;
  longitude: number;
  radius_km: number;
  enabled: boolean;
};
type Element = {
  type: string;
  id: number | string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
  provider?: string;
  sourceUrl?: string;
};
type CrawledContact = {
  kind: "email" | "phone" | "social" | "contact_page";
  value: string;
  sourceUrl: string;
};

const robotsCache = new Map<string, string>();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function distanceKm(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const value =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitudeA)) * Math.cos(radians(latitudeB)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function websiteDetails(value?: string) {
  if (!value) return { url: null, domain: null };
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { url: null, domain: null };
    }
    const hostname = url.hostname.toLowerCase();
    if (
      url.username ||
      url.password ||
      !hostname.includes(".") ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ||
      hostname.startsWith("[")
    ) {
      return { url: null, domain: null };
    }
    return { url: url.toString(), domain: url.hostname.replace(/^www\./, "").toLowerCase() };
  } catch {
    return { url: null, domain: null };
  }
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&commat;|&#64;|&#x40;/gi, "@")
    .replace(/&period;|&#46;|&#x2e;/gi, ".")
    .replace(/&colon;|&#58;|&#x3a;/gi, ":");
}

function isPublicAddress(value: string) {
  const address = value.toLowerCase().split("%")[0];
  if (address.includes(":")) {
    return !(
      address === "::" ||
      address === "::1" ||
      address.startsWith("fc") ||
      address.startsWith("fd") ||
      address.startsWith("fe8") ||
      address.startsWith("fe9") ||
      address.startsWith("fea") ||
      address.startsWith("feb") ||
      address.startsWith("ff") ||
      address.startsWith("::ffff:")
    );
  }
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const [first, second] = octets;
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

async function hostResolvesPublicly(hostname: string) {
  try {
    const results = await Promise.all(
      (["A", "AAAA"] as const).map((recordType) =>
        Deno.resolveDns(hostname, recordType).catch(() => [] as string[]),
      ),
    );
    const addresses = results.flat();
    return addresses.length > 0 && addresses.every(isPublicAddress);
  } catch {
    return false;
  }
}

function robotsAllows(robots: string, path: string) {
  const matchingRules: Array<{ allow: boolean; path: string }> = [];
  const groups = robots.split(/(?=^\s*user-agent\s*:)/gim);
  for (const group of groups) {
    const lines = group.split(/\r?\n/).map((line) => line.split("#", 1)[0].trim());
    const agents = lines
      .filter((line) => /^user-agent\s*:/i.test(line))
      .map((line) => line.split(":", 2)[1].trim().toLowerCase());
    if (!agents.some((agent) => agent === "*" || agent.includes("workspaceosprospectcrawler"))) {
      continue;
    }
    for (const line of lines) {
      const directive = line.match(/^(allow|disallow)\s*:\s*(.*)$/i);
      if (directive?.[2]) {
        matchingRules.push({ allow: directive[1].toLowerCase() === "allow", path: directive[2] });
      }
    }
  }
  matchingRules.sort((left, right) => right.path.length - left.path.length);
  return matchingRules.find((rule) => path.startsWith(rule.path))?.allow ?? true;
}

async function readLimitedText(response: Response, maxBytes = 500_000) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = maxBytes - size;
    const chunk = value.length > remaining ? value.slice(0, remaining) : value;
    chunks.push(chunk);
    size += chunk.length;
    if (chunk.length < value.length) break;
  }
  await reader.cancel().catch(() => undefined);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}

async function crawlBusinessWebsite(value: string): Promise<CrawledContact[]> {
  const website = websiteDetails(value);
  if (!website.url || !(await hostResolvesPublicly(new URL(website.url).hostname))) return [];
  const homepage = new URL(website.url);
  const userAgent = "WorkspaceOSProspectCrawler";
  let robots = robotsCache.get(homepage.origin);
  if (robots === undefined) {
    try {
      const response = await fetch(`${homepage.origin}/robots.txt`, {
        headers: { "User-Agent": `${userAgent}/1.0 (public business contact discovery)` },
        redirect: "error",
        signal: AbortSignal.timeout(4000),
      });
      robots = response.ok ? await readLimitedText(response, 100_000) : "";
    } catch {
      robots = "";
    }
    robotsCache.set(homepage.origin, robots);
  }

  const contacts = new Map<string, CrawledContact>();
  const visited = new Set<string>();
  const pages: URL[] = [homepage];
  for (const page of pages) {
    if (visited.has(page.href) || !robotsAllows(robots, page.pathname)) continue;
    visited.add(page.href);
    let response: Response;
    try {
      response = await fetch(page, {
        headers: {
          "User-Agent": `${userAgent}/1.0 (public business contact discovery)`,
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "error",
        signal: AbortSignal.timeout(6000),
      });
    } catch {
      continue;
    }
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) continue;
    const html = decodeHtml(await readLimitedText(response));
    const cleanText = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ");
    const addContact = (kind: CrawledContact["kind"], rawValue: string, sourceUrl: string) => {
      const contactValue = decodeHtml(rawValue)
        .trim()
        .replace(/[),.;]+$/, "");
      if (!contactValue) return;
      contacts.set(`${kind}:${contactValue.toLowerCase()}`, {
        kind,
        value: contactValue,
        sourceUrl,
      });
    };

    for (const match of html.matchAll(/href\s*=\s*(["'])(mailto:|tel:)([^"']+)\1/gi)) {
      const kind = match[2].toLowerCase() === "mailto:" ? "email" : "phone";
      addContact(kind, match[3].split(/[?#]/, 1)[0], page.href);
    }
    for (const email of cleanText.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []) {
      addContact("email", email, page.href);
    }

    const linkPattern = /<a\b[^>]*href\s*=\s*(["'])([^"']+)\1[^>]*>/gi;
    for (const link of html.matchAll(linkPattern)) {
      try {
        const destination = new URL(decodeHtml(link[2]), page);
        if (
          [
            "facebook.com",
            "instagram.com",
            "linkedin.com",
            "x.com",
            "twitter.com",
            "youtube.com",
          ].some(
            (domain) =>
              destination.hostname === domain || destination.hostname.endsWith(`.${domain}`),
          )
        ) {
          addContact("social", destination.href, page.href);
        } else if (
          destination.origin === homepage.origin &&
          pages.length === 1 &&
          /contact|about|find-us|get-in-touch/i.test(destination.pathname)
        ) {
          pages.push(destination);
          addContact("contact_page", destination.href, page.href);
        }
      } catch {
        continue;
      }
    }
  }
  return [...contacts.values()].slice(0, 30);
}

async function crawlBusinessWebsites(elements: Element[]) {
  const websites = [
    ...new Set(
      elements.slice(0, 30).flatMap((element) => {
        const tags = element.tags ?? {};
        const website = websiteDetails(tags["contact:website"] ?? tags.website).url;
        return website ? [website] : [];
      }),
    ),
  ];
  const contactsByWebsite = new Map<string, CrawledContact[]>();

  for (let offset = 0; offset < websites.length; offset += 5) {
    const batch = websites.slice(offset, offset + 5);
    const results = await Promise.all(
      batch.map(async (website) => [website, await crawlBusinessWebsite(website)] as const),
    );
    for (const [website, contacts] of results) {
      contactsByWebsite.set(website, contacts);
    }
  }

  return contactsByWebsite;
}

function publicContacts(tags: Record<string, string>) {
  const candidates: Array<{ kind: "email" | "phone" | "social" | "contact_page"; value: string }> =
    [];
  const addValues = (kind: "email" | "phone" | "social" | "contact_page", value?: string) => {
    if (!value) return;
    for (const part of value
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 5)) {
      candidates.push({ kind, value: part });
    }
  };

  addValues("email", tags["contact:email"] ?? tags.email);
  addValues("phone", tags["contact:phone"] ?? tags.phone);
  addValues("contact_page", tags["contact:contact_page"] ?? tags["contact:form"]);
  for (const key of ["facebook", "instagram", "linkedin", "twitter", "youtube"]) {
    addValues("social", tags[`contact:${key}`]);
  }
  return candidates;
}

async function discoverGooglePlaces(
  apiKey: string,
  latitude: number,
  longitude: number,
): Promise<Element[]> {
  const searches = [
    "businesses",
    "shops and retailers",
    "offices and professional services",
    "restaurants and cafes",
    "healthcare providers",
  ];
  const places = new Map<string, Element>();

  const searchResults = await Promise.all(
    searches.map(async (search) => {
      const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.googleMapsUri",
        },
        body: JSON.stringify({
          textQuery: `${search} near ${latitude}, ${longitude}`,
          pageSize: 20,
          locationBias: {
            circle: { center: { latitude, longitude }, radius: 30000 },
          },
        }),
        signal: AbortSignal.timeout(30000),
      });
      const responseBody = await response.text();
      if (!response.ok) {
        throw new Error(
          `Google Places search returned ${response.status}${responseBody ? `: ${responseBody.replace(/\s+/g, " ").slice(0, 240)}` : ""}`,
        );
      }
      const result = JSON.parse(responseBody) as {
        places?: Array<{
          id?: string;
          displayName?: { text?: string };
          location?: { latitude?: number; longitude?: number };
          formattedAddress?: string;
          websiteUri?: string;
          nationalPhoneNumber?: string;
          googleMapsUri?: string;
        }>;
      };
      return result.places ?? [];
    }),
  );

  for (const searchResult of searchResults) {
    for (const place of searchResult) {
      const name = place.displayName?.text?.trim();
      const placeId = place.id;
      const placeLatitude = place.location?.latitude;
      const placeLongitude = place.location?.longitude;
      if (!name || !placeId || typeof placeLatitude !== "number" || typeof placeLongitude !== "number") {
        continue;
      }
      const tags: Record<string, string> = { name };
      if (place.websiteUri) tags["contact:website"] = place.websiteUri;
      if (place.nationalPhoneNumber) tags["contact:phone"] = place.nationalPhoneNumber;
      if (place.formattedAddress) tags["addr:full"] = place.formattedAddress;
      places.set(placeId, {
        type: "google_place",
        id: placeId,
        lat: placeLatitude,
        lon: placeLongitude,
        tags,
        provider: "Google Places",
        sourceUrl:
          place.googleMapsUri ??
          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(placeId)}`,
      });
    }
  }

  return [...places.values()];
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "POST is required." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = Deno.env.get("CRAWLER_CRON_SECRET");
  const authorization = request.headers.get("Authorization");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Crawler service is not configured." }, 500);
  }

  let body: { action?: string; branch_id?: string; address?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  const isScheduledRun =
    body.action === "scheduled" &&
    Boolean(cronSecret) &&
    request.headers.get("x-crawler-secret") === cronSecret;
  if (body.action === "scheduled" && !isScheduledRun) {
    return json({ error: "Scheduled crawler authentication failed." }, 401);
  }

  let userId: string | null = null;
  let canRun = isScheduledRun;
  let canConfigure = false;
  if (!isScheduledRun) {
    if (!authorization) return json({ error: "Sign in to use crawler activity." }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData.user) return json({ error: "Sign in to use crawler activity." }, 401);
    userId = userData.user.id;

    const { data: roleRows, error: roleError } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleError) return json({ error: "Could not verify your platform role." }, 403);
    const roles = new Set((roleRows ?? []).map(({ role }) => String(role)));
    canRun = roles.has("sales_manager") || roles.has("crm_manager") || roles.has("group_ceo") || roles.has("superadmin");
    canConfigure = roles.has("group_ceo") || roles.has("superadmin");
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (body.action === "configure") {
      if (!canConfigure)
        return json({ error: "Only platform executives can configure branch locations." }, 403);
      const branchId = String(body.branch_id ?? "");
      const address = String(body.address ?? "").trim();
      if (!branchId || address.length < 8 || address.length > 300) {
        return json({ error: "Select a branch and enter its complete street address." }, 400);
      }

      const { data: branch, error: branchError } = await admin
        .from("branches")
        .select("id,name,city,region")
        .eq("id", branchId)
        .eq("status", "live")
        .maybeSingle();
      if (branchError || !branch) return json({ error: "Live branch not found." }, 404);

      const query = new URLSearchParams({
        format: "jsonv2",
        limit: "1",
        countrycodes: "za",
        q: `${address}, ${branch.city ?? ""}, ${branch.region ?? ""}, South Africa`,
      });
      const geocodeResponse = await fetch(`https://nominatim.openstreetmap.org/search?${query}`, {
        headers: {
          "User-Agent": "WorkspaceOSProspectCrawler/1.0 (Office & Co branch radius configuration)",
          "Accept-Language": "en",
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!geocodeResponse.ok)
        return json({ error: "Address lookup is temporarily unavailable." }, 502);
      const matches = (await geocodeResponse.json()) as Array<{
        lat: string;
        lon: string;
        display_name: string;
      }>;
      const match = matches[0];
      if (!match)
        return json({ error: "No South African map location matched that address." }, 422);

      const { error: saveError } = await admin.from("prospect_branch_targets").upsert(
        {
          branch_id: branchId,
          branch_address: address,
          geocode_label: match.display_name,
          latitude: Number(match.lat),
          longitude: Number(match.lon),
          radius_km: 30,
          enabled: true,
          updated_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "branch_id" },
      );
      if (saveError) return json({ error: saveError.message }, 500);
      return json({
        branch_id: branchId,
        address,
        geocode_label: match.display_name,
        radius_km: 30,
      });
    }

    if (body.action !== "run" && body.action !== "scheduled") {
      return json({ error: "Unknown crawler action." }, 400);
    }
    if (!canRun)
      return json({ error: "Sales or executive access is required to run discovery." }, 403);
    const branchId = String(body.branch_id ?? "");
    if (!branchId) return json({ error: "Select a branch to crawl." }, 400);

    const [{ data: branch }, { data: target }] = await Promise.all([
      admin
        .from("branches")
        .select("id,name,city,region")
        .eq("id", branchId)
        .eq("status", "live")
        .maybeSingle(),
      admin
        .from("prospect_branch_targets")
        .select("branch_address,latitude,longitude,radius_km,enabled")
        .eq("branch_id", branchId)
        .maybeSingle(),
    ]);
    if (!branch) return json({ error: "Live branch not found." }, 404);
    const geofence = target as Target | null;
    if (!geofence?.enabled || !geofence.branch_address || geofence.radius_km !== 30) {
      return json(
        { error: "Configure this branch's exact address and 30 km search area first." },
        409,
      );
    }
    const latitude = Number(geofence.latitude);
    const longitude = Number(geofence.longitude);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return json({ error: "This branch does not have valid map coordinates." }, 409);
    }

    const startedAt = new Date().toISOString();
    const googlePlacesKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    const { data: job, error: jobError } = await admin
      .from("prospect_jobs")
      .insert({
        branch_id: branchId,
        connector: "Google Places",
        status: "running",
        started_at: startedAt,
      })
      .select("id")
      .single();
    if (jobError || !job)
      return json({ error: jobError?.message ?? "Could not create crawl job." }, 500);

    let recordsSeen = 0;
    let recordsCreated = 0;
    let recordsUpdated = 0;
    const errors: string[] = [];
    try {
      if (!googlePlacesKey) throw new Error("Google Places is not configured on the crawler function.");
      const elements = await discoverGooglePlaces(googlePlacesKey, latitude, longitude);
      if (!elements.length) {
        throw new Error("Google Places returned no businesses within 30 km of this branch.");
      }
      recordsSeen = elements.length;

      const websiteContactsByUrl = await crawlBusinessWebsites(elements);
      for (const element of elements.slice(0, 30)) {
        const tags = element.tags ?? {};
        const name = tags.name?.trim();
        const position = element.center ?? element;
        if (!name || typeof position.lat !== "number" || typeof position.lon !== "number") continue;
        const distance = distanceKm(latitude, longitude, position.lat, position.lon);
        if (distance > 30) continue;

        try {
          const website = websiteDetails(tags["contact:website"] ?? tags.website);
          const city = tags["addr:city"] ?? branch.city;
          const normalizedName = name
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, " ")
            .trim();
          let existingQuery = admin
            .from("prospect_profiles")
            .select("id,website_url,website_domain,address,city,region,recommended_branch_id")
            .eq("normalized_name", normalizedName)
            .limit(1);
          existingQuery = city ? existingQuery.eq("city", city) : existingQuery.is("city", null);
          let { data: existing } = await existingQuery.maybeSingle();
          if (!existing && website.domain) {
            const domainResult = await admin
              .from("prospect_profiles")
              .select("id")
              .eq("website_domain", website.domain)
              .limit(1)
              .maybeSingle();
            existing = domainResult.data;
          }

          const listedAddress =
            [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ") || null;
          const profile = {
            company_name: name,
            normalized_name: normalizedName,
            website_url: website.url ?? existing?.website_url ?? null,
            website_domain: website.domain ?? existing?.website_domain ?? null,
            address: tags["addr:full"] ?? listedAddress ?? existing?.address ?? null,
            city: city ?? existing?.city ?? null,
            region: branch.region ?? existing?.region ?? null,
            country: "South Africa",
            latitude: position.lat,
            longitude: position.lon,
            recommended_branch_id: existing?.recommended_branch_id ?? branchId,
            last_crawled_at: new Date().toISOString(),
          };
          let prospectId: string;
          if (existing) {
            const { error } = await admin
              .from("prospect_profiles")
              .update(profile)
              .eq("id", existing.id);
            if (error) throw error;
            prospectId = existing.id;
            recordsUpdated += 1;
          } else {
            const { data: inserted, error } = await admin
              .from("prospect_profiles")
              .insert({ ...profile, discovery_status: "discovered" })
              .select("id")
              .single();
            if (error || !inserted) throw error ?? new Error("Could not save prospect profile.");
            prospectId = inserted.id;
            recordsCreated += 1;
          }

          const provider = element.provider ?? "Google Places";
          const sourceUrl =
            element.sourceUrl ??
            `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
          const { data: source, error: sourceError } = await admin
            .from("prospect_sources")
            .upsert(
              {
                prospect_id: prospectId,
                source_type: "discovery_provider",
                source_url: sourceUrl,
                page_title: name,
                metadata: {
                  provider,
                  branch_id: branchId,
                  distance_km: Number(distance.toFixed(2)),
                  tags,
                },
              },
              { onConflict: "prospect_id,source_url" },
            )
            .select("id")
            .single();
          if (sourceError || !source)
            throw sourceError ?? new Error("Could not save source evidence.");

          const sourceIds = new Map<string, string>([[sourceUrl, source.id]]);
          const websiteContacts = website.url ? websiteContactsByUrl.get(website.url) ?? [] : [];
          if (website.url) {
            const { data: websiteSource, error: websiteSourceError } = await admin
              .from("prospect_sources")
              .upsert(
                {
                  prospect_id: prospectId,
                  source_type: "company_website",
                  source_url: website.url,
                  page_title: `${name} website`,
                  metadata: { provider, branch_id: branchId },
                },
                { onConflict: "prospect_id,source_url" },
              )
              .select("id")
              .single();
            if (websiteSourceError || !websiteSource) {
              throw websiteSourceError ?? new Error("Could not save website evidence.");
            }
            sourceIds.set(website.url, websiteSource.id);
          }

          for (const contact of websiteContacts) {
            if (sourceIds.has(contact.sourceUrl)) continue;
            const { data: contactSource, error: contactSourceError } = await admin
              .from("prospect_sources")
              .upsert(
                {
                  prospect_id: prospectId,
                  source_type: "company_website",
                  source_url: contact.sourceUrl,
                  page_title: `${name} contact page`,
                  metadata: { branch_id: branchId },
                },
                { onConflict: "prospect_id,source_url" },
              )
              .select("id")
              .single();
            if (contactSourceError || !contactSource) {
              throw contactSourceError ?? new Error("Could not save contact-page evidence.");
            }
            sourceIds.set(contact.sourceUrl, contactSource.id);
          }

          const contacts = [
            ...publicContacts(tags).map((contact) => ({ ...contact, sourceUrl })),
            ...websiteContacts,
          ].map((contact) => ({
            prospect_id: prospectId,
            kind: contact.kind,
            value: contact.value,
            label: contact.kind === "social" ? "Public social profile" : null,
            source_id: sourceIds.get(contact.sourceUrl) ?? source.id,
            confidence: contact.kind === "email" || contact.kind === "phone" ? 0.9 : 0.85,
          }));
          if (contacts.length) {
            const { error } = await admin
              .from("prospect_contacts")
              .upsert(contacts, { onConflict: "prospect_id,kind,value" });
            if (error) throw error;
          }
        } catch (error) {
          errors.push(error instanceof Error ? error.message : "Could not save one business listing.");
          if (errors.length >= 5) break;
        }
      }

      const status = errors.length ? "partial" : "succeeded";
      await admin
        .from("prospect_jobs")
        .update({
          status,
          records_seen: recordsSeen,
          records_created: recordsCreated,
          records_updated: recordsUpdated,
          error_summary: errors.length ? errors.join("; ").slice(0, 1000) : null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      return json({
        job_id: job.id,
        status,
        records_seen: recordsSeen,
        records_created: recordsCreated,
        records_updated: recordsUpdated,
        error: errors.length ? errors.join("; ").slice(0, 1000) : null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Crawler job failed.";
      await admin
        .from("prospect_jobs")
        .update({
          status: "failed",
          error_summary: message.slice(0, 1000),
          finished_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      return json({
        job_id: job.id,
        status: "failed",
        records_seen: recordsSeen,
        records_created: recordsCreated,
        records_updated: recordsUpdated,
        error: message,
      });
    }
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Invalid crawler request." },
      400,
    );
  }
});
