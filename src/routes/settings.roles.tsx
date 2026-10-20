import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COMMUNITY_MODULES, ROLES } from "@/lib/mock";
import { useRole } from "@/lib/role-context";
import { getSupabaseClient } from "@/lib/supabase";
import { toast } from "sonner";
import { LoaderCircle, ShieldAlert, Trash2, UserPlus } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/settings/roles")({
  head: () => ({ meta: [{ title: "Role Settings — WorkspaceOS" }] }),
  component: RoleSettings,
});

function RoleSettings() {
  const { role, getRoleAccess, setRoleAccess, showCommunity } = useRole();
  const isPlatformAdmin = ["superadmin", "group-admin", "group-ceo"].includes(role.id);
  const canManageAssignments = isPlatformAdmin || role.id === "branch-manager";
  const canManageCommunity = isPlatformAdmin;

  if (!canManageAssignments && !canManageCommunity) {
    const isOrganizationMember =
      role.id === "organization-admin" || role.id === "organization-member";
    return (
      <div className="mx-auto max-w-xl card-soft p-8 text-center">
        <ShieldAlert className="size-8 text-warning mx-auto mb-3" />
        <h2 className="font-display text-xl font-semibold">
          {isOrganizationMember ? "Organization account settings" : "Restricted"}
        </h2>
        <p className="text-sm text-muted-foreground mt-2">
          {isOrganizationMember
            ? "Your profile, organization details, and member invite code are available in Account."
            : "Platform role access is managed by an Office & Co administrator."}
        </p>
        <Button asChild className="mt-5">
          <Link to={isOrganizationMember ? "/account" : "/"}>
            {isOrganizationMember ? "Open account settings" : "Back to overview"}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-325">
      <PageHeader
        eyebrow="Platform · Administration"
        title={canManageCommunity ? "Staff and role settings" : "Branch team roles"}
        description={canManageCommunity
          ? "Assign Office & Co roles and configure community-module visibility."
          : `${role.branch ?? "Your assigned branches"} · Assign café and community managers.`}
      />

      {canManageAssignments && <StaffRoleAssignments isPlatformAdmin={isPlatformAdmin} />}

      {canManageCommunity && !showCommunity && (
        <div className="mb-4 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs flex items-start gap-2">
          <ShieldAlert className="size-4 text-warning shrink-0 mt-px" />
          <div>
            <div className="font-medium text-warning">
              Master community switch is OFF for the Group CEO.
            </div>
            <div className="text-foreground/80">
              Community modules are currently hidden for your view regardless of per-role settings.
              Re-enable in the top bar.
            </div>
          </div>
        </div>
      )}

      {canManageCommunity && <div className="card-soft overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/30 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                Role
              </th>
              {COMMUNITY_MODULES.map((m) => (
                <th
                  key={m.key}
                  className="text-center px-3 py-3 text-[11px] uppercase tracking-wider font-medium text-muted-foreground"
                >
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLES.map((r) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="grid size-8 place-items-center rounded-full bg-brand-soft text-brand text-xs font-medium">
                      {r.initials}
                    </div>
                    <div className="leading-tight">
                      <div className="text-sm font-medium">{r.user}</div>
                      <div className="text-[11px] text-muted-foreground">{r.title}</div>
                    </div>
                    {r.id === "group-ceo" && (
                      <Badge variant="outline" className="text-[10px] ml-2">
                        Admin
                      </Badge>
                    )}
                  </div>
                </td>
                {COMMUNITY_MODULES.map((m) => (
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
      </div>}

      {canManageCommunity && <div className="mt-4 text-[11px] text-muted-foreground">
        Note: These settings layer on top of the role's base navigation. The Group CEO's{" "}
        <strong>Community</strong> master switch in the top bar still overrides everything for the
        CEO view.
      </div>}
    </div>
  );
}

type StaffProfile = { id: string; full_name: string | null; email: string | null; work_branch_id: string | null };
type StaffBranch = { id: string; name: string };
type StaffAssignment = { id: string; user_id: string; role: string; branch_id: string | null };

const assignableRoles = [
  { value: "branch_manager", label: "Branch manager", scope: "branch" },
  { value: "cafe_manager", label: "Café manager", scope: "branch" },
  { value: "community_manager", label: "Community manager", scope: "branch" },
  { value: "rosebank_sales", label: "Branch sales", scope: "branch" },
  { value: "crm_manager", label: "CRM manager", scope: "global" },
  { value: "sales_manager", label: "Sales manager", scope: "global" },
  { value: "finance", label: "Finance", scope: "global" },
];

function StaffRoleAssignments({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  const { role } = useRole();
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [branches, setBranches] = useState<StaffBranch[]>([]);
  const [assignments, setAssignments] = useState<StaffAssignment[]>([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedRole, setSelectedRole] = useState(isPlatformAdmin ? "branch_manager" : "cafe_manager");
  const [selectedBranch, setSelectedBranch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const managerRoles = assignableRoles.filter((item) =>
    isPlatformAdmin || ["cafe_manager", "community_manager"].includes(item.value),
  );
  const branchManagerBranchIds = role.branchIds ?? [];

  const loadAssignments = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    const [profileResult, branchResult, roleResult] = await Promise.all([
      supabase.from("profiles").select("id,full_name,email,work_branch_id").order("full_name"),
      supabase.from("branches").select("id,name").eq("status", "live").order("name"),
      supabase.from("user_roles").select("id,user_id,role,branch_id").order("role"),
    ]);
    const error = profileResult.error ?? branchResult.error ?? roleResult.error;
    if (error) toast.error(error.message);
    else {
      setProfiles((profileResult.data ?? []) as StaffProfile[]);
      setBranches((branchResult.data ?? []) as StaffBranch[]);
      setAssignments((roleResult.data ?? []) as StaffAssignment[]);
      if (!selectedBranch) {
        const available = (branchResult.data ?? []) as StaffBranch[];
        setSelectedBranch(
          isPlatformAdmin
            ? available[0]?.id ?? ""
            : available.find((branch) => role.branchIds?.includes(branch.id))?.id ?? "",
        );
      }
    }
    setLoading(false);
  }, [isPlatformAdmin, role.branchIds, selectedBranch]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  const visibleBranches = isPlatformAdmin
    ? branches
    : branches.filter((branch) => branchManagerBranchIds.includes(branch.id));
  const availableProfiles = isPlatformAdmin
    ? profiles
    : profiles.filter((profile) =>
        (profile.work_branch_id && visibleBranches.some((branch) => branch.id === profile.work_branch_id))
        || assignments.some((assignment) => assignment.user_id === profile.id && assignment.branch_id && visibleBranches.some((branch) => branch.id === assignment.branch_id)),
      );

  const saveAssignment = async (userId: string, assignmentRole: string, branchId: string | null, assign: boolean) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSaving(true);
    const { error } = await supabase.rpc("assign_staff_role", {
      p_user_id: userId,
      p_role: assignmentRole,
      p_branch_id: branchId,
      p_assign: assign,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(assign ? "Staff role assigned." : "Staff role removed.");
    await loadAssignments();
  };

  const selectedRoleDefinition = managerRoles.find((item) => item.value === selectedRole);
  const visibleAssignments = assignments.filter((assignment) =>
    isPlatformAdmin || (assignment.branch_id && visibleBranches.some((branch) => branch.id === assignment.branch_id)),
  );

  return (
    <section className="mb-6 overflow-hidden rounded-lg border bg-card">
      <div className="border-b p-4">
        <h2 className="font-display text-base font-semibold">Staff assignments</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Group roles cover all branches; branch roles apply only at the selected location.
        </p>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-[minmax(12rem,1.3fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_auto] sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="staff-user">Staff account</Label>
          <Select value={selectedUser} onValueChange={setSelectedUser}>
            <SelectTrigger id="staff-user"><SelectValue placeholder="Choose staff" /></SelectTrigger>
            <SelectContent>
              {availableProfiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>
                  {profile.full_name || profile.email || profile.id}{profile.full_name && profile.email ? ` · ${profile.email}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-role">Role</Label>
          <Select value={selectedRole} onValueChange={(value) => {
            setSelectedRole(value);
            const nextRole = managerRoles.find((item) => item.value === value);
            setSelectedBranch(nextRole?.scope === "global"
              ? ""
              : visibleBranches[0]?.id ?? "");
          }}>
            <SelectTrigger id="staff-role"><SelectValue /></SelectTrigger>
            <SelectContent>
              {managerRoles.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-branch">Branch</Label>
          <Select value={selectedBranch || "unassigned"} onValueChange={(value) => setSelectedBranch(value === "unassigned" ? "" : value)}>
            <SelectTrigger id="staff-branch"><SelectValue placeholder="Group-wide" /></SelectTrigger>
            <SelectContent>
              {selectedRoleDefinition?.scope === "global" && <SelectItem value="unassigned">Group-wide</SelectItem>}
              {visibleBranches.map((branch) => <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={() => void saveAssignment(selectedUser, selectedRole, selectedRoleDefinition?.scope === "branch" ? selectedBranch : null, true)}
          disabled={loading || saving || !selectedUser || !selectedRoleDefinition || (selectedRoleDefinition.scope === "branch" && !selectedBranch)}
        >
          {saving ? <LoaderCircle className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
          Assign
        </Button>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 border-t p-4 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading staff roles…</div>
      ) : visibleAssignments.length === 0 ? (
        <p className="border-t p-4 text-sm text-muted-foreground">No staff roles assigned yet.</p>
      ) : (
        <div className="divide-y border-t">
          {visibleAssignments.map((assignment) => {
            const profile = profiles.find((item) => item.id === assignment.user_id);
            const branch = branches.find((item) => item.id === assignment.branch_id);
            const label = assignableRoles.find((item) => item.value === assignment.role)?.label ?? assignment.role.replaceAll("_", " ");
            return (
              <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{profile?.full_name || profile?.email || assignment.user_id}</p>
                  <p className="text-xs capitalize text-muted-foreground">{label} · {branch?.name ?? "All branches"}</p>
                </div>
                {(isPlatformAdmin || (branch && visibleBranches.some((item) => item.id === branch.id) && ["cafe_manager", "community_manager"].includes(assignment.role))) && (
                  <Button variant="ghost" size="icon" aria-label={`Remove ${label}`} onClick={() => void saveAssignment(assignment.user_id, assignment.role, assignment.branch_id, false)} disabled={saving}>
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
