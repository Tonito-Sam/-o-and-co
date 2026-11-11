import { createClient } from "npm:@supabase/supabase-js@2";
import { OUTREACH_EMAIL, OUTREACH_FROM, sendSmtpEmail } from "../_shared/smtp.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CallbackPreference = "yes" | "no" | "unspecified";
type ConsentStatus = "explicitly_opted_in" | "requires_confirmation" | "not_requested";

type SendOutreachRequest = {
  action?: "single" | "campaign";
  toEmail?: string;
  subject?: string;
  body?: string;
  companyName?: string;
  contactName?: string;
  callbackPreference?: CallbackPreference;
  consentStatus?: ConsentStatus;
  prospectId?: string;
  prospectIds?: string[];
  campaignName?: string;
  consentConfirmed?: boolean;
};

type CampaignRecipient = {
  prospectId: string;
  email: string;
  companyName: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildBodyText(
  { contactName, companyName, body }: SendOutreachRequest,
  yesUrl: string,
  noUrl: string,
) {
  const recipient = contactName?.trim() || "there";
  const company = companyName?.trim() || "your team";
  const summary = body?.trim() || "We would like to learn more about your current space needs.";

  return [
    `Hi ${recipient},`,
    ``,
    `I’m reaching out from Office & Co on behalf of ${company}.`,
    ``,
    summary,
    ``,
    "If this is helpful, confirm that you would like us to arrange a short call:",
    `YES, arrange a call: ${yesUrl}`,
    `NO, stop follow-ups: ${noUrl}`,
    ``,
    "Regards,",
    "Office & Co",
    OUTREACH_EMAIL,
  ].join("\n");
}

function buildHtml(
  { contactName, companyName, body }: SendOutreachRequest,
  yesUrl: string,
  noUrl: string,
) {
  const recipient = contactName?.trim() || "there";
  const company = companyName?.trim() || "your team";
  const summary = body?.trim() || "We would like to learn more about your current space needs.";

  return `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6; max-width: 640px; margin: 0 auto;">
      <p>Hi ${escapeHtml(recipient)},</p>
      <p>I’m reaching out from Office &amp; Co on behalf of ${escapeHtml(company)}.</p>
      <p>${escapeHtml(summary).replace(/\r?\n/g, "<br>")}</p>
      <p>If this is helpful, confirm that you would like us to arrange a short call:</p>
      <p><a href="${escapeHtml(yesUrl)}" style="display:inline-block;background:#17202a;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:6px;font-weight:600">Yes, arrange a call</a></p>
      <p><a href="${escapeHtml(noUrl)}" style="color:#505b66">No, stop follow-up emails</a></p>
      <p>Thank you,<br />Office & Co<br />${OUTREACH_EMAIL}</p>
    </div>
  `;
}

function createResponseToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hashResponseToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

async function sendCampaign(req: Request, payload: SendOutreachRequest) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const sender = OUTREACH_FROM;
  const authorization = req.headers.get("Authorization");
  const name = payload.campaignName?.trim() || "Crawler prospect campaign";
  const subject = payload.subject?.trim() || "";
  const body = payload.body?.trim() || "";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Campaign service is not configured." }, 500);
  }
  if (!authorization) return json({ error: "Sign in to send a campaign." }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await userClient.auth.getUser();
  if (authError || !userData.user) return json({ error: "Sign in to send a campaign." }, 401);
  const { data: roles, error: roleError } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  if (roleError) return json({ error: "Could not verify your platform role." }, 403);
  if (!(roles ?? []).some(({ role }) => ["sales_manager", "crm_manager", "group_ceo", "superadmin"].includes(String(role)))) {
    return json({ error: "Sales or executive access is required to send campaigns." }, 403);
  }
  if (payload.consentConfirmed !== true) {
    return json({ error: "Confirm that all campaign recipients have explicitly opted in." }, 400);
  }
  const prospectIds = [...new Set((payload.prospectIds ?? []).filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))];
  if (!prospectIds.length || prospectIds.length > 500) {
    return json({ error: "Select between 1 and 500 prospects for this campaign." }, 400);
  }
  if (name.length > 120 || subject.length < 1 || subject.length > 200 || body.length < 1 || body.length > 5000) {
    return json({ error: "Campaign name, subject, or message is outside the allowed length." }, 400);
  }
  if (!Deno.env.get("SMTP_HOST") || !Deno.env.get("SMTP_USER") || !Deno.env.get("SMTP_PASS")) {
    return json({ error: "SMTP delivery is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_PORT secrets." }, 503);
  }
  if (Number(Deno.env.get("SMTP_PORT") ?? "465") !== 465) {
    return json({ error: "Supabase SMTP delivery requires implicit TLS on port 465; ports 25 and 587 are blocked." }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const recipientsByEmail = new Map<string, CampaignRecipient>();
  for (let offset = 0; offset < 10_000; offset += 1000) {
    const { data, error } = await admin
      .from("prospect_contacts")
      .select("prospect_id,value,prospect_profiles(company_name)")
      .eq("kind", "email")
      .in("prospect_id", prospectIds)
      .range(offset, offset + 999);
    if (error) return json({ error: "Could not load crawler-captured email addresses." }, 500);
    for (const contact of data ?? []) {
      const email = String(contact.value ?? "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
      const key = email.toLowerCase();
      const relation = contact.prospect_profiles;
      const profile = Array.isArray(relation) ? relation[0] : relation;
      if (!recipientsByEmail.has(key)) {
        recipientsByEmail.set(key, {
          prospectId: String(contact.prospect_id),
          email,
          companyName: profile?.company_name ? String(profile.company_name) : null,
        });
      }
    }
    if ((data ?? []).length < 1000) break;
  }

  const suppressedEmails = new Set<string>();
  for (let offset = 0; offset < 10_000; offset += 1000) {
    const { data, error } = await admin
      .from("outreach_deliveries")
      .select("recipient_email")
      .in("status", ["unsubscribed", "bounced"])
      .range(offset, offset + 999);
    if (error) return json({ error: "Could not verify campaign suppressions." }, 500);
    for (const delivery of data ?? []) {
      suppressedEmails.add(String(delivery.recipient_email).toLowerCase());
    }
    if ((data ?? []).length < 1000) break;
  }

  const eligibleRecipients = [...recipientsByEmail.values()].filter(
    (recipient) => !suppressedEmails.has(recipient.email.toLowerCase()),
  );
  const suppressed = recipientsByEmail.size - eligibleRecipients.length;
  if (!eligibleRecipients.length) {
    return json({ error: "No eligible captured email addresses remain after suppression." }, 409);
  }

  const { data: campaign, error: campaignError } = await admin
    .from("outreach_campaigns")
    .insert({
      name,
      subject,
      template: body,
      status: "sending",
      created_by: userData.user.id,
    })
    .select("id")
    .single();
  if (campaignError || !campaign) {
    return json({ error: campaignError?.message ?? "Could not create campaign record." }, 500);
  }

  let sent = 0;
  let failed = 0;
  let providerError: string | null = null;

  for (const recipient of eligibleRecipients) {
    const { data: delivery, error: deliveryInsertError } = await admin
      .from("outreach_deliveries")
      .insert({
        campaign_id: campaign.id,
        prospect_id: recipient.prospectId,
        recipient_email: recipient.email,
        company_name: recipient.companyName,
        callback_preference: "unspecified",
        consent_status: "explicitly_opted_in",
        subject,
        template_version: "campaign-v1",
        status: "queued",
        metadata: { campaign_name: name, sender, reply_to: OUTREACH_EMAIL, source: "crawler_contacts" },
      })
      .select("id")
      .single();
    if (deliveryInsertError || !delivery) {
      failed += 1;
      providerError ??= deliveryInsertError?.message ?? "Could not record a campaign delivery.";
      continue;
    }

    const responseToken = createResponseToken();
    const { error: tokenError } = await admin.from("outreach_response_tokens").insert({
      delivery_id: delivery.id,
      token_hash: await hashResponseToken(responseToken),
      expires_at: null,
    });
    if (tokenError) {
      await admin.from("outreach_deliveries").update({ status: "failed" }).eq("id", delivery.id);
      failed += 1;
      providerError ??= "Could not create a secure unsubscribe link.";
      continue;
    }

    const unsubscribeUrl = new URL("/functions/v1/outreach-response", supabaseUrl);
    unsubscribeUrl.searchParams.set("token", responseToken);
    unsubscribeUrl.searchParams.set("response", "no");
    const unsubscribeLink = unsubscribeUrl.toString();
    const html = `<div style="font-family:Arial,sans-serif;color:#111827;line-height:1.6;max-width:640px;margin:0 auto"><p>Hello,</p><p>${escapeHtml(body).replace(/\r?\n/g, "<br>")}</p><p>To opt out of future marketing emails, <a href="${escapeHtml(unsubscribeLink)}">unsubscribe here</a>.</p><p>Regards,<br>Office &amp; Co<br>${OUTREACH_EMAIL}</p></div>`;
    const text = `Hello,\n\n${body}\n\nTo opt out of future marketing emails, unsubscribe here: ${unsubscribeLink}\n\nRegards,\nOffice & Co\n${OUTREACH_EMAIL}`;

    try {
      const smtpResponse = await sendSmtpEmail({ to: recipient.email, subject, html, text });
      const sentAt = new Date().toISOString();
      const { error: deliveryUpdateError } = await admin
        .from("outreach_deliveries")
        .update({
          provider_message_id: smtpResponse.slice(0, 500),
          status: "sent",
          sent_at: sentAt,
        })
        .eq("id", delivery.id);
      if (deliveryUpdateError) {
        console.error("SMTP accepted a campaign message but delivery status could not be updated", deliveryUpdateError);
      }
      sent += 1;
    } catch (error) {
      providerError = error instanceof Error ? error.message : "Campaign delivery failed.";
      await admin.from("outreach_response_tokens").delete().eq("delivery_id", delivery.id);
      const { error: deliveryUpdateError } = await admin
        .from("outreach_deliveries")
        .update({
          status: "failed",
          metadata: { campaign_name: name, sender, reply_to: OUTREACH_EMAIL, source: "crawler_contacts", error: providerError },
        })
        .eq("id", delivery.id);
      if (deliveryUpdateError) console.error("Failed to record SMTP delivery failure", deliveryUpdateError);
      failed += 1;
    }
  }

  const completedAt = new Date().toISOString();
  await admin
    .from("outreach_campaigns")
    .update({ status: failed ? "paused" : "sent", sent_at: failed ? null : completedAt })
    .eq("id", campaign.id);

  return json({
    ok: true,
    status: failed ? "partial" : "sent",
    campaignId: campaign.id,
    sent,
    failed,
    suppressed,
    providerError,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = (await req.json().catch(() => ({}))) as SendOutreachRequest;
    if (payload.action === "campaign") return await sendCampaign(req, payload);
    const toEmail = payload.toEmail?.trim();
    const subject = (payload.subject || "Quick question from Office & Co").trim();
    const body = payload.body?.trim();
    const campaignName = payload.campaignName?.trim() || "Prospect follow-up";
    const callbackPreference = payload.callbackPreference || "unspecified";
    const consentStatus = payload.consentStatus || "requires_confirmation";

    if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
      return json({ error: "A valid recipient email address is required." }, 400);
    }
    if (subject.length > 200 || !subject || (body?.length ?? 0) > 5000) {
      return json({ error: "The subject or message is outside the allowed length." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authorization = req.headers.get("Authorization");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ error: "Outreach service is not configured." }, 500);
    }
    if (!authorization) return json({ error: "Sign in to send outreach." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData.user) return json({ error: "Sign in to send outreach." }, 401);
    const { data: roles, error: roleError } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id);
    if (roleError) return json({ error: "Could not verify your platform role." }, 403);
    if (!(roles ?? []).some(({ role }) => ["sales_manager", "crm_manager", "group_ceo", "superadmin"].includes(String(role)))) {
      return json({ error: "Sales or executive access is required to send outreach." }, 403);
    }

    const sender = OUTREACH_FROM;
    if (!Deno.env.get("SMTP_HOST") || !Deno.env.get("SMTP_USER") || !Deno.env.get("SMTP_PASS")) {
      return json({
        error: "SMTP delivery is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS, and SMTP_PORT secrets.",
      }, 503);
    }
    if (Number(Deno.env.get("SMTP_PORT") ?? "465") !== 465) {
      return json({ error: "Supabase SMTP delivery requires implicit TLS on port 465; ports 25 and 587 are blocked." }, 503);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: suppressedDelivery, error: suppressionError } = await admin
      .from("outreach_deliveries")
      .select("id")
      .ilike("recipient_email", toEmail)
      .in("status", ["unsubscribed", "bounced"])
      .limit(1)
      .maybeSingle();
    if (suppressionError) return json({ error: "Could not verify recipient suppressions." }, 500);
    if (suppressedDelivery) {
      return json({ error: "This recipient has opted out or bounced and cannot be contacted." }, 409);
    }
    const deliveryMetadata = {
      campaign_name: campaignName,
      prospect_id: payload.prospectId || null,
      contact_name: payload.contactName?.trim() || null,
      branch_name: null,
      sender,
      reply_to: OUTREACH_EMAIL,
      created_by: userData.user.id,
    };
    const { data: delivery, error: deliveryError } = await admin
      .from("outreach_deliveries")
      .insert({
        prospect_id: payload.prospectId || null,
        recipient_email: toEmail,
        company_name: payload.companyName?.trim() || null,
        callback_preference: callbackPreference,
        consent_status: consentStatus,
        subject,
        template_version: "v1",
        status: "queued",
        metadata: deliveryMetadata,
      })
      .select("id")
      .single();
    if (deliveryError || !delivery) {
      return json({ error: deliveryError?.message ?? "Could not create the outreach record." }, 500);
    }

    const responseToken = createResponseToken();
    const { error: tokenError } = await admin.from("outreach_response_tokens").insert({
      delivery_id: delivery.id,
      token_hash: await hashResponseToken(responseToken),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
    if (tokenError) {
      await admin.from("outreach_deliveries").update({ status: "failed" }).eq("id", delivery.id);
      return json({ error: "Could not create secure response links." }, 500);
    }

    const yesUrl = new URL("/functions/v1/outreach-response", supabaseUrl);
    yesUrl.searchParams.set("token", responseToken);
    yesUrl.searchParams.set("response", "yes");
    const noUrl = new URL("/functions/v1/outreach-response", supabaseUrl);
    noUrl.searchParams.set("token", responseToken);
    noUrl.searchParams.set("response", "no");

    const emailPayload = { ...payload, body, callbackPreference, consentStatus };
    const text = buildBodyText(emailPayload, yesUrl.toString(), noUrl.toString());
    const html = buildHtml(emailPayload, yesUrl.toString(), noUrl.toString());

    let smtpResponse: string;
    try {
      smtpResponse = await sendSmtpEmail({ to: toEmail, subject, html, text });
    } catch (error) {
      const message = error instanceof Error ? error.message : "SMTP rejected the email.";
      await admin.from("outreach_response_tokens").delete().eq("delivery_id", delivery.id);
      await admin
        .from("outreach_deliveries")
        .update({ status: "failed", metadata: { ...deliveryMetadata, error: message } })
        .eq("id", delivery.id);
      return json({ error: message }, 502);
    }

    const { error: updateError } = await admin.from("outreach_deliveries").update({
      provider_message_id: smtpResponse.slice(0, 500),
      status: "sent",
      sent_at: new Date().toISOString(),
    }).eq("id", delivery.id);
    if (updateError) console.error("Failed to update outreach delivery", updateError);

    return json(
      {
        ok: true,
        status: "sent",
        messageId: smtpResponse.slice(0, 500),
        recipient: toEmail,
        subject,
        consentStatus,
        callbackPreference,
      },
      200,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "An unexpected error occurred.";
    return json({ error: message }, 500);
  }
});
