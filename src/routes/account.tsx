import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  Check,
  Copy,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  Share2,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRole } from "@/lib/role-context";
import { getSupabaseClient } from "@/lib/supabase";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "Account — Office & Co WorkspaceOS" }] }),
  component: Account,
});

type OrganizationMembership = {
  organization_id: string;
  branch_id: string;
  role: "admin" | "member";
};

type BranchOption = { id: string; name: string };
type OrganizationOption = { id: string; name: string; normalized_name: string };

function Account() {
  const { role, updateFullName } = useRole();
  const isPlatformStaff = [
    "superadmin",
    "group-ceo",
    "sales-manager",
    "rosebank-sales",
    "branch-manager",
    "cafe-manager",
    "community-manager",
    "finance",
  ].includes(role.id);
  const [fullName, setFullName] = useState(role.user);
  const [email, setEmail] = useState("");
  const [workBranchId, setWorkBranchId] = useState("");
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [savedOrganizationId, setSavedOrganizationId] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [teamSize, setTeamSize] = useState("");
  const [savedTeamSize, setSavedTeamSize] = useState("");
  const [membershipRole, setMembershipRole] = useState<"admin" | "member" | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadAccount = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoadError("Authentication is not configured.");
      setLoading(false);
      return;
    }

    const { data: userResult, error: userError } = await supabase.auth.getUser();
    if (userError || !userResult.user) {
      setLoadError(userError?.message || "Sign in to view your account.");
      setLoading(false);
      return;
    }
    setEmail(userResult.user.email ?? "");
    const [profileResult, branchesResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name,work_branch_id")
        .eq("id", userResult.user.id)
        .maybeSingle(),
      supabase.from("branches").select("id,name").eq("status", "live").order("name"),
    ]);
    if (profileResult.error) setLoadError(profileResult.error.message);
    if (branchesResult.error) setLoadError(branchesResult.error.message);
    const profile = profileResult.data;
    setBranches((branchesResult.data ?? []) as BranchOption[]);
    setWorkBranchId(profile?.work_branch_id ?? "");
    if (isPlatformStaff) {
      const { data, error } = await supabase
        .from("organizations")
        .select("id,name,normalized_name")
        .order("name");
      if (error) setLoadError(error.message);
      const availableOrganizations = (data ?? []) as OrganizationOption[];
      setOrganizations(
        ["group-ceo", "superadmin"].includes(role.id)
          ? availableOrganizations
          : availableOrganizations.filter((organization) => organization.normalized_name === "office & co"),
      );
    }
    const savedName = profile?.full_name?.trim() || role.user;
    setFullName(savedName);
    updateFullName(savedName);

    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id,branch_id,role")
      .eq("user_id", userResult.user.id)
      .eq("status", "active")
      .maybeSingle();
    if (membershipError) {
      setLoadError(membershipError.message);
      setLoading(false);
      return;
    }

    if (membership) {
      const member = membership as OrganizationMembership;
      setOrganizationId(member.organization_id);
      setSavedOrganizationId(member.organization_id);
      setMembershipRole(member.role);
      const [organizationResult, branchResult, inviteResult] = await Promise.all([
        supabase
          .from("organizations")
          .select("name,team_size")
          .eq("id", member.organization_id)
          .maybeSingle(),
        supabase.from("branches").select("name").eq("id", member.branch_id).maybeSingle(),
        supabase.rpc("get_organization_invite_code"),
      ]);
      if (organizationResult.error) setLoadError(organizationResult.error.message);
      if (branchResult.error) setLoadError(branchResult.error.message);
      if (inviteResult.error) setLoadError(inviteResult.error.message);
      setOrganizationName(organizationResult.data?.name ?? "");
      const savedTeamSizeValue =
        organizationResult.data?.team_size == null ? "" : String(organizationResult.data.team_size);
      setTeamSize(savedTeamSizeValue);
      setSavedTeamSize(savedTeamSizeValue);
      setBranchName(branchResult.data?.name ?? "");
      setInviteCode(typeof inviteResult.data === "string" ? inviteResult.data : "");
    } else {
      setOrganizationId("");
      setSavedOrganizationId("");
      setOrganizationName("");
      setMembershipRole(null);
    }
    setLoading(false);
  }, [role.id, role.user, updateFullName]);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = fullName.trim().replace(/\s+/g, " ");
    if (normalizedName.length < 2) {
      toast.error("Enter your full name.");
      return;
    }
    if (isPlatformStaff && !workBranchId) {
      toast.error("Choose your work location.");
      return;
    }
    if (isPlatformStaff && !organizations.some((organization) => organization.id === organizationId)) {
      toast.error("Choose an available organization.");
      return;
    }
    const normalizedTeamSize = teamSize.trim();
    const teamSizeValue = Number(normalizedTeamSize);
    if (
      membershipRole === "admin" &&
      normalizedTeamSize !== savedTeamSize &&
      normalizedTeamSize &&
      (!Number.isInteger(teamSizeValue) || teamSizeValue < 1 || teamSizeValue > 100000)
    ) {
      toast.error("Enter a team size between 1 and 100000.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { data: userResult, error: userError } = await supabase.auth.getUser();
    if (userError || !userResult.user) {
      toast.error(userError?.message || "Sign in to update your profile.");
      return;
    }
    setUpdatingProfile(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: normalizedName,
        ...(isPlatformStaff ? { work_branch_id: workBranchId } : {}),
      })
      .eq("id", userResult.user.id);
    if (error) {
      setUpdatingProfile(false);
      toast.error(error.message);
      return;
    }
    setFullName(normalizedName);
    updateFullName(normalizedName);
    if (membershipRole === "admin" && normalizedTeamSize && normalizedTeamSize !== savedTeamSize) {
      const { error: teamSizeError } = await supabase.rpc("update_organization_team_size", {
        p_team_size: teamSizeValue,
      });
      if (teamSizeError) {
        setUpdatingProfile(false);
        toast.error(`Your name was saved, but team size was not: ${teamSizeError.message}`);
        return;
      }
      setTeamSize(String(teamSizeValue));
      setSavedTeamSize(String(teamSizeValue));
    }
    if (isPlatformStaff && organizationId !== savedOrganizationId) {
      const { error: organizationError } = await supabase.rpc("set_staff_organization", {
        p_organization_id: organizationId,
      });
      if (organizationError) {
        setUpdatingProfile(false);
        toast.error(`Your profile was saved, but organization was not: ${organizationError.message}`);
        return;
      }
      await loadAccount();
    }
    setUpdatingProfile(false);
    toast.success("Profile updated.");
  };

  const createInviteCode = async (rotate = false) => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    if (rotate && !window.confirm("The current invite code will stop working. Continue?")) return;
    setWorking(true);
    setLoadError("");
    const { data, error } = await supabase.rpc(
      rotate ? "rotate_organization_invite_code" : "create_organization_invite",
    );
    setWorking(false);
    if (error) {
      setLoadError(error.message);
      toast.error(error.message);
      return;
    }
    setInviteCode(String(data));
    toast.success(rotate ? "Invite code rotated." : "Invite code created.");
  };

  const copyInviteCode = async () => {
    try {
      await navigator.clipboard.writeText(inviteCode);
      toast.success("Organization invite code copied.");
    } catch {
      toast.error("Could not access the clipboard. Select and copy the code instead.");
    }
  };

  const shareInviteCode = async () => {
    const shareText = `Join ${organizationName} on Office & Co WorkspaceOS with invite code: ${inviteCode}`;
    if (!navigator.share) {
      await copyInviteCode();
      return;
    }
    try {
      await navigator.share({ title: `${organizationName} invite`, text: shareText });
    } catch (error) {
      if (error instanceof Error && error.name !== "AbortError") {
        toast.error("Could not open the share dialog.");
      }
    }
  };

  const isOrganizationMember = membershipRole !== null;
  const isOrganizationAdmin = membershipRole === "admin";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="WorkspaceOS · Account"
        title="Your account"
        description="Manage your profile, organization membership, and team access."
      />

      {loadError && (
        <p
          role="alert"
          className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {loadError}
        </p>
      )}

      <Card className="overflow-hidden border-border/80 bg-card/95 shadow-lg shadow-primary/5">
        <form onSubmit={saveProfile}>
          <section className="border-b p-5 md:p-7">
            <h2 className="mb-5 flex items-center gap-2 text-sm font-semibold">
              <UserRound className="size-4 text-muted-foreground" />
              Profile
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="account-full-name">Full name</Label>
                <Input
                  id="account-full-name"
                  autoComplete="name"
                  required
                  maxLength={160}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-email">Work email</Label>
                <Input id="account-email" value={email} readOnly />
              </div>
            </div>
            {isPlatformStaff && (
              <div className="mt-4 max-w-md space-y-2">
                <Label htmlFor="account-work-location">Work location</Label>
                <Select
                  value={workBranchId || "unassigned"}
                  onValueChange={(value) => setWorkBranchId(value === "unassigned" ? "" : value)}
                >
                  <SelectTrigger id="account-work-location">
                    <SelectValue placeholder="Choose your work location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Choose a location</SelectItem>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Sets your default café location. This does not change your role permissions.
                </p>
                <div className="space-y-2 pt-2">
                  <Label htmlFor="account-organization">Organization</Label>
                  <Select
                    value={organizationId || "unassigned"}
                    onValueChange={(value) => setOrganizationId(value === "unassigned" ? "" : value)}
                  >
                    <SelectTrigger id="account-organization">
                      <SelectValue placeholder="Choose an organization" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Choose an organization</SelectItem>
                      {organizations.map((organization) => (
                        <SelectItem key={organization.id} value={organization.id}>
                          {organization.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {["group-ceo", "superadmin"].includes(role.id)
                      ? "Select from registered organizations."
                      : "Your staff organization is Office & Co; tenant organizations are not shown."}
                  </p>
                </div>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">{role.title}</p>
          </section>

          {loading ? (
            <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground md:p-7">
              <LoaderCircle className="size-4 animate-spin" />
              Loading account…
            </div>
          ) : isOrganizationMember ? (
            <section className="border-b p-5 md:p-7">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Building2 className="size-4 text-muted-foreground" />
                Organization
              </h2>
              <dl className="mb-6 grid gap-4 sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted-foreground">Organization</dt>
                  <dd className="mt-1 text-sm font-medium">{organizationName || "Organization"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Membership</dt>
                  <dd className="mt-1 text-sm font-medium">
                    {isOrganizationAdmin ? "Organization Admin" : "Organization Member"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Office & Co branch</dt>
                  <dd className="mt-1 text-sm font-medium">{branchName || "Not available"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Team size</dt>
                  <dd className="mt-1 text-sm font-medium">
                    {teamSize ? `${teamSize} people` : "Not set"}
                  </dd>
                </div>
              </dl>

              {isOrganizationAdmin && (
                <div className="mb-6 max-w-xl border-t pt-5">
                  <div className="space-y-2">
                    <Label htmlFor="organization-team-size">Organization team size</Label>
                    <Input
                      id="organization-team-size"
                      type="number"
                      min={1}
                      max={100000}
                      step={1}
                      inputMode="numeric"
                      value={teamSize}
                      onChange={(event) => setTeamSize(event.target.value)}
                      placeholder="Number of members"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="max-w-xl border-t pt-5">
                <div className="mb-2 flex items-center gap-2">
                  <KeyRound className="size-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Member invite code</h3>
                </div>
                <p className="mb-4 text-sm text-muted-foreground">
                  Share this reusable code with people joining your organization. It expires after
                  one year; an organization admin can rotate it at any time.
                </p>
                {inviteCode ? (
                  <>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={inviteCode}
                        aria-label="Organization invite code"
                        className="font-mono tracking-widest"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void copyInviteCode()}
                        aria-label="Copy invite code"
                        title="Copy invite code"
                      >
                        <Copy className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void shareInviteCode()}
                        aria-label="Share invite code"
                        title="Share invite code"
                      >
                        <Share2 className="size-4" />
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                        <Check className="size-3.5" />
                        Active
                      </span>
                      {isOrganizationAdmin && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void createInviteCode(true)}
                          disabled={working}
                          className="gap-1.5"
                        >
                          <RefreshCw className="size-3.5" />
                          Rotate code
                        </Button>
                      )}
                    </div>
                  </>
                ) : isOrganizationAdmin ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void createInviteCode()}
                    disabled={working}
                    className="gap-2"
                  >
                    {working ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <KeyRound className="size-4" />
                    )}
                    Create member invite code
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No active invite code is available. Ask your organization admin to create one.
                  </p>
                )}
              </div>
            </section>
          ) : (
            <section className="border-b p-5 md:p-7">
              <p className="text-sm text-muted-foreground">
                This account is not associated with an organization.
              </p>
            </section>
          )}

          <div className="flex flex-col gap-3 bg-muted/20 p-5 sm:flex-row sm:items-center sm:justify-between md:px-7">
            <p className="text-xs text-muted-foreground">
              Update your profile and work location.
            </p>
            <Button type="submit" disabled={updatingProfile || loading} className="sm:min-w-40">
              {updatingProfile ? "Updating…" : "Update profile"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
