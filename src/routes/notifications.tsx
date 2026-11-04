import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notifications — WorkspaceOS" }] }),
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
});
