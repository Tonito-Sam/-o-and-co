import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthLayout } from "@/components/AuthLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/reset-password")({
  head: () => ({ meta: [{ title: "Reset password — Office & Co" }] }),
  component: Reset,
});

function Reset() {
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw !== pw2) { toast.error("Passwords don't match."); return; }
    if (pw.length < 8) { toast.error("Use at least 8 characters."); return; }
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
        <Button type="submit" className="w-full">Update password</Button>
      </form>
    </AuthLayout>
  );
}
