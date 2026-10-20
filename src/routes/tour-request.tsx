import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthLayout } from "@/components/AuthLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getSupabaseClient } from "@/lib/supabase";

export const Route = createFileRoute("/tour-request")({
  head: () => ({ meta: [{ title: "Book a tour — Office & Co WorkspaceOS" }] }),
  component: TourRequest,
});

function TourRequest() {
  const nav = useNavigate();
  const [form, setForm] = useState({ fullName: "", email: "", whatsapp: "", company: "" });
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const supabase = getSupabaseClient();
    if (!supabase) {
      setSubmitting(false);
      toast.error("Tour requests are temporarily unavailable. Please try again later.");
      return;
    }

    const { data: leadId, error } = await supabase.rpc("submit_website_tour_request", {
      p_contact_name: form.fullName.trim(),
      p_contact_email: form.email.trim(),
      p_contact_phone: form.whatsapp.trim(),
      p_company_name: form.company.trim(),
    });
    setSubmitting(false);
    if (error || !leadId) {
      toast.error(error?.message ?? "Could not save your tour request.");
      return;
    }
    toast.success("Thanks! Your tour request is received. Pick your preferred slot next.");
    nav({ to: "/tour-calendar", search: { leadId } });
  };

  return (
    <AuthLayout
      eyebrow="Book a tour"
      title="See Office & Co in person."
      subtitle="Share your details and we’ll update you with available date and time to choose from"
      footer={<>Already have an account? <a href="/auth/sign-in" className="text-brand font-medium hover:underline">Sign in</a></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Full name</Label>
          <Input id="fullName" required placeholder="Ava Ndlovu" value={form.fullName} onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email address</Label>
          <Input id="email" type="email" required placeholder="you@company.com" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="whatsapp">WhatsApp or office number</Label>
          <Input id="whatsapp" type="tel" required placeholder="+27 82 123 4567" value={form.whatsapp} onChange={(e) => setForm((prev) => ({ ...prev, whatsapp: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="company">Company</Label>
          <Input id="company" required placeholder="Your company" value={form.company} onChange={(e) => setForm((prev) => ({ ...prev, company: e.target.value }))} />
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>{submitting ? "Saving details…" : "Book a tour"}</Button>
        <p className="text-[11px] text-muted-foreground">Your tour request is saved to the CRM before you choose a date and time.</p>
      </form>
    </AuthLayout>
  );
}
