import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthLayout } from "@/components/AuthLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/sign-up")({
  head: () => ({ meta: [{ title: "Create account — Office & Co WorkspaceOS" }] }),
  component: SignUp,
});

function scorePassword(pw: string) {
  let s = 0;
  if (pw.length >= 8) s += 25;
  if (/[A-Z]/.test(pw)) s += 25;
  if (/[0-9]/.test(pw)) s += 25;
  if (/[^A-Za-z0-9]/.test(pw)) s += 25;
  return s;
}

function SignUp() {
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const score = useMemo(() => scorePassword(pw), [pw]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Account created. Check your inbox to verify.");
    nav({ to: "/auth/verify-email" });
  };
  return (
    <AuthLayout
      eyebrow="Create your account"
      title="Join Office & Co."
      subtitle="One account. Every branch. Every booking. Every event."
      footer={<>Already have an account? <Link to="/auth/sign-in" className="text-brand font-medium hover:underline">Sign in</Link></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label>First name</Label><Input required placeholder="Anthony" /></div>
          <div className="space-y-1.5"><Label>Last name</Label><Input required placeholder="Manas" /></div>
        </div>
        <div className="space-y-1.5"><Label>Work email</Label><Input type="email" required placeholder="you@company.com" /></div>
        <div className="space-y-1.5"><Label>Company</Label><Input required placeholder="Your company" /></div>
        <div className="space-y-1.5">
          <Label>Password</Label>
          <Input type="password" required value={pw} onChange={e => setPw(e.target.value)} placeholder="At least 8 characters" />
          <Progress value={score} className="h-1 mt-1" />
          <div className="text-[11px] text-muted-foreground">{score < 50 ? "Weak" : score < 75 ? "Good" : "Strong"} — mix upper, lower, numbers & symbols.</div>
        </div>
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <Checkbox required className="mt-0.5" /> I agree to the <a href="#" className="text-brand">Terms</a> and <a href="#" className="text-brand">Privacy Policy</a>.
        </label>
        <Button type="submit" className="w-full">Create account</Button>
      </form>
    </AuthLayout>
  );
}
