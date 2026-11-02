import { createFileRoute } from "@tanstack/react-router";
import { OperationsBookingsDashboard } from "@/components/OperationsBookingsDashboard";
import { OrganizationBookingsView } from "@/components/tenant/OrganizationViews";
import { useRole } from "@/lib/role-context";

export const Route = createFileRoute("/bookings")({
  head: () => ({ meta: [{ title: "Bookings — WorkspaceOS" }] }),
  component: Bookings,
});

function Bookings() {
  const { role } = useRole();
  if (role.id === "organization-admin" || role.id === "organization-member") {
    return <OrganizationBookingsView />;
  }
  return <OperationsBookingsDashboard role={role} />;
}
