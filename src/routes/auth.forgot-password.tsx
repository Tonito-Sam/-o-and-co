import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthLayout } from "@/components/AuthLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export const Route = createFileRoute("/auth/forgot-password")({
  head: () => ({ meta: [{ title: "Forgot password — Office & Co" }] }),
  component: Forgot,
});

function Forgot() {
  const [sent, setSent] = useState(false);
  return (
    <AuthLayout
      eyebrow="Password reset"
      title={sent ? "Check your inbox." : "Forgot your password?"}
      subtitle={sent ? "We've sent a secure reset link to your email. It expires in 30 minutes." : "Enter your email and we'll send a reset link."}
      footer={<><Link to="/auth/sign-in" className="text-brand font-medium hover:underline">Back to sign in</Link></>}
    >
      {!sent ? (
        <form onSubmit={(e) => { e.preventDefault(); setSent(true); }} className="space-y-4">
          <div className="space-y-1.5"><Label>Email</Label><Input type="email" required placeholder="you@company.com" /></div>
          <Button type="submit" className="w-full">Send reset link</Button>
        </form>
      ) : (
        <div className="space-y-3">
          <Button variant="outline" className="w-full" onClick={() => setSent(false)}>Use a different email</Button>
          <Button asChild className="w-full"><Link to="/auth/reset-password">I have a reset link</Link></Button>
        </div>
      )}
    </AuthLayout>
  );
}
