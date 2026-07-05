import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { COMMUNITY_MODULES, ROLES } from "@/lib/mock";
import { useRole } from "@/lib/role-context";
import { ShieldAlert } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/roles")({
  head: () => ({ meta: [{ title: "Role Settings — WorkspaceOS" }] }),
  component: RoleSettings,
});

function RoleSettings() {
  const { role, getRoleAccess, setRoleAccess, showCommunity } = useRole();
  const canManage = role.id === "group-ceo";

  if (!canManage) {
    return (
      <div className="mx-auto max-w-xl card-soft p-8 text-center">
        <ShieldAlert className="size-8 text-warning mx-auto mb-3" />
        <h2 className="font-display text-xl font-semibold">Restricted</h2>
        <p className="text-sm text-muted-foreground mt-2">Role module access is managed by the Group CEO. Switch your view in the top bar to manage.</p>
        <Button asChild className="mt-5"><Link to="/">Back to overview</Link></Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-325">
      <PageHeader
        eyebrow="Platform · Administration"
        title="Role-based community access"
        description="Decide which community modules each role can see. Toggles are stored locally and apply instantly to the sidebar and dashboards."
      />

      {!showCommunity && (
        <div className="mb-4 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs flex items-start gap-2">
          <ShieldAlert className="size-4 text-warning shrink-0 mt-px" />
          <div>
            <div className="font-medium text-warning">Master community switch is OFF for the Group CEO.</div>
            <div className="text-foreground/80">Community modules are currently hidden for your view regardless of per-role settings. Re-enable in the top bar.</div>
          </div>
        </div>
      )}

      <div className="card-soft overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/30 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">Role</th>
              {COMMUNITY_MODULES.map(m => (
                <th key={m.key} className="text-center px-3 py-3 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLES.map(r => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="grid size-8 place-items-center rounded-full bg-brand-soft text-brand text-xs font-medium">{r.initials}</div>
                    <div className="leading-tight">
                      <div className="text-sm font-medium">{r.user}</div>
                      <div className="text-[11px] text-muted-foreground">{r.title}</div>
                    </div>
                    {r.id === "group-ceo" && <Badge variant="outline" className="text-[10px] ml-2">Admin</Badge>}
                  </div>
                </td>
                {COMMUNITY_MODULES.map(m => (
                  <td key={m.key} className="text-center px-3 py-3">
                    <Switch
                      checked={getRoleAccess(r.id, m.key)}
                      onCheckedChange={(v) => setRoleAccess(r.id, m.key, v)}
                      aria-label={`${r.user} · ${m.label}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-[11px] text-muted-foreground">
        Note: These settings layer on top of the role's base navigation. The Group CEO's <strong>Community</strong> master switch in the top bar still overrides everything for the CEO view.
      </div>
    </div>
  );
}
