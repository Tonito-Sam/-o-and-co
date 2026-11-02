import { createFileRoute } from "@tanstack/react-router";
import { UnionStationPerformanceDashboard } from "@/components/UnionStationPerformanceDashboard";

export const Route = createFileRoute("/union-station-admin")({
  head: () => ({ meta: [{ title: "Union Station Performance — WorkspaceOS" }] }),
  component: UnionStationPerformanceDashboard,
});
