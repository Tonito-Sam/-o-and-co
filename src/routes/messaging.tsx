import { createFileRoute } from "@tanstack/react-router";
import { LiveMessagingBoard } from "@/components/LiveMessagingBoard";

export const Route = createFileRoute("/messaging")({
  head: () => ({ meta: [{ title: "Messages — WorkspaceOS" }] }),
  component: LiveMessagingBoard,
});
