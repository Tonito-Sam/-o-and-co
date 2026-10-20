import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase";

export const Route = createFileRoute("/auth/verify-email")({
  head: () => ({ meta: [{ title: "Verify email — Office & Co" }] }),
  component: Verify,
});

function Verify() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    const pendingEmail = window.sessionStorage.getItem("pendingVerificationEmail");
    if (pendingEmail) setEmail(pendingEmail);

    const supabase = getSupabaseClient();
    if (!supabase) return;

    let active = true;
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (active && data.session?.user.email_confirmed_at) setVerified(true);
    };
    void checkSession();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.email_confirmed_at) setVerified(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const resend = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error(
        "Authentication is not configured. Add the Supabase URL and anon key to the environment.",
      );
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.resend({ email: email.trim(), type: "signup" });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else toast.success("Confirmation email sent.");
  };
  return (
    <AuthLayout
      eyebrow={verified ? "Email confirmed" : "Verify your email"}
      title={verified ? "Your email is confirmed." : "Check your inbox to confirm your email."}
      subtitle={
        verified
          ? "Your account is ready. Continue to your workspace."
          : "Open the confirmation link in the email from Supabase to activate your account."
      }
      footer={
        <Link to="/auth/sign-in" className="text-brand font-medium hover:underline">
          Back to sign in
        </Link>
      }
    >
      <div className="space-y-5">
        {verified ? (
          <Button onClick={() => nav({ to: "/" })} className="w-full">
            Continue to workspace
          </Button>
        ) : (
          <>
            {email && (
              <p className="text-center text-sm text-muted-foreground">
                Confirmation email sent to{" "}
                <span className="font-medium text-foreground">{email}</span>
              </p>
            )}
            {email && (
              <Button onClick={resend} variant="outline" className="w-full" disabled={submitting}>
                {submitting ? "Sending…" : "Resend confirmation email"}
              </Button>
            )}
          </>
        )}
      </div>
    </AuthLayout>
  );
}
