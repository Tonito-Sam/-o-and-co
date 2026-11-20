import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/PasswordInput";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase";

export const Route = createFileRoute("/auth/reset-password")({
  head: () => ({ meta: [{ title: "Reset password — Office & Co" }] }),
  component: Reset,
});

function Reset() {
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setRecoveryError("Authentication is not configured. Please try again later.");
      setCheckingSession(false);
      return;
    }

    let active = true;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active || !session) return;
      setRecoveryReady(true);
      setRecoveryError("");
      setCheckingSession(false);
    });

    const queryParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    if (queryParams.has("error") || hashParams.has("error")) {
      setRecoveryError("This password reset link is invalid or expired. Request a new one.");
      setCheckingSession(false);
    } else {
      void supabase.auth
        .getSession()
        .then(({ data, error }) => {
          if (!active) return;
          if (error) {
            console.error("Could not verify the password reset session", error.message);
            setRecoveryError("This password reset link is invalid or expired. Request a new one.");
          } else if (data.session) {
            setRecoveryReady(true);
            setRecoveryError("");
          } else {
            setRecoveryError(
              "No valid password reset session was found. Request a new reset link.",
            );
          }
          setCheckingSession(false);
        })
        .catch((error: unknown) => {
          if (!active) return;
          console.error("Could not verify the password reset session", error);
          setRecoveryError("Could not verify this password reset link. Request a new one.");
          setCheckingSession(false);
        });
    }

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pw !== pw2) {
      toast.error("Passwords don't match.");
      return;
    }
    if (pw.length < 8) {
      toast.error("Use at least 8 characters.");
      return;
    }
    if (!recoveryReady) {
      toast.error("Open a valid password reset link before setting a new password.");
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error(
        "Authentication is not configured. Add the Supabase URL and anon key to the environment.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) {
        toast.error(error.message);
        return;
      }

      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        console.error("Password updated but sign-out failed", signOutError.message);
        toast.error(`Password updated, but sign-out failed: ${signOutError.message}`);
        await nav({ to: "/" });
        return;
      }

      toast.success("Password updated. Please sign in.");
      await nav({ to: "/auth/sign-in" });
    } catch (error) {
      console.error("Password update failed", error);
      toast.error(error instanceof Error ? error.message : "Could not update your password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Set a new password"
      title="Choose a strong new password."
      subtitle="Make it at least 8 characters with a mix of letters, numbers and symbols."
      footer={
        <Link to="/auth/sign-in" className="text-brand font-medium hover:underline">
          Back to sign in
        </Link>
      }
    >
      {checkingSession ? (
        <p role="status" className="text-sm text-muted-foreground">
          Verifying your password reset link…
        </p>
      ) : recoveryReady ? (
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-password">New password</Label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              minLength={8}
              required
              value={pw}
              onChange={(event) => setPw(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Confirm password</Label>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              minLength={8}
              required
              value={pw2}
              onChange={(event) => setPw2(event.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Updating…" : "Update password"}
          </Button>
        </form>
      ) : (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-destructive">
            {recoveryError}
          </p>
          <Button asChild className="w-full">
            <Link to="/auth/forgot-password">Request a new reset link</Link>
          </Button>
        </div>
      )}
    </AuthLayout>
  );
}
