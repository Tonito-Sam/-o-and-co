import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.PUBLIC_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("PUBLIC_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const socialDomains = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "x.com",
  "twitter.com",
  "youtube.com",
];

function isPublicIp(address) {
  if (isIP(address) === 4) {
    const [first, second, third] = address.split(".").map(Number);
    return !(
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 192 && second === 0 && third === 0) ||
      (first === 192 && second === 0 && third === 2) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 198 && second === 51 && third === 100) ||
      (first === 203 && second === 0 && third === 113) ||
      first >= 224
    );
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return !(
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("ff") ||
      normalized.startsWith("::ffff:") ||
      normalized.startsWith("2001:db8:")
    );
  }
  return false;
}

function websiteUrl(value) {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password || !url.hostname.includes(".")) return null;
    if (
      url.hostname === "localhost" ||
      url.hostname.endsWith(".localhost") ||
      url.hostname.endsWith(".local") ||
      isIP(url.hostname)
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

async function hostIsPublic(hostname) {
  const addresses = await lookup(hostname, { all: true, verbatim: true }).catch(() => []);
  return addresses.length > 0 && addresses.every(({ address }) => isPublicIp(address));
}

async function fetchPublic(url, timeoutMs = 7000) {
  let current = new URL(url);
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    if (!await hostIsPublic(current.hostname)) throw new Error("Host did not resolve to a public address.");
    const response = await fetch(current, {
      redirect: "manual",
      headers: {
        "User-Agent": "WorkspaceOSProspectCrawler/1.0 (public business contact discovery)",
        Accept: "text/html,application/xhtml+xml,text/plain",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { response, url: current };
    }
    const location = response.headers.get("location");
    await response.body?.cancel().catch(() => undefined);
    if (!location || redirects === 4) throw new Error("Too many or invalid redirects.");
    current = new URL(location, current);
    if (current.protocol !== "http:" && current.protocol !== "https:") {
      throw new Error("Redirect used an unsupported URL scheme.");
    }
  }
  throw new Error("Too many redirects.");
}

async function readLimitedText(response, limit = 500_000) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  while (length < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value.length > limit - length ? value.slice(0, limit - length) : value;
    chunks.push(chunk);
    length += chunk.length;
    if (chunk.length < value.length) break;
  }
  await reader.cancel().catch(() => undefined);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&commat;|&#64;|&#x40;/gi, "@")
    .replace(/&period;|&#46;|&#x2e;/gi, ".")
    .replace(/&colon;|&#58;|&#x3a;/gi, ":");
}

function robotsAllows(robots, path) {
  const groups = robots.split(/(?=^\s*user-agent\s*:)/gim);
  const rules = [];
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
      if (directive?.[2]) rules.push({ allow: directive[1].toLowerCase() === "allow", path: directive[2] });
    }
  }
  rules.sort((left, right) => right.path.length - left.path.length);
  return rules.find((rule) => path.startsWith(rule.path))?.allow ?? true;
}

async function crawlWebsite(value) {
  const start = websiteUrl(value);
  if (!start) return { pages: [], contacts: [], skipped: "Invalid website URL." };

  let robots = "";
  try {
    const { response } = await fetchPublic(new URL("/robots.txt", start.origin), 4000);
    if (response.ok) robots = await readLimitedText(response, 100_000);
    else await response.body?.cancel().catch(() => undefined);
  } catch {
    robots = "";
  }

  const pages = [start];
  const contacts = new Map();
  const pageUrls = new Map();
  for (const page of pages) {
    if (!robotsAllows(robots, page.pathname)) continue;
    try {
      const { response, url: finalUrl } = await fetchPublic(page.href);
      if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
        await response.body?.cancel().catch(() => undefined);
        continue;
      }
      const html = decodeHtml(await readLimitedText(response));
      pageUrls.set(page.href, finalUrl.href);
      const text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ");
      const add = (kind, raw, sourceUrl) => {
        const value = decodeHtml(raw).trim().replace(/[),.;]+$/, "");
        if (value) contacts.set(`${kind}:${value.toLowerCase()}`, { kind, value, sourceUrl });
      };

      for (const match of html.matchAll(/href\s*=\s*(["'])(mailto:|tel:)([^"']+)\1/gi)) {
        const kind = match[2].toLowerCase() === "mailto:" ? "email" : "phone";
        add(kind, match[3].split(/[?#]/, 1)[0], finalUrl.href);
      }
      for (const email of text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []) {
        add("email", email, finalUrl.href);
      }

      for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*(["'])([^"']+)\1[^>]*>/gi)) {
        try {
          const destination = new URL(decodeHtml(match[2]), finalUrl);
          if (socialDomains.some((domain) =>
            destination.hostname === domain || destination.hostname.endsWith(`.${domain}`))) {
            add("social", destination.href, finalUrl.href);
          } else if (
            destination.origin === finalUrl.origin &&
            pages.length === 1 &&
            /contact|about|find-us|get-in-touch/i.test(destination.pathname)
          ) {
            pages.push(destination);
          }
        } catch {
          continue;
        }
      }
    } catch (error) {
      pageUrls.set(page.href, null);
      if (pages.length === 1) return { pages: [], contacts: [], skipped: error.message };
    }
  }
  return { pages, pageUrls, contacts: [...contacts.values()], skipped: null };
}

async function upsertWebsiteSource(prospect, sourceUrl) {
  const { data, error } = await supabase
    .from("prospect_sources")
    .upsert(
      {
        prospect_id: prospect.id,
        source_type: "company_website",
        source_url: sourceUrl,
        page_title: `${prospect.company_name} website contact page`,
        metadata: { provider: "Public website backfill" },
      },
      { onConflict: "prospect_id,source_url" },
    )
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("Could not save website source.");
  return data.id;
}

async function enrichProspect(prospect) {
  const result = await crawlWebsite(prospect.website_url);
  if (result.skipped) return { company: prospect.company_name, status: "skipped", reason: result.skipped };
  if (!result.contacts.length) return { company: prospect.company_name, status: "no public contacts found" };

  const sourceIds = new Map();
  for (const contact of result.contacts) {
    if (!sourceIds.has(contact.sourceUrl)) {
      sourceIds.set(contact.sourceUrl, await upsertWebsiteSource(prospect, contact.sourceUrl));
    }
  }
  const rows = result.contacts.map((contact) => ({
    prospect_id: prospect.id,
    kind: contact.kind,
    value: contact.value,
    label: contact.kind === "social" ? "Public social profile" : null,
    source_id: sourceIds.get(contact.sourceUrl),
    confidence: contact.kind === "email" || contact.kind === "phone" ? 0.9 : 0.85,
    last_verified_at: new Date().toISOString(),
    metadata: { captured_from: contact.sourceUrl },
  }));
  const { error } = await supabase
    .from("prospect_contacts")
    .upsert(rows, { onConflict: "prospect_id,kind,value" });
  if (error) throw error;
  return {
    company: prospect.company_name,
    status: "enriched",
    emails: rows.filter((row) => row.kind === "email").length,
    socials: rows.filter((row) => row.kind === "social").length,
  };
}

const { data: prospects, error } = await supabase
  .from("prospect_profiles")
  .select("id,company_name,website_url")
  .eq("discovery_status", "discovered")
  .not("website_url", "is", null)
  .order("company_name");
if (error) throw error;

let nextIndex = 0;
const results = [];
await Promise.all(
  Array.from({ length: Math.min(5, prospects.length) }, async () => {
    while (nextIndex < prospects.length) {
      const index = nextIndex;
      nextIndex += 1;
      const prospect = prospects[index];
      try {
        results[index] = await enrichProspect(prospect);
      } catch (cause) {
        results[index] = {
          company: prospect.company_name,
          status: "error",
          reason: cause instanceof Error ? cause.message : "Could not save contacts.",
        };
      }
    }
  }),
);

for (const result of results) console.log(JSON.stringify(result));
console.log(JSON.stringify({ total: prospects.length, enriched: results.filter((result) => result.status === "enriched").length }));