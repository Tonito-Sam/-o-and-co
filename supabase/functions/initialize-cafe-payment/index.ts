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
  const siteUrl = Deno.env.get("SITE_URL")?.replace(/\/$/, "");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !paystackSecret || !siteUrl) {
    return json({ error: "Café payment service is not configured." }, 503);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "Sign in before starting payment." }, 401);
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await userClient.auth.getUser();
  if (authError || !userData.user) return json({ error: "Sign in before starting payment." }, 401);

  let orderId: string;
  try {
    const body = await request.json();
    orderId = String(body.order_id ?? "");
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
    return json({ error: "A valid café order id is required." }, 400);
  }
  if (!userData.user.email) return json({ error: "Your account needs a verified email before payment." }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: order, error: orderError } = await admin
    .from("cafe_orders")
    .select("id,profile_id,amount_zar,method,status,payment_status,payment_reference,payment_authorization_url")
    .eq("id", orderId)
    .eq("profile_id", userData.user.id)
    .maybeSingle();
  if (orderError) return json({ error: "Could not load the café order." }, 500);
  if (!order) return json({ error: "Café order not found." }, 404);
  if (order.method !== "Paystack" || order.status !== "awaiting_payment") {
    return json({ error: "This order is not awaiting Paystack payment." }, 409);
  }
  if (order.payment_status === "Paid") return json({ error: "This café order is already paid." }, 409);
  if (order.payment_reference && order.payment_authorization_url) {
    return json({ authorization_url: order.payment_authorization_url });
  }
  if (order.payment_reference) {
    return json({ error: "Payment initialization is already in progress. Refresh the order shortly." }, 409);
  }

  const reference = `oco-cafe-${order.id}-${crypto.randomUUID()}`;
  let response: Response;
  try {
    response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${paystackSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: userData.user.email,
        amount: Number(order.amount_zar) * 100,
        currency: "ZAR",
        reference,
        callback_url: `${siteUrl}/cafe?payment_reference=${encodeURIComponent(reference)}`,
        metadata: { cafe_order_id: order.id, profile_id: userData.user.id },
      }),
    });
  } catch {
    return json({ error: "Paystack could not be reached. Your order remains awaiting payment." }, 502);
  }
  const paymentResult = await response.json().catch(() => null);
  if (!response.ok || paymentResult?.status !== true || !paymentResult?.data?.authorization_url) {
    return json({ error: "Paystack could not initialize this payment." }, 502);
  }

  const { data: updatedOrder, error: updateError } = await admin
    .from("cafe_orders")
    .update({
      payment_reference: reference,
      payment_authorization_url: paymentResult.data.authorization_url,
    })
    .eq("id", order.id)
    .eq("payment_status", "Pending verification")
    .is("payment_reference", null)
    .select("id")
    .maybeSingle();
  if (updateError || !updatedOrder) {
    return json({ error: "Payment was initialized but could not be linked to the order. Contact support before retrying." }, 500);
  }

  return json({ authorization_url: paymentResult.data.authorization_url });
});
