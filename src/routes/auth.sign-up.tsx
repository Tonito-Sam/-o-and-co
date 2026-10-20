import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase";

export const Route = createFileRoute("/auth/sign-up")({
  head: () => ({ meta: [{ title: "Sign up — Office & Co WorkspaceOS" }] }),
  component: SignUp,
});

function scorePassword(password: string) {
  let score = 0;
  if (password.length >= 8) score += 25;
  if (/[A-Z]/.test(password)) score += 20;
  if (/[a-z]/.test(password)) score += 20;
  if (/[0-9]/.test(password)) score += 15;
  if (/[^A-Za-z0-9]/.test(password)) score += 20;
  return Math.min(score, 100);
}

function SignUp() {
  const nav = useNavigate();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", company: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const score = useMemo(() => scorePassword(form.password), [form.password]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Authentication is not configured. Add the Supabase URL and anon key to the environment.");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        data: { full_name: `${form.firstName.trim()} ${form.lastName.trim()}`, company: form.company.trim() },
        emailRedirectTo: `${window.location.origin}/auth/verify-email`,
      },
    });
    setSubmitting(false);
    if (error) {
      console.error("Supabase sign-up rejected the request", {
        message: error.message,
        code: error.code,
        status: error.status,
      });
      toast.error(error.code ? `${error.message} (${error.code})` : error.message);
      return;
    }

    toast.success("Account request created. Check your inbox to verify your email.");
    window.sessionStorage.setItem("pendingVerificationEmail", form.email.trim());
    nav({ to: "/auth/verify-email" });
  };

  return (
    <AuthLayout
      eyebrow="Create your account"
      title="Join Office & Co."
      subtitle="Get access to the portal, community, and all branches."
      footer={<>
        Already have an account? <Link to="/auth/sign-in" className="text-brand font-medium hover:underline">Sign in</Link>
      </>}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">First name</Label>
            <Input id="firstName" required placeholder="Anthony" value={form.firstName} onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Last name</Label>
            <Input id="lastName" required placeholder="Manas" value={form.lastName} onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" type="email" required placeholder="you@company.com" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="company">Company</Label>
          <Input id="company" required placeholder="Your company" value={form.company} onChange={(e) => setForm((prev) => ({ ...prev, company: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" required value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} placeholder="At least 8 characters" />
          <Progress value={score} className="h-1 mt-1" />
          <div className="text-[11px] text-muted-foreground">{score < 50 ? "Weak" : score < 75 ? "Good" : "Strong"} — mix letters, numbers and symbols.</div>
        </div>
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <Checkbox required className="mt-0.5" /> I agree to the <a href="#" className="text-brand">Terms</a> and <a href="#" className="text-brand">Privacy Policy</a>.
        </label>
        <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Creating account…" : "Create account"}</Button>
      </form>
    </AuthLayout>
  );
}
