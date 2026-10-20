import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase";

export const Route = createFileRoute("/auth/sso")({
  head: () => ({ meta: [{ title: "Enterprise SSO — Office & Co" }] }),
  component: Sso,
});

function Sso() {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Authentication is not configured. Add the Supabase URL and anon key to the environment.");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithSSO({
      domain: domain.trim(),
      options: { redirectTo: `${window.location.origin}/` },
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else if (data.url) window.location.assign(data.url);
    else toast.error("No SSO provider is configured for this domain.");
  };

  return (
    <AuthLayout
      eyebrow="Enterprise sign in"
      title="Sign in with SSO."
      subtitle="Use your company's SAML or OIDC provider to continue."
      footer={<Link to="/auth/sign-in" className="text-brand font-medium hover:underline">Back to standard sign in</Link>}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label>Company domain</Label>
          <Input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="company.co.za" required />
          <div className="text-[11px] text-muted-foreground">We'll redirect you to your identity provider.</div>
        </div>
        <Button type="submit" className="w-full gap-2" disabled={loading}><ShieldCheck className="size-4" />{loading ? "Redirecting…" : "Continue with SSO"}</Button>
      </form>
    </AuthLayout>
  );
}
