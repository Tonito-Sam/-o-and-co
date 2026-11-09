import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const officeCoEmailDomains = ["@officeandco.co.za", "@officeandco.co.ca"];

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
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Staff account deletion is not configured." }, 503);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "Sign in as a superadmin to delete staff accounts." }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await userClient.auth.getUser();
  if (authError || !userData.user) {
    return json({ error: "Sign in as a superadmin to delete staff accounts." }, 401);
  }

  const { data: actorRoles, error: actorRoleError } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  if (actorRoleError) return json({ error: "Could not verify your platform role." }, 403);
  if (!(actorRoles ?? []).some(({ role }) => role === "superadmin")) {
    return json({ error: "Superadmin access is required to delete staff accounts." }, 403);
  }

  let userId: string;
  try {
    const body = await request.json();
    userId = String(body.user_id ?? "");
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return json({ error: "A valid staff account id is required." }, 400);
  }
  if (userId === userData.user.id) {
    return json({ error: "You cannot delete your own account." }, 409);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,email")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) return json({ error: "Could not verify the selected staff account." }, 500);
  if (!profile?.email) return json({ error: "Staff profile not found." }, 404);
  if (!officeCoEmailDomains.some((domain) => profile.email!.trim().toLowerCase().endsWith(domain))) {
    return json({ error: "Only Office & Co staff accounts can be deleted here." }, 403);
  }

  const { data: targetRoles, error: targetRoleError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (targetRoleError) return json({ error: "Could not verify the selected account's roles." }, 500);
  if ((targetRoles ?? []).some(({ role }) => ["superadmin", "group_ceo"].includes(String(role)))) {
    return json({ error: "Superadmin and Group CEO accounts cannot be deleted from the staff directory." }, 409);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) return json({ error: "Could not delete the selected staff account." }, 500);

  return json({ deleted_user_id: userId, email: profile.email });
});