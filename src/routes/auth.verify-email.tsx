import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AuthLayout } from "@/components/AuthLayout";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/verify-email")({
  head: () => ({ meta: [{ title: "Verify email — Office & Co" }] }),
  component: Verify,
});

function Verify() {
  const nav = useNavigate();
  const [code, setCode] = useState("");
  const verify = () => {
    if (code.length !== 6) { toast.error("Enter the full 6-digit code."); return; }
    toast.success("Email verified. Welcome aboard.");
    nav({ to: "/" });
  };
  return (
    <AuthLayout
      eyebrow="Verify your email"
      title="Check your inbox for a code."
      subtitle="We've sent a 6-digit code to your work email. Enter it below to activate your account."
      footer={<Link to="/auth/sign-in" className="text-brand font-medium hover:underline">Back to sign in</Link>}
    >
      <div className="space-y-5">
        <div className="flex justify-center">
          <InputOTP maxLength={6} value={code} onChange={setCode}>
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map(i => <InputOTPSlot key={i} index={i} />)}
            </InputOTPGroup>
          </InputOTP>
        </div>
        <Button onClick={verify} className="w-full">Verify email</Button>
        <button type="button" onClick={() => toast.success("New code sent.")} className="text-xs text-brand hover:underline mx-auto block">Resend code</button>
      </div>
    </AuthLayout>
  );
}
