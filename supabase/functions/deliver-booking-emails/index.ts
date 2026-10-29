import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type EmailEvent = "request_received" | "finance_quote_ready" | "invoice_sent" | "booking_confirmed" | "booking_declined";
type OutboxRow = {
  id: string;
  booking_id: string;
  event: EmailEvent;
  recipient_email: string;
  payload: Record<string, unknown>;
  attempts: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function emailContent(row: OutboxRow) {
  const data = row.payload;
  const internal = data.internal === true;
  const reference = String(data.request_reference ?? "Booking request");
  const branch = String(data.branch_name ?? "Office & Co");
  const space = String(data.space_name ?? "Requested space");
  const date = String(data.booking_date ?? "To be confirmed");
  const time = `${String(data.starts_at ?? "")}–${String(data.ends_at ?? "")}`;
  const guests = String(data.guests ?? "");
  const detailRows = [
    ["Request", reference],
    ["Branch", branch],
    ["Space", space],
    ["Date and time", `${date} ${time}`],
    ["Guests", guests],
  ];
  let subject = "";
  let heading = "";
  let intro = "";

  if (row.event === "request_received") {
    subject = internal ? `New booking request · ${branch}` : `We received your space request · ${reference}`;
    heading = internal ? "New space request" : `Thanks${data.contact_name ? `, ${String(data.contact_name)}` : ""}. We received your request.`;
    intro = internal
      ? `${String(data.company_name ?? "A visitor")} has requested a space. Review it in WorkspaceOS under Bookings.`
      : "This is a request, not a confirmed booking. The branch team will check availability and follow up with you.";
  } else if (row.event === "finance_quote_ready") {
    subject = `Booking quote ready for Finance · ${reference}`;
    heading = "A branch quote is ready for Finance";
    intro = `Review and issue the invoice in WorkspaceOS Billing. Proposed quote: R${Number(data.quote_amount_zar ?? 0).toLocaleString("en-ZA")}.`;
    detailRows.push(["Quote notes", String(data.quote_notes ?? "None provided")]);
  } else if (row.event === "invoice_sent") {
    subject = `Your booking invoice · ${String(data.invoice_reference ?? reference)}`;
    heading = "Your space request has been priced";
    intro = `Finance has issued invoice ${String(data.invoice_reference ?? "")}. The booking remains unconfirmed until payment and branch confirmation.`;
    detailRows.push(["Amount", `R${Number(data.amount_zar ?? 0).toLocaleString("en-ZA")}`]);
    detailRows.push(["Payment due", String(data.due_at ?? "See invoice")]);
  } else if (row.event === "booking_confirmed") {
    subject = `Your booking is confirmed · ${reference}`;
    heading = "Your booking is confirmed";
    intro = `The ${branch} team has confirmed your space request. Your invoice reference is ${String(data.invoice_reference ?? "")}.`;
  } else {
    subject = `Update on your space request · ${reference}`;
    heading = "We could not confirm this request";
    intro = `The ${branch} team could not confirm the requested space and time. Please contact us if you would like help finding another option.`;
  }

  const rows = detailRows.map(([label, value]) => `<tr><td style="padding:6px 12px 6px 0;color:#667085">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:600">${escapeHtml(value)}</td></tr>`).join("");
  const html = `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#202733;line-height:1.55"><h2 style="font-size:22px">${escapeHtml(heading)}</h2><p>${escapeHtml(intro)}</p><table style="border-collapse:collapse;margin:20px 0">${rows}</table>${!internal && row.event === "request_received" ? "<p>We will contact you by email or phone after checking the space and requested time. Please do not treat this as a reservation.</p>" : ""}<p style="color:#667085;font-size:13px">Office &amp; Co · Workspace bookings</p></div>`;
  const text = [heading, intro, ...detailRows.map(([label, value]) => `${label}: ${value}`), "Office & Co"].join("\n\n");
  return { subject, html, text };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const sender = Deno.env.get("EMAIL_FROM");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Booking email service is not configured." }, 503);
  if (!apiKey || !sender) return json({ error: "Set RESEND_API_KEY and EMAIL_FROM to enable booking emails." }, 503);

  let bookingId: string;
  let dispatchToken: string;
  try {
    const body = await request.json();
    bookingId = String(body.booking_id ?? "");
    dispatchToken = String(body.email_token ?? "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bookingId)) {
      return json({ error: "A valid booking request id is required." }, 400);
    }
    if (!/^[0-9a-f-]{72}$/i.test(dispatchToken)) return json({ error: "A valid email delivery token is required." }, 400);
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authorizedBooking, error: authorizationError } = await admin
    .from("bookings")
    .select("id")
    .eq("id", bookingId)
    .eq("email_dispatch_token", dispatchToken)
    .maybeSingle();
  if (authorizationError) return json({ error: "Could not authorize booking email delivery." }, 500);
  if (!authorizedBooking) return json({ error: "Booking email delivery is not authorized." }, 403);

  const { data: rows, error: queryError } = await admin
    .from("booking_email_outbox")
    .select("id,booking_id,event,recipient_email,payload,attempts")
    .eq("booking_id", bookingId)
    .in("status", ["pending", "failed"])
    .order("created_at", { ascending: true })
    .limit(50);
  if (queryError) return json({ error: "Could not load booking email deliveries." }, 500);

  let sent = 0;
  let failed = 0;
  for (const row of (rows ?? []) as OutboxRow[]) {
    const { data: claimed, error: claimError } = await admin
      .from("booking_email_outbox")
      .update({ status: "sending", attempts: row.attempts + 1, last_error: null })
      .eq("id", row.id)
      .in("status", ["pending", "failed"])
      .select("id")
      .maybeSingle();
    if (claimError || !claimed) continue;

    try {
      const content = emailContent(row);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: sender,
          to: [row.recipient_email],
          subject: content.subject,
          html: content.html,
          text: content.text,
        }),
      });
      if (!response.ok) throw new Error(`Email provider returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
      await admin.from("booking_email_outbox").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", row.id);
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email delivery failed.";
      await admin.from("booking_email_outbox").update({ status: "failed", last_error: message.slice(0, 1000) }).eq("id", row.id);
      failed += 1;
    }
  }

  const { count, error: remainingError } = await admin
    .from("booking_email_outbox")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId)
    .in("status", ["pending", "failed", "sending"]);
  if (!remainingError && count === 0) {
    await admin.from("bookings").update({ email_dispatch_token: null }).eq("id", bookingId);
  }

  return json({ sent, failed });
});
