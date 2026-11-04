import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthLayout } from "@/components/AuthLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase";

export const Route = createFileRoute("/auth/sign-in")({
  head: () => ({ meta: [{ title: "Sign in — Office & Co WorkspaceOS" }] }),
  validateSearch: (search: Record<string, unknown>): { returnTo?: "/union-station" | "welcome-union-station" } => ({
    ...(search.returnTo === "/union-station" || search.returnTo === "welcome-union-station"
      ? { returnTo: search.returnTo }
      : {}),
  }),
  component: SignIn,
});

function SignIn() {
  const nav = useNavigate();
  const { returnTo } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Authentication is not configured. Add the Supabase URL and anon key to the environment.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Signed in successfully.");
    if (returnTo === "welcome-union-station") {
      nav({ to: "/welcome", search: { unionBooking: "open" } });
    } else {
      nav({ to: returnTo ?? "/" });
    }
  };

  return (
    <AuthLayout
      eyebrow="Sign in"
      title="Welcome back."
      subtitle="Continue to your WorkspaceOS dashboard."
      footer={<>Don't have an account? <Link to="/auth/sign-up" className="text-brand font-medium hover:underline">Create one</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="gap-2"><GoogleIcon />Google</Button>
          <Button type="button" variant="outline" className="gap-2"><MicrosoftIcon />Microsoft</Button>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground"><div className="flex-1 h-px bg-border" />or with email<div className="flex-1 h-px bg-border" /></div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/auth/forgot-password" className="text-xs text-brand hover:underline">Forgot password?</Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
          <Checkbox defaultChecked /> Remember me on this device
        </label>
        <Button type="submit" className="w-full" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
        <div className="text-center text-xs text-muted-foreground">
          Enterprise? <Link to="/auth/sso" className="text-brand hover:underline">Sign in with SSO</Link>
        </div>
      </form>
    </AuthLayout>
  );
}

function GoogleIcon() { return <svg viewBox="0 0 24 24" className="size-4"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.11A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.45.34-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.95l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38z"/></svg>; }
function MicrosoftIcon() { return <svg viewBox="0 0 23 23" className="size-4"><path fill="#f25022" d="M1 1h10v10H1z"/><path fill="#7fba00" d="M12 1h10v10H12z"/><path fill="#00a4ef" d="M1 12h10v10H1z"/><path fill="#ffb900" d="M12 12h10v10H12z"/></svg>; }
