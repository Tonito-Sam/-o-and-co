import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/auth/sso")({
  head: () => ({ meta: [{ title: "Enterprise SSO — Office & Co" }] }),
  component: Sso,
});

function Sso() {
  return (
    <AuthLayout
      eyebrow="Enterprise sign in"
      title="Sign in with SSO."
      subtitle="Use your company's SAML or OIDC provider to continue."
      footer={<Link to="/auth/sign-in" className="text-brand font-medium hover:underline">Back to standard sign in</Link>}
    >
      <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Company domain</Label>
          <Input placeholder="acme.co.za" required />
          <div className="text-[11px] text-muted-foreground">We'll redirect you to your identity provider.</div>
        </div>
        <Button type="submit" className="w-full gap-2"><ShieldCheck className="size-4" />Continue with SSO</Button>
      </form>
    </AuthLayout>
  );
}
