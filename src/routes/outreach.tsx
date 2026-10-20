import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Mail, PhoneCall, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getSupabaseClient } from "@/lib/supabase";
import { useRole } from "@/lib/role-context";

export const Route = createFileRoute("/outreach")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode === "campaign" ? "campaign" as const : "single" as const,
  }),
  head: () => ({ meta: [{ title: "Prospect Outreach — WorkspaceOS" }] }),
  component: Outreach,
});

function Outreach() {
  const { mode } = Route.useSearch();
  const isCampaign = mode === "campaign";
  const { role } = useRole();
  const canSend = ["sales-manager", "crm-manager", "group-ceo", "superadmin"].includes(role.id);
  const [companyName, setCompanyName] = useState("Office & Co");
  const [contactName, setContactName] = useState("Sam");
  const [toEmail, setToEmail] = useState("hello@officeand.co");
  const [subject, setSubject] = useState("Quick question about your workspace needs");
  const [callbackPreference, setCallbackPreference] = useState<"yes" | "no" | "unspecified">("yes");
  const [consentStatus, setConsentStatus] = useState<"explicitly_opted_in" | "requires_confirmation" | "not_requested">("requires_confirmation");
  const [body, setBody] = useState(
    "We are reviewing the local workspace demand in your area and would love to understand whether your business is exploring a new office or private meeting environment.",
  );
  const [campaignName, setCampaignName] = useState("Local workspace prospect campaign");
  const [campaignEmailCount, setCampaignEmailCount] = useState<number | null>(null);
  const [campaignCountError, setCampaignCountError] = useState<string | null>(null);
  const [campaignConsentConfirmed, setCampaignConsentConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    if (!isCampaign) return;
    const supabase = getSupabaseClient();
    if (!supabase) {
      setCampaignCountError("Supabase is not configured.");
      return;
    }
    let active = true;
    void supabase
      .from("prospect_contacts")
      .select("value")
      .eq("kind", "email")
      .limit(5000)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setCampaignCountError(error.message);
          return;
        }
        const uniqueEmails = new Set(
          (data ?? [])
            .map(({ value }) => value.trim().toLowerCase())
            .filter((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)),
        );
        setCampaignEmailCount(uniqueEmails.size);
        setCampaignCountError(null);
      });
    return () => {
      active = false;
    };
  }, [isCampaign]);

  const providerReady = Boolean(
    import.meta.env.VITE_RESEND_API_KEY || import.meta.env.RESEND_API_KEY || import.meta.env.VITE_EMAIL_FROM || import.meta.env.EMAIL_FROM,
  );

  const preview = useMemo(() => {
    const summary = body.trim() || "We would like to learn more about your current space needs.";
    if (isCampaign) {
      return `Hello,\n\n${summary}\n\nTo opt out of future marketing emails, reply STOP.\n\nRegards,\nOffice & Co\nhello@officeand.co`;
    }
    const intro = contactName.trim() || "there";
    const yesNo =
      callbackPreference === "yes"
        ? "If this is helpful, please reply YES and we will arrange a short call."
        : callbackPreference === "no"
          ? "If you would prefer not to be contacted by phone, simply reply NO and we will pause follow-up."
          : "If this is helpful, please reply YES to confirm a short call. If not, reply NO and we will pause follow-up.";

    return `Hi ${intro},\n\nI’m reaching out from Office & Co on behalf of ${companyName || "your team"}.\n\n${summary}\n\n${yesNo}\n\nThank you,\nOffice & Co\nhello@officeand.co`;
  }, [body, callbackPreference, companyName, contactName, isCampaign]);

  const send = async () => {
    if (!canSend) {
      toast.error("Only sales managers and executives can send outreach emails.");
      return;
    }

    if (!subject.trim() || !body.trim()) {
      toast.error("Subject and message body are required.");
      return;
    }
    if (isCampaign && (!campaignName.trim() || !campaignConsentConfirmed || !campaignEmailCount)) {
      toast.error("Confirm opted-in recipients and ensure captured email addresses are available.");
      return;
    }
    if (!isCampaign && !toEmail.trim()) {
      toast.error("A recipient email address is required.");
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      toast.error("Supabase is not configured in this environment.");
      return;
    }

    setSending(true);
    const { data, error } = await supabase.functions.invoke("send-outreach", {
      body: isCampaign
        ? {
            action: "campaign",
            campaignName: campaignName.trim(),
            subject: subject.trim(),
            body: body.trim(),
            consentConfirmed: campaignConsentConfirmed,
          }
        : {
            toEmail: toEmail.trim(),
            subject: subject.trim(),
            body: body.trim(),
            companyName: companyName.trim(),
            contactName: contactName.trim(),
            callbackPreference,
            consentStatus,
          },
    });
    setSending(false);

    if (error) {
      toast.error(error.message || "The email could not be sent.");
      return;
    }

    const summary = isCampaign
      ? `Campaign ${data?.status}: ${data?.sent ?? 0} sent, ${data?.suppressed ?? 0} suppressed, ${data?.failed ?? 0} failed.`
      : data?.messageId
        ? `Email queued and logged: ${data.messageId}`
        : "Email sent successfully.";
    setSent(summary);
    toast.success(summary);
  };

  if (!canSend) {
    return (
      <div className="mx-auto max-w-4xl py-16 text-center">
        <ShieldCheck className="mx-auto size-8 text-muted-foreground" />
        <h1 className="mt-4 font-display text-xl font-semibold">Access restricted</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Prospect outreach is limited to Sales/CRM Managers and platform executives.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Prospect intelligence · outreach"
        title="Prospect outreach"
        description={isCampaign
          ? "Compose a campaign for unique crawler-captured email addresses."
          : "Send a consent-aware follow-up with a clear yes/no call option."}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant={isCampaign ? "outline" : "secondary"}>
              <Link to="/outreach" search={{ mode: "single" }}>Single email</Link>
            </Button>
            <Button asChild size="sm" variant={isCampaign ? "secondary" : "outline"}>
              <Link to="/outreach" search={{ mode: "campaign" }}>Campaign</Link>
            </Button>
            <Badge variant={providerReady ? "default" : "secondary"} className="gap-1.5">
              <Sparkles className="size-3.5" />
              {providerReady ? "Provider ready" : "Provider not configured"}
            </Badge>
          </div>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="rounded-xl border bg-card p-5">
          <div className="grid gap-4 md:grid-cols-2">
            {isCampaign ? (
              <>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="campaign-name">Campaign name</Label>
                  <Input id="campaign-name" value={campaignName} onChange={(event) => setCampaignName(event.target.value)} maxLength={120} />
                </div>
                <div className="space-y-2 md:col-span-2 rounded-md border bg-muted/20 p-3 text-sm">
                  <p className="font-medium">
                    {campaignEmailCount === null ? "Counting captured addresses…" : `${campaignEmailCount} unique crawler-captured email addresses`}
                  </p>
                  {campaignCountError && <p role="alert" className="mt-1 text-xs text-destructive">{campaignCountError}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Previously unsubscribed or bounced addresses are excluded by the sender.
                  </p>
                </div>
                <label className="flex items-start gap-3 text-sm md:col-span-2">
                  <input
                    type="checkbox"
                    checked={campaignConsentConfirmed}
                    onChange={(event) => setCampaignConsentConfirmed(event.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-current"
                  />
                  <span>I confirm every recipient is explicitly opted in to receive these marketing emails and has not opted out.</span>
                </label>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="company-name">Company</Label>
                  <Input id="company-name" value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-name">Contact name</Label>
                  <Input id="contact-name" value={contactName} onChange={(event) => setContactName(event.target.value)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="recipient-email">Recipient email</Label>
                  <Input id="recipient-email" type="email" value={toEmail} onChange={(event) => setToEmail(event.target.value)} placeholder="name@company.com" />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="subject">Email subject</Label>
              <Input id="subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
            </div>
            {!isCampaign && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="callback-preference">Call preference</Label>
                  <Select value={callbackPreference} onValueChange={(value) => setCallbackPreference(value as typeof callbackPreference)}>
                    <SelectTrigger id="callback-preference">
                      <SelectValue placeholder="Choose a default" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes — ask for a quick call</SelectItem>
                      <SelectItem value="no">No — pause follow-up</SelectItem>
                      <SelectItem value="unspecified">Unspecified — neutral ask</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="consent-status">Consent status</Label>
                  <Select value={consentStatus} onValueChange={(value) => setConsentStatus(value as typeof consentStatus)}>
                    <SelectTrigger id="consent-status">
                      <SelectValue placeholder="Consent state" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="explicitly_opted_in">Explicitly opted in</SelectItem>
                      <SelectItem value="requires_confirmation">Requires confirmation</SelectItem>
                      <SelectItem value="not_requested">Not requested</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="message-body">Message</Label>
              <Textarea id="message-body" value={body} onChange={(event) => setBody(event.target.value)} rows={7} />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="text-xs text-muted-foreground">
              {isCampaign
                ? "Each message is sent separately; confirm the recipients have opted in before sending."
                : "This send includes a clear yes/no CTA and should only be used where a compliant consent path exists."}
            </div>
            <Button
              type="button"
              onClick={() => void send()}
              disabled={sending || (isCampaign && (!campaignConsentConfirmed || !campaignEmailCount || Boolean(campaignCountError)))}
              className="gap-2"
            >
              <Mail className="size-4" />
              {sending ? "Sending…" : isCampaign ? `Send campaign to ${campaignEmailCount ?? 0}` : "Send email"}
            </Button>
          </div>
        </section>

        <aside className="space-y-5">
          <div className="rounded-xl border bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <PhoneCall className="size-4 text-brand" />
              <h2 className="font-display text-base font-semibold">Preview</h2>
            </div>
            <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-xs text-foreground/90">{preview}</pre>
          </div>
          <div className="rounded-xl border bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <ShieldCheck className="size-4 text-brand" />
              <h2 className="font-display text-base font-semibold">Compliance guardrails</h2>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-success" />Campaigns require an explicit opted-in confirmation.</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-success" />Each send clearly asks for a yes/no response.</li>
              <li className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 size-4 text-success" />Every delivery is logged in the outreach table for review.</li>
            </ul>
          </div>
          {sent && (
            <div className="rounded-xl border border-success/30 bg-success/5 p-4 text-sm text-success-foreground">
              {sent}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
