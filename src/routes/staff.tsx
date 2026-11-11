import { createFileRoute } from "@tanstack/react-router";
import { SuperadminDashboard } from "@/components/SuperadminDashboard";
import { useRole } from "@/lib/role-context";

export const Route = createFileRoute("/staff")({
  head: () => ({ meta: [{ title: "Staff Directory — WorkspaceOS" }] }),
  component: StaffDirectory,
});

function StaffDirectory() {
  const { role } = useRole();
  return (
    <SuperadminDashboard
      role={role}
      greetingState={{ dateLabel: "User management", greeting: "" }}
      firstName=""
      view="staff"
    />
  );
}
