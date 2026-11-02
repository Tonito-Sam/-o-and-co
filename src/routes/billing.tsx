import { createFileRoute } from "@tanstack/react-router";
import { LiveFinanceBilling } from "@/components/finance/LiveFinanceBilling";
import { OrganizationBillingView } from "@/components/tenant/OrganizationViews";
import { useRole } from "@/lib/role-context";

export const Route = createFileRoute("/billing")({
  head: () => ({ meta: [{ title: "Billing — WorkspaceOS" }] }),
  component: Billing,
});

function Billing() {
  const { role } = useRole();
  if (role.id === "organization-admin" || role.id === "organization-member") {
    return <OrganizationBillingView />;
  }
  return <LiveFinanceBilling />;
}
