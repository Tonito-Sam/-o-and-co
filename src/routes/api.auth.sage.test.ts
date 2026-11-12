import { createFileRoute } from "@tanstack/react-router";
import {
  errorResponse,
  getSageApiConfig,
  getSageOAuthConfig,
  jsonResponse,
  requireSageOperator,
  SageOAuthError,
} from "@/lib/server/sage-oauth";

export const Route = createFileRoute("/api/auth/sage/test")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { clients } = await requireSageOperator(request);
          getSageOAuthConfig();
          const { data: connection, error } = await clients.admin
            .from("sage_oauth_connections")
            .select("access_token,expires_at")
            .eq("environment", "sandbox")
            .maybeSingle();
          if (error) throw new Error("Could not load the Sage sandbox connection.");
          if (!connection) {
            throw new SageOAuthError(409, "sage_not_connected", "Connect Sage sandbox first.");
          }
          if (new Date(connection.expires_at).getTime() <= Date.now()) {
            throw new SageOAuthError(
              409,
              "token_expired",
              "The Sage access token has expired. Reconnect Sage sandbox.",
            );
          }

          const { apiKey, baseUrl } = getSageApiConfig();
          const url = new URL("Company/Get", `${baseUrl}/`);
          url.searchParams.set("apikey", apiKey);
          let response: Response;
          try {
            response = await fetch(url, {
              headers: { authorization: `Bearer ${connection.access_token}` },
              cache: "no-store",
              signal: AbortSignal.timeout(15_000),
            });
          } catch {
            throw new SageOAuthError(
              502,
              "sage_api_unavailable",
              "The Sage reseller API could not be reached.",
            );
          }
          if (!response.ok) {
            throw new SageOAuthError(
              502,
              "sage_api_rejected",
              `The Sage reseller API rejected the connection (HTTP ${response.status}).`,
            );
          }
          return jsonResponse({ success: true, message: "Sage sandbox API connection succeeded." });
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
