import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Check, Copy, KeyRound, LoaderCircle, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseClient } from "@/lib/supabase";

export const Route = createFileRoute("/onboarding")({
  head: () => ({ meta: [{ title: "Organization setup — Office & Co WorkspaceOS" }] }),
  component: OrganizationOnboarding,
});

type Branch = { id: string; name: string; city: string | null; region: string | null };
type Mode = "create" | "join";

function OrganizationOnboarding() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("create");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchLoading, setBranchLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [organizationReady, setOrganizationReady] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [form, setForm] = useState({ name: "", website: "", industry: "", branchId: "", code: "" });

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setBranchLoading(false);
      return;
    }
    let active = true;
    void supabase
      .from("branches")
      .select("id,name,city,region")
      .eq("status", "live")
      .order("name")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) toast.error(`Could not load Office & Co branches: ${error.message}`);
        const availableBranches = (data ?? []) as Branch[];
        setBranches(availableBranches);
        setForm((current) => ({
          ...current,
          branchId: current.branchId || availableBranches[0]?.id || "",
        }));
        setBranchLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const createInvite = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    setSubmitting(true);
    setInviteError("");
    const { data, error } = await supabase.rpc("create_organization_invite");
    setSubmitting(false);
    if (error) {
      setInviteError(error.message);
      toast.error(
        `Organization was created, but an invite code could not be generated: ${error.message}`,
      );
      return;
    }
    setInviteCode(String(data));
  };

  const createOrganization = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Authentication is not configured. Contact your administrator.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("create_organization_for_current_user", {
      p_name: form.name.trim(),
      p_website: form.website.trim() || null,
      p_industry: form.industry.trim() || null,
      p_branch_id: form.branchId,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setOrganizationReady(true);
    toast.success("Organization profile created. You are its organization admin.");
    await createInvite();
  };

  const joinOrganization = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Authentication is not configured. Contact your administrator.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("accept_organization_invite", {
      p_code: form.code.trim(),
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("You have joined the organization.");
    await navigate({ to: "/" });
  };

  const copyInviteCode = async () => {
    await navigator.clipboard.writeText(inviteCode);
    toast.success("Invite code copied.");
  };

  if (organizationReady) {
    return (
      <main className="min-h-screen bg-background px-4 py-10 md:py-16">
        <section className="mx-auto max-w-xl">
          <div className="mb-8 flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Building2 className="size-5" />
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">
                WorkspaceOS setup
              </p>
              <h1 className="font-display text-xl font-semibold">Organization ready</h1>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-full bg-emerald-100 text-emerald-800">
                <Check className="size-5" />
              </div>
              <div>
                <h2 className="font-semibold">{form.name.trim()}</h2>
                <p className="text-sm text-muted-foreground">
                  Organization admin ·{" "}
                  {branches.find((branch) => branch.id === form.branchId)?.name}
                </p>
              </div>
            </div>
            <div className="border-t pt-5">
              <div className="mb-3 flex items-center gap-2">
                <KeyRound className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Member invite code</h3>
              </div>
              <p className="mb-4 text-sm text-muted-foreground">
                Share this reusable code with members of your organization. It expires after one
                year, and you can always find it in your account.
              </p>
              {inviteCode ? (
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
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {inviteError && (
                    <p role="alert" className="text-sm text-destructive">
                      {inviteError}
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void createInvite()}
                    disabled={submitting}
                    className="gap-2"
                  >
                    {submitting ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <KeyRound className="size-4" />
                    )}
                    Generate invite code
                  </Button>
                </div>
              )}
            </div>
            <Button className="mt-6 w-full" onClick={() => void navigate({ to: "/" })}>
              Continue to WorkspaceOS
            </Button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10 md:py-16">
      <section className="mx-auto max-w-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="size-5" />
          </div>
          <div>
            <p className="text-xs font-medium uppercase text-muted-foreground">WorkspaceOS setup</p>
            <h1 className="font-display text-xl font-semibold">Set up your organization</h1>
          </div>
        </div>
        <div className="mb-6 grid grid-cols-2 rounded-lg border bg-background p-1">
          <button
            type="button"
            onClick={() => setMode("create")}
            className={`rounded-md px-3 py-2 text-sm font-medium ${mode === "create" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            Create organization
          </button>
          <button
            type="button"
            onClick={() => setMode("join")}
            className={`rounded-md px-3 py-2 text-sm font-medium ${mode === "join" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
          >
            Join with invite code
          </button>
        </div>
        <div className="rounded-lg border bg-background p-5 shadow-sm md:p-7">
          {mode === "create" ? (
            <form onSubmit={createOrganization} className="space-y-5">
              <div>
                <h2 className="font-display text-lg font-semibold">Register your organization</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  You’ll become its organization admin and can invite your team.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="organization-name">Organization name</Label>
                <Input
                  id="organization-name"
                  required
                  maxLength={160}
                  autoComplete="organization"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="organization-website">Website</Label>
                  <Input
                    id="organization-website"
                    type="url"
                    placeholder="https://example.com"
                    value={form.website}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, website: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="organization-industry">Industry</Label>
                  <Input
                    id="organization-industry"
                    maxLength={120}
                    value={form.industry}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, industry: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="organization-branch">Office & Co branch</Label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <select
                    id="organization-branch"
                    required
                    value={form.branchId}
                    disabled={branchLoading || branches.length === 0}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, branchId: event.target.value }))
                    }
                    className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                        {branch.city ? ` · ${branch.city}` : ""}
                        {branch.region ? `, ${branch.region}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                {!branchLoading && branches.length === 0 && (
                  <p className="text-sm text-destructive">
                    No live Office & Co branches are available. Contact an administrator.
                  </p>
                )}
              </div>
              <Button
                type="submit"
                className="w-full gap-2"
                disabled={submitting || branchLoading || branches.length === 0}
              >
                {submitting ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Building2 className="size-4" />
                )}
                Create organization
              </Button>
            </form>
          ) : (
            <form onSubmit={joinOrganization} className="space-y-5">
              <div>
                <h2 className="font-display text-lg font-semibold">Join your organization</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ask your organization admin for a current invite code.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="organization-invite">Invite code</Label>
                <Input
                  id="organization-invite"
                  required
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  value={form.code}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))
                  }
                  className="font-mono tracking-widest"
                />
              </div>
              <Button type="submit" className="w-full gap-2" disabled={submitting}>
                {submitting ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <KeyRound className="size-4" />
                )}
                Join organization
              </Button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
