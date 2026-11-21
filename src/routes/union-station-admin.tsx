import { createFileRoute } from "@tanstack/react-router";
import { UnionStationPerformanceDashboard } from "@/components/UnionStationPerformanceDashboard";

export const Route = createFileRoute("/union-station-admin")({
  head: () => ({ meta: [{ title: "Union Station Performance — WorkspaceOS" }] }),
  validateSearch: (search: Record<string, unknown>): { requestId?: string } => ({
    ...(typeof search.requestId === "string" ? { requestId: search.requestId } : {}),
  }),
  component: UnionStationAdmin,
});

function UnionStationAdmin() {
  const { requestId } = Route.useSearch();
  return <UnionStationPerformanceDashboard requestId={requestId} />;
}
