import { createClient } from "npm:@supabase/supabase-js@2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

async function signatureFor(body: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!secret || !supabaseUrl || !serviceRoleKey) return json({ error: "Payment webhook is not configured." }, 503);

  const body = await request.text();
  const receivedSignature = request.headers.get("x-paystack-signature") ?? "";
  const expectedSignature = await signatureFor(body, secret);
  if (!constantTimeEqual(receivedSignature.toLowerCase(), expectedSignature)) {
    return json({ error: "Invalid webhook signature." }, 401);
  }

  let event: { event?: string; data?: { reference?: string; status?: string; amount?: number; currency?: string } };
  try {
    event = JSON.parse(body);
  } catch {
    return json({ error: "Invalid webhook payload." }, 400);
  }
  if (event.event !== "charge.success") return json({ received: true });
  const payment = event.data;
  const reference = payment?.reference;
  if (!reference || payment?.status !== "success") return json({ error: "Invalid payment event." }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: order, error: orderError } = await admin
    .from("cafe_orders")
    .select("id,amount_zar,payment_status,method,payment_reference")
    .eq("payment_reference", reference)
    .maybeSingle();
  if (orderError) return json({ error: "Could not load the café payment." }, 500);
  if (!order || order.method !== "Paystack") return json({ error: "Café payment not found." }, 404);
  if (Number(payment.amount) !== Number(order.amount_zar) * 100 || payment.currency !== "ZAR") {
    return json({ error: "Payment amount or currency does not match the café order." }, 400);
  }
  if (order.payment_status === "Paid") return json({ received: true });
  if (order.payment_status !== "Pending verification") return json({ error: "Café order is not awaiting payment." }, 409);

  const paidAt = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from("cafe_orders")
    .update({ payment_status: "Paid", paid_at: paidAt, status: "queued" })
    .eq("id", order.id)
    .eq("payment_reference", reference)
    .eq("payment_status", "Pending verification")
    .select("id")
    .maybeSingle();
  if (updateError) return json({ error: "Could not confirm the café payment." }, 500);
  if (!updated) return json({ received: true });

  await admin.from("audit_log").insert({
    entity: "cafe_order",
    entity_id: order.id,
    action: "payment_confirmed",
    diff: { provider: "paystack", reference, amount_zar: order.amount_zar },
  });
  return json({ received: true });
});
