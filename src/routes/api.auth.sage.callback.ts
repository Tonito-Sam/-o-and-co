import { createFileRoute } from "@tanstack/react-router";
import { env } from "node:process";
import {
  assertSageOperatorRole,
  exchangeSageAuthorizationCode,
  getSageOAuthConfig,
  getSageServerClients,
  hashOAuthState,
  SageOAuthError,
} from "@/lib/server/sage-oauth";

function billingRedirect(outcome: "connected" | "error", reason?: string): Response {
  const configuredRedirect = env.SAGE_REDIRECT_URI?.trim();
  if (!configuredRedirect) {
    return new Response("Sage OAuth callback is not configured.", { status: 503 });
  }
  const destination = new URL("/billing", configuredRedirect);
  destination.searchParams.set("sage", outcome);
  if (reason) destination.searchParams.set("reason", reason);
  return Response.redirect(destination, 303);
}

export const Route = createFileRoute("/api/auth/sage/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const callbackUrl = new URL(request.url);
        const state = callbackUrl.searchParams.get("state") ?? "";
        const code = callbackUrl.searchParams.get("code");
        const providerError = callbackUrl.searchParams.get("error");
        if (!state) return billingRedirect("error", "invalid_state");

        try {
          const config = getSageOAuthConfig();
          const clients = getSageServerClients();
          const { data: pendingState, error: stateError } = await clients.admin
            .from("sage_oauth_states")
            .delete()
            .eq("state_hash", hashOAuthState(state))
            .eq("environment", "sandbox")
            .gt("expires_at", new Date().toISOString())
            .select("user_id")
            .maybeSingle();
          if (stateError) {
            throw new Error("Could not validate Sage authorization state.");
          }
          if (!pendingState) return billingRedirect("error", "invalid_state");
          await assertSageOperatorRole(pendingState.user_id, clients);

          if (providerError || !code) {
            return billingRedirect("error", "authorization_denied");
          }

          const token = await exchangeSageAuthorizationCode(code, config);
          const { error: saveError } = await clients.admin.from("sage_oauth_connections").upsert(
            {
              environment: "sandbox",
              connected_by: pendingState.user_id,
              access_token: token.accessToken,
              token_type: token.tokenType,
              scope: token.scope,
              expires_at: token.expiresAt,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "environment" },
          );
          if (saveError) {
            throw new Error("Could not save the Sage sandbox connection.");
          }
          return billingRedirect("connected");
        } catch (error) {
          if (error instanceof SageOAuthError) {
            return billingRedirect("error", error.code);
          }
          console.error("Sage OAuth callback failed.");
          return billingRedirect("error", "callback_failed");
        }
      },
    },
  },
});
