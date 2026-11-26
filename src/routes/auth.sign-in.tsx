import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthLayout } from "@/components/AuthLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/PasswordInput";
import { useState } from "react";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase";

export const Route = createFileRoute("/auth/sign-in")({
  head: () => ({ meta: [{ title: "Sign in — Office & Co WorkspaceOS" }] }),
  validateSearch: (
    search: Record<string, unknown>,
  ): { returnTo?: "/union-station" | "welcome-union-station" } => ({
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
      toast.error(
        "Authentication is not configured. Add the Supabase URL and anon key to the environment.",
      );
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
      footer={
        <>
          Don't have an account?{" "}
          <Link to="/auth/sign-up" className="text-brand font-medium hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/auth/forgot-password" className="text-xs text-brand hover:underline">
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <p className="text-sm text-muted-foreground">
          You’ll stay signed in on this device until you sign out.
        </p>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
        <div className="text-center text-xs text-muted-foreground">
          Enterprise?{" "}
          <Link to="/auth/sso" className="text-brand hover:underline">
            Sign in with SSO
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
