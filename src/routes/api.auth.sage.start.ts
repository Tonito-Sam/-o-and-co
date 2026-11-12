import { createFileRoute } from "@tanstack/react-router";
import {
  createOAuthState,
  createSageAuthorizationUrl,
  errorResponse,
  getSageOAuthConfig,
  jsonResponse,
  requireSageOperator,
} from "@/lib/server/sage-oauth";

export const Route = createFileRoute("/api/auth/sage/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { userId, clients } = await requireSageOperator(request);
          const config = getSageOAuthConfig();
          const { error: cleanupError } = await clients.admin
            .from("sage_oauth_states")
            .delete()
            .lt("expires_at", new Date().toISOString());
          if (cleanupError) {
            throw new Error("Could not clear expired Sage authorization states.");
          }
          const { state, stateHash, expiresAt } = createOAuthState();
          const { error } = await clients.admin.from("sage_oauth_states").insert({
            state_hash: stateHash,
            user_id: userId,
            environment: "sandbox",
            expires_at: expiresAt,
          });
          if (error) {
            throw new Error("Could not save Sage authorization state.");
          }
          return jsonResponse({ authorizationUrl: createSageAuthorizationUrl(state, config) });
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
