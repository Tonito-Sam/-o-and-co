import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

type ResponseChoice = "yes" | "no";

function htmlResponse(content: string, status = 200) {
  return new Response(content, {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
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

function confirmationPage(token: string, choice: ResponseChoice) {
  const title = choice === "yes" ? "Confirm your request" : "Confirm you want us to stop";
  const message = choice === "yes"
    ? "Confirm that you would like Office & Co to arrange a short call."
    : "Confirm that you want Office & Co to stop follow-up emails.";
  const button = choice === "yes" ? "Yes, confirm my request" : "Yes, stop follow-up emails";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | Office &amp; Co</title>
  <style>
    body{margin:0;background:#f7f7f5;color:#17202a;font:16px/1.5 Arial,sans-serif}
    main{max-width:440px;margin:12vh auto;padding:32px 24px;background:#fff;border:1px solid #deded8;border-radius:8px}
    h1{font-size:22px;margin:0 0 12px}p{color:#505b66;margin:0 0 24px}
    button{border:0;border-radius:6px;background:#17202a;color:#fff;font-size:15px;font-weight:600;padding:12px 16px;cursor:pointer}
  </style>
</head>
<body><main><h1>${title}</h1><p>${message}</p>
<form method="post" action="?token=${encodeURIComponent(token)}">
  <input type="hidden" name="response" value="${choice}">
  <button type="submit">${button}</button>
</form></main></body></html>`;
}

function resultPage(title: string, message: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)} | Office &amp; Co</title><style>body{margin:0;background:#f7f7f5;color:#17202a;font:16px/1.5 Arial,sans-serif}main{max-width:440px;margin:12vh auto;padding:32px 24px;background:#fff;border:1px solid #deded8;border-radius:8px}h1{font-size:22px;margin:0 0 12px}p{color:#505b66;margin:0}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></main></body></html>`;
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function renderTemplate(value: string, replacements: Record<string, string>) {
  return value.replace(/\{\{([a-z_]+)\}\}/gi, (placeholder, key: string) =>
    replacements[key] ?? placeholder,
  );
}

function getAdminClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Response service is not configured.");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function sendResponseFollowUp(
  admin: ReturnType<typeof getAdminClient>,
  delivery: {
    id: string;
    prospect_id: string | null;
    recipient_email: string;
    company_name: string | null;
    metadata: Record<string, unknown> | null;
  },
) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("Email delivery is not configured.");

  const { data: template, error: templateError } = await admin
    .from("crm_email_templates")
    .select("subject,body,enabled")
    .eq("id", "reply_follow_up")
    .maybeSingle();
  if (templateError) throw new Error("Could not load the response follow-up template.");
  if (!template?.enabled) return;

  const metadata = delivery.metadata ?? {};
  const replacements: Record<string, string> = {
    contact_name: String(metadata.contact_name ?? "there"),
    company_name: delivery.company_name ?? "your company",
    branch_name: String(metadata.branch_name ?? "your preferred branch"),
    available_spaces: String(metadata.available_spaces ?? "Our team will confirm suitable current options with you shortly."),
    availability_checked_at: String(metadata.availability_checked_at ?? ""),
    reply_summary: "You asked us to arrange a short call.",
    tour_date: "",
    tour_time: "",
    tour_location: "",
    proposal_link: "",
    contract_link: "",
    onboarding_link: "",
  };
  const subject = renderTemplate(template.subject, replacements);
  const text = renderTemplate(template.body, replacements);
  const html = `<div style="font-family:Arial,sans-serif;color:#17202a;line-height:1.6;max-width:640px;margin:0 auto"><p>${escapeHtml(text).replace(/\r?\n/g, "<br>")}</p></div>`;
  const sender = Deno.env.get("EMAIL_FROM") || "Office & Co <hello@officeand.co>";

  const { data: followUp, error: insertError } = await admin
    .from("outreach_deliveries")
    .insert({
      prospect_id: delivery.prospect_id,
      recipient_email: delivery.recipient_email,
      company_name: delivery.company_name,
      callback_preference: "yes",
      consent_status: "requires_confirmation",
      subject,
      template_version: "reply_follow_up",
      status: "queued",
      metadata: {
        source: "confirmed_response_button",
        triggered_by_delivery: delivery.id,
        template_id: "reply_follow_up",
      },
    })
    .select("id")
    .single();
  if (insertError || !followUp) throw new Error("Could not log the response follow-up.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: sender, to: [delivery.recipient_email], subject, html, text }),
  });
  const result = await response.json().catch(() => ({})) as { id?: string; message?: string };
  if (!response.ok) {
    await admin.from("outreach_deliveries").update({ status: "failed" }).eq("id", followUp.id);
    throw new Error(result.message ?? "The follow-up email could not be sent.");
  }

  await admin.from("outreach_deliveries").update({
    provider_message_id: result.id ?? null,
    status: "sent",
    sent_at: new Date().toISOString(),
    metadata: {
      source: "confirmed_response_button",
      triggered_by_delivery: delivery.id,
      template_id: "reply_follow_up",
      sender,
    },
  }).eq("id", followUp.id);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(request.url);
    const token = url.searchParams.get("token") ?? "";
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
      return htmlResponse(resultPage("Link unavailable", "This response link is invalid or incomplete."), 400);
    }

    const admin = getAdminClient();
    const tokenHash = await hashToken(token);
    const { data: action, error } = await admin
      .from("outreach_response_tokens")
      .select("id,delivery_id,expires_at,used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (error || !action || action.used_at || new Date(action.expires_at).getTime() <= Date.now()) {
      return htmlResponse(resultPage("Link unavailable", "This response link has expired or has already been used."), 410);
    }

    if (request.method === "GET") {
      const choice = url.searchParams.get("response");
      if (choice !== "yes" && choice !== "no") {
        return htmlResponse(resultPage("Choose a response", "Please use one of the response buttons in your email."), 400);
      }
      return htmlResponse(confirmationPage(token, choice));
    }

    if (request.method !== "POST") {
      return htmlResponse(resultPage("Method not allowed", "Please use the response buttons in your email."), 405);
    }

    const form = await request.formData();
    const response = form.get("response");
    if (response !== "yes" && response !== "no") {
      return htmlResponse(resultPage("Response not recorded", "Please select a valid response."), 400);
    }

    const usedAt = new Date().toISOString();
    const { data: consumed, error: consumeError } = await admin
      .from("outreach_response_tokens")
      .update({ response, used_at: usedAt })
      .eq("id", action.id)
      .is("used_at", null)
      .gt("expires_at", usedAt)
      .select("delivery_id")
      .maybeSingle();
    if (consumeError || !consumed) {
      return htmlResponse(resultPage("Response already recorded", "This response link has already been used or has expired."), 409);
    }

    const deliveryStatus = response === "no" ? "unsubscribed" : "replied";
    const { data: delivery, error: deliveryError } = await admin
      .from("outreach_deliveries")
      .update({
        callback_preference: response,
        status: deliveryStatus,
        replied_at: usedAt,
      })
      .eq("id", consumed.delivery_id)
      .select("id,prospect_id,recipient_email,company_name,metadata")
      .single();
    if (deliveryError || !delivery) {
      return htmlResponse(resultPage("Response received", "Your response was received, but we could not update the delivery record."), 500);
    }

    if (response === "no") {
      return htmlResponse(resultPage("Follow-ups stopped", "Thanks. We have recorded your choice and will stop follow-up emails."));
    }

    try {
      await sendResponseFollowUp(admin, delivery);
      return htmlResponse(resultPage("Thanks, we’ll be in touch", "Your request is recorded. Office & Co will follow up to arrange a short call."));
    } catch (error) {
      console.error("Response follow-up failed", error);
      return htmlResponse(resultPage("Request recorded", "Your request is recorded. Our team will follow up with you shortly."));
    }
  } catch (error) {
    console.error("Outreach response handler failed", error);
    return htmlResponse(resultPage("Something went wrong", "Your response could not be processed. Please reply to the original email."), 500);
  }
});
