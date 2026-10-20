import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, LoaderCircle, MapPin, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabase";
import { useRole } from "@/lib/role-context";

export const Route = createFileRoute("/organization")({
  head: () => ({ meta: [{ title: "Organization — Office & Co WorkspaceOS" }] }),
  component: OrganizationPage,
});

type MemberRow = {
  user_id: string;
  role: "admin" | "member";
  status: "active" | "suspended";
  joined_at: string;
};
type ProfileRow = { id: string; full_name: string | null; email: string | null };

function OrganizationPage() {
  const { role } = useRole();
  const [organizationName, setOrganizationName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [teamSize, setTeamSize] = useState<number | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [activeMemberCount, setActiveMemberCount] = useState(0);
  const [profiles, setProfiles] = useState<Map<string, ProfileRow>>(new Map());
  const [currentUserId, setCurrentUserId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Authentication is not configured.");
      setLoading(false);
      return;
    }

    let active = true;
    const loadOrganization = async () => {
      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (userError || !userResult.user) {
        if (active) {
          setError(userError?.message || "Sign in to view your organization.");
          setLoading(false);
        }
        return;
      }
      if (active) setCurrentUserId(userResult.user.id);

      const { data: membership, error: membershipError } = await supabase
        .from("organization_members")
        .select("organization_id,branch_id,role")
        .eq("user_id", userResult.user.id)
        .eq("status", "active")
        .maybeSingle();
      if (membershipError || !membership) {
        if (active) {
          setError(
            membershipError?.message || "Your account is not associated with an organization.",
          );
          setLoading(false);
        }
        return;
      }

      const admin = membership.role === "admin";
      const [organizationResult, branchResult, membersResult] = await Promise.all([
        supabase
          .from("organizations")
          .select("name,team_size")
          .eq("id", membership.organization_id)
          .maybeSingle(),
        supabase.from("branches").select("name").eq("id", membership.branch_id).maybeSingle(),
        supabase
          .from("organization_members")
          .select("user_id,role,status,joined_at")
          .eq("organization_id", membership.organization_id)
          .eq("status", "active")
          .order("joined_at", { ascending: true }),
      ]);

      const activeMembers = (membersResult.data ?? []) as MemberRow[];
      const visibleMembers = admin
        ? activeMembers
        : activeMembers.filter((member) => member.user_id === userResult.user.id);
      const profileResult = visibleMembers.length
        ? await supabase
            .from("profiles")
            .select("id,full_name,email")
            .in(
              "id",
              visibleMembers.map((member) => member.user_id),
            )
        : { data: [], error: null };

      if (!active) return;
      if (organizationResult.error) setError(organizationResult.error.message);
      if (branchResult.error) setError(branchResult.error.message);
      if (membersResult.error) setError(membersResult.error.message);
      if (profileResult.error) setError(profileResult.error.message);
      setOrganizationName(organizationResult.data?.name ?? "Organization");
      setTeamSize(organizationResult.data?.team_size ?? null);
      setBranchName(branchResult.data?.name ?? "Branch");
      setIsAdmin(admin);
      setActiveMemberCount(activeMembers.length);
      setMembers(visibleMembers);
      setProfiles(
        new Map(
          ((profileResult.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]),
        ),
      );
      setLoading(false);
    };

    void loadOrganization().catch((cause: unknown) => {
      if (!active) return;
      const message = cause instanceof Error ? cause.message : "Could not load your organization.";
      setError(message);
      toast.error(message);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={`${organizationName || "WorkspaceOS"} · Organization`}
        title="Organization"
        description="Your team, membership, and Office & Co location in one place."
        actions={
          <Button asChild variant="outline">
            <Link to="/account">Account & invites</Link>
          </Button>
        }
      />

      {error && (
        <p
          role="alert"
          className="mb-5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Loading organization…
        </div>
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <Card className="p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Building2 className="size-4 text-brand" />
                Organization
              </div>
              <div className="font-display text-lg font-semibold">{organizationName}</div>
              <div className="mt-1 text-sm text-muted-foreground">{role.title}</div>
            </Card>
            <Card className="p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <MapPin className="size-4 text-brand" />
                Office & Co branch
              </div>
              <div className="font-display text-lg font-semibold">{branchName}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Selected during organization setup
              </div>
            </Card>
            <Card className="p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Users className="size-4 text-brand" />
                Active members
              </div>
              <div className="font-display text-lg font-semibold">{activeMemberCount}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {teamSize ? `Team size: ${teamSize}` : "Set team size in Account"}
              </div>
            </Card>
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold">Organization members</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  People with access to this organization workspace.
                </p>
              </div>
              {isAdmin && (
                <Badge variant="outline" className="gap-1">
                  <ShieldCheck className="size-3.5" />
                  Admin view
                </Badge>
              )}
            </div>
            <Card className="overflow-hidden shadow-sm">
              {members.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">No active members yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[540px] text-left text-sm">
                    <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Member</th>
                        <th className="px-4 py-3 font-medium">Role</th>
                        <th className="px-4 py-3 font-medium">Joined</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((member) => {
                        const profile = profiles.get(member.user_id);
                        return (
                          <tr key={member.user_id} className="border-b last:border-0">
                            <td className="px-4 py-3">
                              <div className="font-medium">
                                {profile?.full_name ||
                                  (member.user_id === currentUserId
                                    ? role.user
                                    : "Organization member")}
                              </div>
                              {isAdmin && profile?.email && (
                                <div className="mt-0.5 text-xs text-muted-foreground">
                                  {profile.email}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {member.role === "admin" ? "Organization Admin" : "Member"}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
                                new Date(member.joined_at),
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant="secondary">Active</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {isAdmin && (
                <div className="border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                  Share your reusable member invite code from Account to add teammates.
                </div>
              )}
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
