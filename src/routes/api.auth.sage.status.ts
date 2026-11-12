import { createFileRoute } from "@tanstack/react-router";
import {
  errorResponse,
  getSageStatusConfiguration,
  jsonResponse,
  requireSageOperator,
} from "@/lib/server/sage-oauth";

export const Route = createFileRoute("/api/auth/sage/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { clients } = await requireSageOperator(request);
          const { data, error } = await clients.admin
            .from("sage_oauth_connections")
            .select("expires_at,scope")
            .eq("environment", "sandbox")
            .maybeSingle();
          if (error) {
            throw new Error("Could not load Sage connection status.");
          }
          return jsonResponse({
            ...getSageStatusConfiguration(),
            connected: Boolean(data),
            expiresAt: data?.expires_at ?? null,
            scope: data?.scope ?? null,
          });
        } catch (error) {
          return errorResponse(error);
        }
      },
    },
  },
});
