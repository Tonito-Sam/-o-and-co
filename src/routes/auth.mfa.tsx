import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/mfa")({
  head: () => ({ meta: [{ title: "Two-factor — Office & Co" }] }),
  component: Mfa,
});

function Mfa() {
  const nav = useNavigate();
  const [code, setCode] = useState("");
  return (
    <AuthLayout
      eyebrow="Two-factor authentication"
      title="One more step."
      subtitle="Enter the 6-digit code from your authenticator app."
      footer={<Link to="/auth/sign-in" className="text-brand font-medium hover:underline">Use a different account</Link>}
    >
      <div className="space-y-5">
        <div className="flex justify-center">
          <InputOTP maxLength={6} value={code} onChange={setCode}>
            <InputOTPGroup>{[0, 1, 2, 3, 4, 5].map(i => <InputOTPSlot key={i} index={i} />)}</InputOTPGroup>
          </InputOTP>
        </div>
        <Button onClick={() => { toast.success("Authenticated."); nav({ to: "/" }); }} className="w-full">Continue</Button>
        <button type="button" className="text-xs text-brand hover:underline mx-auto block">Use a recovery code instead</button>
      </div>
    </AuthLayout>
  );
}
