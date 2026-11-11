import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const officeCoEmailDomains = ["@officeandco.co.za", "@officeandco.co.ca"];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    return json({ error: "Platform account management is not configured." }, 503);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ error: "Sign in as a superadmin to manage accounts." }, 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await userClient.auth.getUser();
  if (authError || !userData.user) return json({ error: "Sign in as a superadmin to manage accounts." }, 401);

  const { data: actorRoles, error: actorRoleError } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  if (actorRoleError) return json({ error: "Could not verify your platform role." }, 403);
  if (!(actorRoles ?? []).some(({ role }) => role === "superadmin")) {
    return json({ error: "Superadmin access is required to manage accounts." }, 403);
  }

  let body: { user_id?: unknown; organization_id?: unknown; account_type?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }
  const accountType = body.account_type;
  const action = body.action;
  const accountId = String(accountType === "tenant" ? body.organization_id ?? "" : body.user_id ?? "");
  if (!uuidPattern.test(accountId) || !["staff", "tenant"].includes(String(accountType))) {
    return json({ error: "A valid account id and account type are required." }, 400);
  }
  if (!["delete", "suspend", "activate"].includes(String(action))) {
    return json({ error: "Choose a supported account action." }, 400);
  }
  if (accountType === "staff" && accountId === userData.user.id) return json({ error: "You cannot change your own account here." }, 409);
  if (accountType === "staff" && action !== "delete") {
    return json({ error: "Only tenant accounts can be suspended or reactivated here." }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (accountType === "tenant") {
    const { data: organization, error: organizationError } = await admin
      .from("organizations")
      .select("id")
      .eq("id", accountId)
      .maybeSingle();
    if (organizationError) return json({ error: "Could not verify the organization account." }, 500);
    if (!organization) return json({ error: "Organization account not found." }, 404);

    if (action === "suspend" || action === "activate") {
      const { data: memberships, error: updateError } = await admin
        .from("organization_members")
        .update({ status: action === "suspend" ? "suspended" : "active" })
        .eq("organization_id", accountId)
        .select("user_id");
      if (updateError) return json({ error: `Could not update tenant access: ${updateError.message}` }, 500);
      if (!memberships?.length) return json({ error: "This organization has no members whose access can be changed." }, 409);
      return json({ organization_id: accountId, status: action === "suspend" ? "suspended" : "active" });
    }

    const { data: lease, error: leaseError } = await admin
      .from("tenants")
      .select("id")
      .eq("organization_id", accountId)
      .limit(1)
      .maybeSingle();
    if (leaseError) return json({ error: "Could not verify the organization lease history." }, 500);
    if (lease) return json({ error: "This organization has lease records and cannot be removed. Suspend access instead." }, 409);

    const { data: deletedOrganization, error: deleteOrganizationError } = await admin
      .from("organizations")
      .delete()
      .eq("id", accountId)
      .select("id")
      .maybeSingle();
    if (deleteOrganizationError) return json({ error: `Could not remove the organization account: ${deleteOrganizationError.message}` }, 500);
    if (!deletedOrganization) return json({ error: "Organization account not found." }, 404);
    return json({ deleted_organization_id: accountId });
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,email")
    .eq("id", accountId)
    .maybeSingle();
  if (profileError) return json({ error: "Could not verify the selected account." }, 500);
  if (!profile) return json({ error: "Account profile not found." }, 404);

  const { data: targetRoles, error: targetRoleError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", accountId);
  if (targetRoleError) return json({ error: "Could not verify the selected account's roles." }, 500);
  if ((targetRoles ?? []).some(({ role }) => ["superadmin", "group_ceo"].includes(String(role)))) {
    return json({ error: "Superadmin and Group CEO accounts cannot be changed here." }, 409);
  }

  const normalizedEmail = profile.email?.trim().toLowerCase() ?? "";
  if (!officeCoEmailDomains.some((domain) => normalizedEmail.endsWith(domain))) {
    return json({ error: "Only Office & Co staff accounts can be deleted here." }, 403);
  }

  const preserveOperations = [
    admin.from("union_station_approvals").update({ actor_id: userData.user.id }).eq("actor_id", accountId),
    admin.from("community_post_warnings").update({ issued_by: userData.user.id }).eq("issued_by", accountId),
    admin.from("organizations").update({ created_by: userData.user.id }).eq("created_by", accountId),
    admin.from("organization_invite_codes").update({ created_by: userData.user.id }).eq("created_by", accountId),
    admin.from("organization_invite_codes").update({ consumed_by: null }).eq("consumed_by", accountId),
    admin.from("leads").update({ owner_id: null }).eq("owner_id", accountId),
    admin.from("events").update({ created_by: null }).eq("created_by", accountId),
    admin.from("community_posts").update({ approved_by: null }).eq("approved_by", accountId),
    admin.from("community_post_reports").update({ reviewed_by: null }).eq("reviewed_by", accountId),
    admin.from("cafe_orders").update({ profile_id: null }).eq("profile_id", accountId),
    admin.from("marketplace_listings").update({ seller_id: null }).eq("seller_id", accountId),
    admin.from("support_tickets").update({ raised_by: null }).eq("raised_by", accountId),
    admin.from("support_tickets").update({ assignee_id: null }).eq("assignee_id", accountId),
    admin.from("messaging_channels").update({ created_by: null }).eq("created_by", accountId),
    admin.from("direct_threads").update({ created_by: null }).eq("created_by", accountId),
    admin.from("audit_log").update({ actor_id: null }).eq("actor_id", accountId),
  ];
  const preservationResults = await Promise.all(preserveOperations);
  const preservationError = preservationResults.find(({ error }) => error)?.error;
  if (preservationError) {
    return json({ error: `Could not preserve account history before deletion: ${preservationError.message}` }, 500);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(accountId);
  if (deleteError) return json({ error: `Could not delete the selected account: ${deleteError.message}` }, 500);
  return json({ deleted_user_id: accountId, account_type: accountType });
});
