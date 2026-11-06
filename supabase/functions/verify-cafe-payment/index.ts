import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !paystackSecret) {
    return json({ error: "Café payment verification is not configured." }, 503);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "Sign in to verify this café payment." }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await userClient.auth.getUser();
  if (authError || !userData.user) return json({ error: "Sign in to verify this café payment." }, 401);

  let reference: string;
  try {
    const body = await request.json();
    reference = String(body.reference ?? "");
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }
  if (!/^oco-cafe-[0-9a-f-]{36}-[0-9a-f-]{36}$/i.test(reference)) {
    return json({ error: "A valid café payment reference is required." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: order, error: orderError } = await admin
    .from("cafe_orders")
    .select("id,amount_zar,payment_status,method,payment_reference")
    .eq("payment_reference", reference)
    .eq("profile_id", userData.user.id)
    .maybeSingle();
  if (orderError) return json({ error: "Could not load the café order." }, 500);
  if (!order || order.method !== "Paystack") return json({ error: "Café payment not found." }, 404);
  if (order.payment_status === "Paid") return json({ paid: true, order_id: order.id });
  if (order.payment_status !== "Pending verification") return json({ error: "This café order is not awaiting payment." }, 409);

  let response: Response;
  try {
    response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${paystackSecret}` },
    });
  } catch {
    return json({ error: "Paystack could not be reached to verify payment." }, 502);
  }
  const result = await response.json().catch(() => null);
  const payment = result?.data;
  if (!response.ok || result?.status !== true) return json({ error: "Paystack could not verify this payment." }, 502);
  if (payment?.status !== "success") return json({ paid: false, order_id: order.id, status: payment?.status ?? "pending" });
  if (payment.reference !== reference || Number(payment.amount) !== Number(order.amount_zar) * 100 || payment.currency !== "ZAR") {
    return json({ error: "Verified payment details do not match this café order." }, 400);
  }

  const paidAt = payment.paid_at ? new Date(payment.paid_at).toISOString() : new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from("cafe_orders")
    .update({ payment_status: "Paid", paid_at: paidAt, status: "queued" })
    .eq("id", order.id)
    .eq("payment_reference", reference)
    .eq("payment_status", "Pending verification")
    .select("id")
    .maybeSingle();
  if (updateError) return json({ error: "Could not confirm the café payment." }, 500);
  if (updated) {
    await admin.from("audit_log").insert({
      entity: "cafe_order",
      entity_id: order.id,
      action: "payment_confirmed",
      diff: { provider: "paystack", reference, amount_zar: order.amount_zar },
    });
  }
  return json({ paid: true, order_id: order.id });
});
