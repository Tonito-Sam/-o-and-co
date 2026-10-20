import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthLayout } from "@/components/AuthLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState } from "react";
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
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) { toast.error("Passwords don't match."); return; }
    if (pw.length < 8) { toast.error("Use at least 8 characters."); return; }
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Authentication is not configured. Add the Supabase URL and anon key to the environment.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.auth.signOut();
    toast.success("Password updated. Please sign in.");
    nav({ to: "/auth/sign-in" });
  };
  return (
    <AuthLayout
      eyebrow="Set a new password"
      title="Choose a strong new password."
      subtitle="Make it at least 8 characters with a mix of letters, numbers and symbols."
      footer={<Link to="/auth/sign-in" className="text-brand font-medium hover:underline">Back to sign in</Link>}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5"><Label>New password</Label><Input type="password" required value={pw} onChange={e => setPw(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Confirm password</Label><Input type="password" required value={pw2} onChange={e => setPw2(e.target.value)} /></div>
        <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Updating…" : "Update password"}</Button>
      </form>
    </AuthLayout>
  );
}
