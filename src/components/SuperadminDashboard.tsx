import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Building2, LoaderCircle, Trash2, Users } from "lucide-react";
import { PageHeader, StatCard } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSupabaseClient } from "@/lib/supabase";
import type { RoleDef } from "@/lib/mock";
import { toast } from "sonner";

type GreetingState = { dateLabel: string; greeting: string };
type StaffProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  work_branch_id: string | null;
};
type StaffRole = { user_id: string; role: string; branch_id: string | null };
type StaffMember = StaffProfile & { roleLabels: string[]; branchName: string | null; canDelete: boolean };
type TenantMemberRecord = {
  user_id: string;
  role: string;
  joined_at: string;
  profiles: { full_name: string | null; email: string | null }[] | null;
  organizations: { name: string }[] | null;
  branches: { name: string }[] | null;
};
type TenantMember = {
  id: string;
  full_name: string | null;
  email: string | null;
  organization: string;
  branch: string;
  role: string;
  joined_at: string;
};
type Branch = { id: string; name: string };

const officeCoEmailDomains = ["@officeandco.co.za", "@officeandco.co.ca"];

export function SuperadminDashboard({
  role,
  greetingState,
  firstName,
}: {
  role: RoleDef;
  greetingState: GreetingState;
  firstName: string;
}) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [tenants, setTenants] = useState<TenantMember[]>([]);
  const [selectedStaffIds, setSelectedStaffIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Workspace data is not configured.");
      setLoading(false);
      return;
    }

    const loadDirectory = async () => {
      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user) throw new Error("Could not verify the current account.");
        const currentUserId = userData.user.id;
        const pageSize = 500;
        const domainFilter = officeCoEmailDomains
          .map((domain) => `email.ilike.%${domain}`)
          .join(",");
        const profiles: StaffProfile[] = [];
        for (let offset = 0; ; offset += pageSize) {
          const { data, error: profileError } = await supabase
            .from("profiles")
            .select("id,full_name,email,work_branch_id")
            .or(domainFilter)
            .order("full_name")
            .range(offset, offset + pageSize - 1);
          if (profileError) throw new Error(profileError.message);
          const page = (data ?? []) as StaffProfile[];
          profiles.push(...page);
          if (page.length < pageSize) break;
        }

        const matchingProfiles = profiles.filter(({ email }) => {
          const normalizedEmail = email?.trim().toLowerCase();
          return officeCoEmailDomains.some((domain) => normalizedEmail?.endsWith(domain));
        });
        const roleAssignments: StaffRole[] = [];
        for (let index = 0; index < matchingProfiles.length; index += pageSize) {
          const userIds = matchingProfiles.slice(index, index + pageSize).map(({ id }) => id);
          const { data, error: roleError } = await supabase
            .from("user_roles")
            .select("user_id,role,branch_id")
            .in("user_id", userIds);
          if (roleError) throw new Error(roleError.message);
          roleAssignments.push(...((data ?? []) as StaffRole[]));
        }

        const { data: branchData, error: branchError } = await supabase
          .from("branches")
          .select("id,name");
        if (branchError) throw new Error(branchError.message);
        const branches = new Map(((branchData ?? []) as Branch[]).map(({ id, name }) => [id, name]));
        const rolesByUser = new Map<string, StaffRole[]>();
        for (const assignment of roleAssignments) {
          const assignments = rolesByUser.get(assignment.user_id) ?? [];
          assignments.push(assignment);
          rolesByUser.set(assignment.user_id, assignments);
        }

        const tenantMembers: TenantMemberRecord[] = [];
        for (let offset = 0; ; offset += pageSize) {
          const { data, error: tenantError } = await supabase
            .from("organization_members")
            .select("user_id,role,joined_at,profiles(full_name,email),organizations(name),branches(name)")
            .eq("status", "active")
            .order("joined_at", { ascending: false })
            .range(offset, offset + pageSize - 1);
          if (tenantError) throw new Error(tenantError.message);
          const page = (data ?? []) as TenantMemberRecord[];
          tenantMembers.push(...page);
          if (page.length < pageSize) break;
        }

        if (!active) return;
        setStaff(matchingProfiles.map((profile) => {
          const assignments = rolesByUser.get(profile.id) ?? [];
          const assignedBranch = assignments.find(({ branch_id }) => branch_id)?.branch_id;
          const branchId = profile.work_branch_id ?? assignedBranch ?? null;
          return {
            ...profile,
            roleLabels: assignments
              .filter(({ role: assignedRole }) => assignedRole !== "member")
              .map(({ role: assignedRole, branch_id }) =>
              `${assignedRole.replaceAll("_", " ")}${branch_id ? ` · ${branches.get(branch_id) ?? "Branch"}` : " · Group-wide"}`,
            ),
            branchName: branchId ? branches.get(branchId) ?? "Assigned branch" : null,
            canDelete: profile.id !== currentUserId && !assignments.some(({ role: assignedRole }) =>
              ["superadmin", "group_ceo"].includes(assignedRole),
            ),
          };
        }));
        setTenants(tenantMembers.map((member) => {
          const profile = member.profiles?.[0];
          return {
            id: member.user_id,
            full_name: profile?.full_name ?? null,
            email: profile?.email ?? null,
            organization: member.organizations?.[0]?.name ?? "Organization",
            branch: member.branches?.[0]?.name ?? "Branch",
            role: member.role,
            joined_at: member.joined_at,
          };
        }));
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load platform users.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void loadDirectory();
    return () => {
      active = false;
    };
  }, []);

  const toggleStaffSelection = (userId: string, checked: boolean | "indeterminate") => {
    setSelectedStaffIds((current) => {
      const next = new Set(current);
      if (checked === true) next.add(userId);
      else next.delete(userId);
      return next;
    });
  };

  const deleteSelectedStaff = async () => {
    const supabase = getSupabaseClient();
    if (!supabase || selectedStaffIds.size === 0) return;
    setDeleting(true);
    let deletedCount = 0;
    let failure = "";
    const selectedIds = [...selectedStaffIds];

    for (const userId of selectedIds) {
      const { data, error: deleteError } = await supabase.functions.invoke("delete-office-staff", {
        body: { user_id: userId },
      });
      if (deleteError || data?.error) {
        failure = data?.error ?? deleteError?.message ?? "Could not delete the selected account.";
        break;
      }
      deletedCount += 1;
    }

    if (deletedCount > 0) {
      const deletedIds = new Set(selectedIds.slice(0, deletedCount));
      setStaff((current) => current.filter(({ id }) => !deletedIds.has(id)));
      setSelectedStaffIds(new Set(selectedIds.slice(deletedCount)));
      toast.success(`${deletedCount} staff account${deletedCount === 1 ? "" : "s"} deleted.`);
    }
    if (failure) toast.error(failure);
    setDeleting(false);
    setDeleteDialogOpen(false);
  };

  const selectedStaff = staff.filter(({ id }) => selectedStaffIds.has(id));

  return (
    <div className="mx-auto max-w-350 space-y-6">
      <PageHeader
        eyebrow={`${role.title} · ${greetingState.dateLabel}`}
        title={`${greetingState.greeting}, ${firstName}.`}
        description="Manage Office & Co staff access and tenant accounts across WorkspaceOS."
      />
      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Could not load platform users: {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Staff accounts" value={loading ? "—" : String(staff.length)} hint="Office & Co email domains" accent="brand" />
        <StatCard label="Tenant members" value={loading ? "—" : String(tenants.length)} hint="Active organization memberships" accent="success" />
        <StatCard label="Managed users" value={loading ? "—" : String(staff.length + tenants.length)} hint="Staff and active tenant members" />
      </div>

      <Tabs defaultValue="staffs" className="space-y-4">
        <TabsList aria-label="Superadmin user directories">
          <TabsTrigger value="staffs" className="gap-1.5"><Users className="size-3.5" />Staffs</TabsTrigger>
          <TabsTrigger value="tenants" className="gap-1.5"><Building2 className="size-3.5" />Tenants</TabsTrigger>
        </TabsList>
        <TabsContent value="staffs" className="mt-0">
          <section className="overflow-hidden rounded-lg border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
              <div>
                <h2 className="font-display text-base font-semibold">Office &amp; Co staff</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {loading ? "Loading staff accounts…" : `${staff.length} staff accounts`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedStaffIds.size > 0 && (
                  <Button size="sm" variant="destructive" onClick={() => setDeleteDialogOpen(true)} disabled={deleting}>
                    <Trash2 className="size-4" />Delete selected ({selectedStaffIds.size})
                  </Button>
                )}
                <Button asChild size="sm" variant="outline"><Link to="/settings/roles">Role settings</Link></Button>
              </div>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading staff accounts…</div>
            ) : error ? (
              <p className="p-4 text-sm text-muted-foreground">Staff list unavailable.</p>
            ) : staff.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No Office &amp; Co staff accounts found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
                    <tr>
                      <th className="w-10 px-4 py-3 font-medium"><span className="sr-only">Select</span></th>
                      <th className="px-4 py-3 font-medium">Staff member</th>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Platform roles</th>
                      <th className="px-4 py-3 font-medium">Branch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {staff.map((member) => (
                      <tr key={member.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <Checkbox
                            checked={selectedStaffIds.has(member.id)}
                            onCheckedChange={(checked) => toggleStaffSelection(member.id, checked)}
                            disabled={!member.canDelete || deleting}
                            aria-label={`Select ${member.email ?? member.full_name ?? "staff account"} for deletion`}
                          />
                        </td>
                        <td className="px-4 py-3 font-medium">{member.full_name || "Unnamed staff member"}</td>
                        <td className="px-4 py-3">{member.email}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {member.roleLabels.length > 0
                              ? member.roleLabels.map((label) => <Badge key={label} variant="outline" className="capitalize">{label}</Badge>)
                              : <span className="text-muted-foreground">No platform role</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3">{member.branchName ?? "Group-wide / unassigned"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </TabsContent>
        <TabsContent value="tenants" className="mt-0">
          <section className="overflow-hidden rounded-lg border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
              <div>
                <h2 className="font-display text-base font-semibold">Tenant members</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {loading ? "Loading tenant members…" : `${tenants.length} active memberships`}
                </p>
              </div>
              <Button asChild size="sm" variant="outline"><Link to="/tenants">Tenant records</Link></Button>
            </div>
            {loading ? (
              <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading tenant members…</div>
            ) : error ? (
              <p className="p-4 text-sm text-muted-foreground">Tenant list unavailable.</p>
            ) : tenants.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">No active tenant memberships found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[780px] text-left text-sm">
                  <thead className="border-b bg-muted/30 text-[11px] uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Tenant member</th>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Organization</th>
                      <th className="px-4 py-3 font-medium">Branch</th>
                      <th className="px-4 py-3 font-medium">Access</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {tenants.map((member) => (
                      <tr key={member.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">{member.full_name || "Unnamed member"}</td>
                        <td className="px-4 py-3">{member.email || "—"}</td>
                        <td className="px-4 py-3">{member.organization}</td>
                        <td className="px-4 py-3">{member.branch}</td>
                        <td className="px-4 py-3"><Badge variant="outline" className="capitalize">{member.role}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </TabsContent>
      </Tabs>
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete selected staff account{selectedStaff.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the selected login account, profile, platform roles, and tenant memberships. This cannot be undone.
              <span className="mt-2 block font-medium text-foreground">
                {selectedStaff.map(({ full_name, email }) => full_name || email).join(", ")}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting || selectedStaff.length === 0}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void deleteSelectedStaff();
              }}
            >
              {deleting ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Delete account{selectedStaff.length === 1 ? "" : "s"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}