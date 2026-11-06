import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { SalesAnalyticsDashboard } from "@/components/SalesAnalyticsDashboard";
import { FinancialAnalyticsDashboard } from "@/components/finance/FinancialAnalyticsDashboard";
import { useRole } from "@/lib/role-context";

export const Route = createFileRoute("/analytics")({
  head: () => ({ meta: [{ title: "Analytics — WorkspaceOS" }] }),
  component: Analytics,
});

function Analytics() {
  const { role } = useRole();
  if (["superadmin", "group-admin", "group-ceo", "finance", "branch-manager"].includes(role.id)) {
    return <FinancialAnalyticsDashboard role={role} />;
  }
  if (["crm-manager", "sales-manager", "rosebank-sales"].includes(role.id)) {
    return <SalesAnalyticsDashboard />;
  }

  return (
    <div className="mx-auto max-w-350">
      <PageHeader
        eyebrow="Analytics"
        title="Live analytics unavailable"
        description="There is no verified live analytics source configured for this role yet. No sample or estimated figures are shown."
      />
      <p className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
        Contact your WorkspaceOS administrator to confirm the reporting source and access scope for this role.
      </p>
    </div>
  );
}
