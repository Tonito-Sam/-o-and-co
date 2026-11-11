import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { COMMUNITY_MODULES, type RoleId } from "@/lib/mock";
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
          ? "Assign platform access to staff and control community-module visibility by role."
          : `${role.branch ?? "Your assigned branches"} · Assign café and community managers.`}
      />

      {canManageCommunity ? (
        <Tabs defaultValue="staff" className="mt-6 space-y-4">
          <TabsList aria-label="Role settings views">
            <TabsTrigger value="staff">Staff assignments</TabsTrigger>
            <TabsTrigger value="community">Community access</TabsTrigger>
          </TabsList>
          <TabsContent value="staff" className="mt-0">
            <StaffRoleAssignments isPlatformAdmin={isPlatformAdmin} />
          </TabsContent>
          <TabsContent value="community" className="mt-0">
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
            <CommunityRoleAccess
              getRoleAccess={getRoleAccess}
              setRoleAccess={setRoleAccess}
            />
            <p className="mt-4 text-[11px] text-muted-foreground">
              These settings layer on top of each role's base navigation. The Group CEO's{" "}
              <strong>Community</strong> master switch in the top bar still overrides these settings.
            </p>
          </TabsContent>
        </Tabs>
      ) : canManageAssignments ? (
        <StaffRoleAssignments isPlatformAdmin={isPlatformAdmin} />
      ) : null}
    </div>
  );
}

type CommunityStaffRole = {
  id: string;
  name: string;
  email: string;
  initials: string;
  roleId: RoleId;
  roleLabel: string;
  scope: string;
};

const communityRoleIds: Record<string, RoleId> = {
  superadmin: "superadmin",
  group_ceo: "group-ceo",
  crm_manager: "crm-manager",
  sales_manager: "sales-manager",
  rosebank_sales: "rosebank-sales",
  branch_manager: "branch-manager",
  community_manager: "community-manager",
  cafe_manager: "cafe-manager",
  finance: "finance",
};

const communityRoleLabels: Record<string, string> = {
  superadmin: "Platform Superadmin",
  group_ceo: "Group CEO",
  crm_manager: "CRM Manager",
  sales_manager: "Sales Manager",
  rosebank_sales: "Branch Sales",
  branch_manager: "Branch Manager",
  community_manager: "Community Manager",
  cafe_manager: "Café Manager",
  finance: "Finance",
};

function CommunityRoleAccess({
  getRoleAccess,
  setRoleAccess,
}: {
  getRoleAccess: (roleId: RoleId, key: (typeof COMMUNITY_MODULES)[number]["key"]) => boolean;
  setRoleAccess: (
    roleId: RoleId,
    key: (typeof COMMUNITY_MODULES)[number]["key"],
    value: boolean,
  ) => void;
}) {
  const [staffRoles, setStaffRoles] = useState<CommunityStaffRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const loadStaffRoles = async () => {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError("Workspace data is not configured.");
        setLoading(false);
        return;
      }

      const [profileResult, roleResult, branchResult] = await Promise.all([
        supabase.from("profiles").select("id,full_name,email").order("full_name"),
        supabase.from("user_roles").select("user_id,role,branch_id"),
        supabase.from("branches").select("id,name"),
      ]);
      const queryError = profileResult.error ?? roleResult.error ?? branchResult.error;
      if (queryError) {
        if (active) setError(queryError.message);
        setLoading(false);
        return;
      }

      const staffProfiles = (profileResult.data ?? []).filter(({ email }) =>
        isOfficeCoEmail(email),
      );
      const profilesById = new Map(staffProfiles.map((profile) => [profile.id, profile]));
      const branchesById = new Map(
        (branchResult.data ?? []).map((branch) => [branch.id, branch.name]),
      );
      const groupedAssignments = new Map<
        string,
        {
          userId: string;
          roleId: RoleId;
          branches: Set<string>;
        }
      >();

      for (const assignment of roleResult.data ?? []) {
        const roleId = communityRoleIds[assignment.role];
        if (!roleId || !profilesById.has(assignment.user_id)) continue;
        const key = `${assignment.user_id}:${assignment.role}`;
        const grouped = groupedAssignments.get(key) ?? {
          userId: assignment.user_id,
          roleId,
          branches: new Set<string>(),
        };
        grouped.branches.add(
          assignment.branch_id
            ? (branchesById.get(assignment.branch_id) ?? "Assigned branch")
            : "All branches",
        );
        groupedAssignments.set(key, grouped);
      }

      const rows = [...groupedAssignments.entries()]
        .flatMap(([key, assignment]) => {
          const profile = profilesById.get(assignment.userId);
          if (!profile?.email) return [];
          const name = profile.full_name?.trim() || profile.email;
          const initials = name
            .split(/\s+/)
            .slice(0, 2)
            .map((part: string) => part[0])
            .join("")
            .toUpperCase();
          const databaseRole = key.slice(key.indexOf(":") + 1);
          return [
            {
              id: key,
              name,
              email: profile.email,
              initials: initials || "OC",
              roleId: assignment.roleId,
              roleLabel: communityRoleLabels[databaseRole] ?? databaseRole.replaceAll("_", " "),
              scope: [...assignment.branches].sort().join(" · "),
            },
          ];
        })
        .sort((left, right) => left.name.localeCompare(right.name));

      if (active) setStaffRoles(rows);
      setLoading(false);
    };

    void loadStaffRoles();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section>
      <div className="mb-3">
        <h2 className="font-display text-lg font-semibold">Community module access</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Switches apply to everyone with that staff role, not just the person shown.
        </p>
      </div>
      <div className="card-soft overflow-hidden">
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            Loading staff access…
          </div>
        ) : error ? (
          <p role="alert" className="p-4 text-sm text-destructive">
            Could not load staff access: {error}
          </p>
        ) : staffRoles.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No Office &amp; Co staff role assignments found.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase text-muted-foreground">
                    Staff member
                  </th>
                  {COMMUNITY_MODULES.map((module) => (
                    <th
                      key={module.key}
                      className="px-3 py-3 text-center text-[11px] font-medium uppercase text-muted-foreground"
                    >
                      {module.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staffRoles.map((staffRole) => (
                  <tr key={staffRole.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-medium text-brand">
                          {staffRole.initials}
                        </div>
                        <div className="min-w-0 leading-tight">
                          <div className="truncate text-sm font-medium">{staffRole.name}</div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {staffRole.roleLabel} · {staffRole.scope}
                          </div>
                        </div>
                      </div>
                    </td>
                    {COMMUNITY_MODULES.map((module) => (
                      <td key={module.key} className="px-3 py-3 text-center">
                        <Switch
                          checked={getRoleAccess(staffRole.roleId, module.key)}
                          onCheckedChange={(value) =>
                            setRoleAccess(staffRole.roleId, module.key, value)
                          }
                          aria-label={`${staffRole.name} · ${staffRole.roleLabel} · ${module.label}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

type StaffProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  work_branch_id: string | null;
};
type StaffBranch = { id: string; name: string };
type StaffAssignment = { id: string; user_id: string; role: string; branch_id: string | null };

const isOfficeCoEmail = (email: string | null) => {
  const normalizedEmail = email?.trim().toLowerCase();
  return ["@officeandco.co.za", "@officeandco.co.ca"].some((domain) => normalizedEmail?.endsWith(domain));
};

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
  const availableProfiles = profiles.filter((profile) =>
    isOfficeCoEmail(profile.email)
    && (isPlatformAdmin
      || (profile.work_branch_id && visibleBranches.some((branch) => branch.id === profile.work_branch_id))
      || assignments.some((assignment) => assignment.user_id === profile.id && assignment.branch_id && visibleBranches.some((branch) => branch.id === assignment.branch_id))),
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
    assignableRoles.some((item) => item.value === assignment.role)
    && (isPlatformAdmin || (assignment.branch_id && visibleBranches.some((branch) => branch.id === assignment.branch_id))),
  );

  return (
    <section className="mb-6 overflow-hidden rounded-lg border bg-card">
      <div className="border-b p-4">
        <h2 className="font-display text-base font-semibold">Office &amp; Co staff assignments</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Assign roles to Office &amp; Co accounts. Group roles cover all branches; branch roles apply only at the selected location.
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
