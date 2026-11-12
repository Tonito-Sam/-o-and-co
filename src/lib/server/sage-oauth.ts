import { createHash, randomBytes } from "node:crypto";
import { env } from "node:process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Sage's OAuth guide and OpenID metadata specify Shadow for sandbox testing.
const SAGE_AUTHORIZE_URL = "https://id-shadow.sage.com/authorize";
const SAGE_TOKEN_URL = "https://id-shadow.sage.com/oauth/token";
const SAGE_SANDBOX_AUDIENCE = "sbca-za-prd/PUBLIC-API-RESELLERS";
const SAGE_API_BASE_URL = "https://resellers.accounting.sageone.co.za/api/2.0.0";
const SAGE_SCOPE = "openid profile email";
const SAGE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const SAGE_OPERATOR_ROLES = ["superadmin", "group_admin", "group_ceo", "finance"];

export class SageOAuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SageOAuthError";
  }
}

type SageConfig = {
  mode: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type SageServerClients = {
  auth: SupabaseClient;
  admin: SupabaseClient;
};

type SageTokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  token_type?: unknown;
};

function getEnv(...names: string[]): string {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value;
  }
  return "";
}

export function getSageStatusConfiguration() {
  const mode = getEnv("SAGE_MODE") || "demo";
  return {
    mode,
    oauthConfigured: Boolean(
      getEnv("SAGE_CLIENT_ID") &&
        getEnv("SAGE_CLIENT_SECRET") &&
        getEnv("SAGE_REDIRECT_URI"),
    ),
    apiKeyConfigured: Boolean(getEnv("SAGE_API_KEY")),
  };
}

export function getSageServerClients(): SageServerClients {
  const url = getEnv("SUPABASE_URL", "VITE_SUPABASE_URL", "PUBLIC_URL");
  const anonKey = getEnv(
    "SUPABASE_ANON_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "SUPABASE_PUBLIC_ANON_KEY",
    "PUBLISHABLE_KEY",
  );
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRoleKey) {
    throw new SageOAuthError(
      503,
      "server_auth_not_configured",
      "Configure a Supabase URL, anon key, and service-role key for server-side Sage access.",
    );
  }
  return {
    auth: createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
    admin: createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }),
  };
}

export function getSageOAuthConfig(): SageConfig {
  const mode = getEnv("SAGE_MODE") || "demo";
  if (mode !== "sandbox") {
    throw new SageOAuthError(
      409,
      "sandbox_mode_not_enabled",
      "Set SAGE_MODE=sandbox before connecting to Sage sandbox.",
    );
  }

  const clientId = getEnv("SAGE_CLIENT_ID");
  const clientSecret = getEnv("SAGE_CLIENT_SECRET");
  const redirectUri = getEnv("SAGE_REDIRECT_URI");
  if (!clientId || !clientSecret || !redirectUri) {
    throw new SageOAuthError(
      503,
      "oauth_not_configured",
      "Sage sandbox OAuth credentials and redirect URI are not configured on the server.",
    );
  }
  try {
    const parsedRedirectUri = new URL(redirectUri);
    if (parsedRedirectUri.protocol !== "https:" && parsedRedirectUri.hostname !== "localhost") {
      throw new Error("Sage redirect URI must use HTTPS.");
    }
  } catch {
    throw new SageOAuthError(
      503,
      "oauth_redirect_uri_invalid",
      "SAGE_REDIRECT_URI must be a valid HTTPS URL.",
    );
  }
  return { mode, clientId, clientSecret, redirectUri };
}

export async function requireSageOperator(
  request: Request,
  clients = getSageServerClients(),
): Promise<{ userId: string; clients: SageServerClients }> {
  const authorization = request.headers.get("authorization") ?? "";
  const accessToken = /^Bearer\s+(.+)$/i.exec(authorization)?.[1];
  if (!accessToken) {
    throw new SageOAuthError(401, "authentication_required", "Sign in to manage Sage.");
  }

  const { data, error } = await clients.auth.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new SageOAuthError(401, "authentication_required", "Your session is invalid or expired.");
  }

  await assertSageOperatorRole(data.user.id, clients);
  return { userId: data.user.id, clients };
}

export async function assertSageOperatorRole(
  userId: string,
  clients: SageServerClients,
): Promise<void> {
  const { data: assignments, error: roleError } = await clients.admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", SAGE_OPERATOR_ROLES);
  if (roleError) {
    throw new SageOAuthError(503, "role_lookup_failed", "Could not verify Sage administrator access.");
  }
  if (!assignments?.length) {
    throw new SageOAuthError(403, "insufficient_role", "You are not authorized to manage Sage.");
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof SageOAuthError) {
    return jsonResponse({ error: error.code, message: error.message }, error.status);
  }
  console.error("Sage OAuth request failed.", error);
  return jsonResponse(
    { error: "internal_error", message: "The Sage sandbox request could not be completed." },
    500,
  );
}

export function createSageAuthorizationUrl(state: string, config = getSageOAuthConfig()): string {
  const url = new URL(SAGE_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", SAGE_SCOPE);
  url.searchParams.set("audience", SAGE_SANDBOX_AUDIENCE);
  url.searchParams.set("state", state);
  return url.toString();
}

export function createOAuthState(): { state: string; stateHash: string; expiresAt: string } {
  const state = randomBytes(32).toString("base64url");
  return {
    state,
    stateHash: hashOAuthState(state),
    expiresAt: new Date(Date.now() + SAGE_OAUTH_STATE_TTL_MS).toISOString(),
  };
}

export function hashOAuthState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export async function exchangeSageAuthorizationCode(
  code: string,
  config = getSageOAuthConfig(),
): Promise<{ accessToken: string; expiresAt: string; scope: string; tokenType: string }> {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
  });
  let response: Response;
  try {
    response = await fetch(SAGE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new SageOAuthError(
      502,
      "token_exchange_unavailable",
      "Sage could not be reached to complete authorization.",
    );
  }
  if (!response.ok) {
    throw new SageOAuthError(
      502,
      "token_exchange_failed",
      "Sage rejected the authorization-code exchange.",
    );
  }

  let token: SageTokenResponse;
  try {
    token = (await response.json()) as SageTokenResponse;
  } catch {
    throw new SageOAuthError(502, "invalid_token_response", "Sage returned an invalid token response.");
  }
  if (
    typeof token.access_token !== "string" ||
    !token.access_token ||
    typeof token.expires_in !== "number" ||
    !Number.isFinite(token.expires_in) ||
    token.expires_in <= 0
  ) {
    throw new SageOAuthError(502, "invalid_token_response", "Sage returned an incomplete token response.");
  }
  return {
    accessToken: token.access_token,
    expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
    scope: typeof token.scope === "string" ? token.scope : SAGE_SCOPE,
    tokenType: typeof token.token_type === "string" ? token.token_type : "Bearer",
  };
}

export function getSageApiConfig() {
  const apiKey = getEnv("SAGE_API_KEY");
  if (!apiKey) {
    throw new SageOAuthError(
      409,
      "api_key_not_configured",
      "Configure SAGE_API_KEY on the server before testing the reseller API.",
    );
  }
  return { apiKey, baseUrl: SAGE_API_BASE_URL };
}
