import { createFileRoute } from "@tanstack/react-router";
import { SuperadminDashboard } from "@/components/SuperadminDashboard";
import { useRole } from "@/lib/role-context";

export const Route = createFileRoute("/tenant-access")({
  head: () => ({ meta: [{ title: "Tenant Accounts — WorkspaceOS" }] }),
  component: TenantAccounts,
});

function TenantAccounts() {
  const { role } = useRole();
  return (
    <SuperadminDashboard
      role={role}
      greetingState={{ dateLabel: "User management", greeting: "" }}
      firstName=""
      view="tenants"
    />
  );
}
