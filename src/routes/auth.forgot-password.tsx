import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthLayout } from "@/components/AuthLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase";

export const Route = createFileRoute("/auth/forgot-password")({
  head: () => ({ meta: [{ title: "Forgot password — Office & Co" }] }),
  component: Forgot,
});

function Forgot() {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const sendResetLink = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error(
        "Authentication is not configured. Add the Supabase URL and anon key to the environment.",
      );
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: new URL("/auth/reset-password", window.location.origin).toString(),
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      setSent(true);
    } catch (error) {
      console.error("Password reset request failed", error);
      toast.error(
        error instanceof Error ? error.message : "Could not send a password reset email.",
      );
    } finally {
      setLoading(false);
    }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await sendResetLink();
  };

  return (
    <AuthLayout
      eyebrow="Password reset"
      title={sent ? "Check your inbox." : "Forgot your password?"}
      subtitle={
        sent
          ? "We've sent a secure reset link to your email. It expires in 30 minutes."
          : "Enter your email and we'll send a reset link."
      }
      footer={
        <>
          <Link to="/auth/sign-in" className="text-brand font-medium hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      {!sent ? (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reset-email">Email</Label>
            <Input
              id="reset-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Open the link in your email to set a new password. You can resend it if it does not
            arrive.
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => void sendResetLink()}
            disabled={loading}
          >
            {loading ? "Sending…" : "Resend reset link"}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setSent(false)}>
            Use a different email
          </Button>
        </div>
      )}
    </AuthLayout>
  );
}
