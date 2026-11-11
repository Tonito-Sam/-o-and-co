import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { SuperadminDashboard } from "@/components/SuperadminDashboard";
import { useRole } from "@/lib/role-context";

export const Route = createFileRoute("/audit")({
  head: () => ({ meta: [{ title: "Audit Log — WorkspaceOS" }] }),
  component: AuditLog,
});

function AuditLog() {
  const { role } = useRole();
  if (role.id !== "superadmin") {
    return (
      <div className="mx-auto max-w-xl rounded-lg border bg-card p-8 text-center">
        <h1 className="font-display text-lg font-semibold">Restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">The platform audit log is available to superadmins.</p>
        <Button asChild className="mt-5">
          <Link to="/">Back to overview</Link>
        </Button>
      </div>
    );
  }

  return (
    <SuperadminDashboard
      role={role}
      greetingState={{ dateLabel: "Platform administration", greeting: "" }}
      firstName=""
      view="audit"
    />
  );
}