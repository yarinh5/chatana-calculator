// Edge Function: admin-actions
// Single entrypoint for all privileged admin operations.
// Auth: requires a valid Supabase JWT (verify_jwt = true by default).
// Authorization: caller must have an active profile and the admin role.
// Uses SUPABASE_SERVICE_ROLE_KEY internally — never exposed to client.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });
}

async function requireAdmin(authHeader: string | null): Promise<{ userId: string } | Response> {
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const token = authHeader.slice(7);

  // verify user
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser(token);
  if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);

  // check role via service client (bypasses RLS on user_roles)
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [{ data: roleRow }, { data: profileRow }] = await Promise.all([
    admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle(),
    admin.from("profiles").select("is_active").eq("id", userData.user.id).maybeSingle(),
  ]);
  if (!roleRow || !profileRow?.is_active) {
    return json({ error: "Forbidden: active admin role required" }, 403);
  }

  return { userId: userData.user.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = req.headers.get("Authorization");
  const gate = await requireAdmin(auth);
  if (gate instanceof Response) return gate;
  const callerId = gate.userId;

  let body: { action?: string; payload?: Record<string, unknown> };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const action = body.action;
  const p = (body.payload ?? {}) as Record<string, any>;
  if (!action) return json({ error: "Missing action" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    switch (action) {
      case "list_users": {
        const { data: profiles, error } = await admin
          .from("profiles")
          .select("id,email,full_name,is_active,created_at,last_login")
          .order("created_at", { ascending: false });
        if (error) throw error;
        const { data: roles } = await admin.from("user_roles").select("user_id,role");
        const map = new Map<string, string[]>();
        (roles ?? []).forEach((r: any) => {
          const a = map.get(r.user_id) ?? [];
          a.push(r.role);
          map.set(r.user_id, a);
        });
        return json(
          (profiles ?? []).map((u: any) => ({
            ...u,
            roles: map.get(u.id) ?? [],
            isAdmin: (map.get(u.id) ?? []).includes("admin"),
          })),
        );
      }

      case "create_user": {
        const { email, password, fullName } = p;
        if (!email || !password || !fullName) return json({ error: "Missing fields" }, 400);
        const { data, error } = await admin.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (error) throw error;
        return json({ id: data.user?.id, email: data.user?.email });
      }

      case "invite_user": {
        const { email } = p;
        if (!email) return json({ error: "Missing email" }, 400);
        const { error } = await admin.auth.admin.inviteUserByEmail(email);
        if (error) throw error;
        return json({ ok: true });
      }

      case "toggle_active": {
        const { userId, isActive } = p;
        if (!userId || typeof isActive !== "boolean") return json({ error: "Bad payload" }, 400);
        if (!isActive) {
          const { data: isAdminRow } = await admin
            .from("user_roles").select("role")
            .eq("user_id", userId).eq("role", "admin").maybeSingle();
          if (isAdminRow) return json({ error: "Cannot suspend an admin account" }, 400);
        }
        const { error } = await admin.from("profiles").update({ is_active: isActive }).eq("id", userId);
        if (error) throw error;
        return json({ ok: true });
      }

      case "reset_password": {
        const { email, redirectTo } = p;
        if (!email) return json({ error: "Missing email" }, 400);
        const { error } = await admin.auth.resetPasswordForEmail(email, {
          redirectTo: typeof redirectTo === "string" ? redirectTo : undefined,
        });
        if (error) throw error;
        return json({ ok: true });
      }

      case "delete_user": {
        const { userId } = p;
        if (!userId) return json({ error: "Missing userId" }, 400);
        if (userId === callerId) return json({ error: "Cannot delete yourself" }, 400);
        const { data: isAdminRow } = await admin
          .from("user_roles").select("role")
          .eq("user_id", userId).eq("role", "admin").maybeSingle();
        if (isAdminRow) return json({ error: "Cannot delete the super admin" }, 400);
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) throw error;
        return json({ ok: true });
      }

      case "get_user_event": {
        const { userId } = p;
        if (!userId) return json({ error: "Missing userId" }, 400);
        const { data, error } = await admin
          .from("events").select("id,event_name")
          .eq("owner_id", userId)
          .order("created_at", { ascending: true })
          .limit(1).maybeSingle();
        if (error) throw error;
        return json(data);
      }

      case "update_user": {
        const { userId, fullName, email, password } = p;
        if (!userId) return json({ error: "Missing userId" }, 400);
        const authUpdate: any = {};
        if (email) authUpdate.email = email;
        if (password) authUpdate.password = password;
        if (fullName) authUpdate.user_metadata = { full_name: fullName };
        if (Object.keys(authUpdate).length) {
          const { error } = await admin.auth.admin.updateUserById(userId, authUpdate);
          if (error) throw error;
        }
        const profUpdate: any = {};
        if (email) profUpdate.email = email;
        if (fullName) profUpdate.full_name = fullName;
        if (Object.keys(profUpdate).length) {
          const { error } = await admin.from("profiles").update(profUpdate).eq("id", userId);
          if (error) throw error;
        }
        return json({ ok: true });
      }

      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err: any) {
    console.error("[admin-actions]", action, err);
    return json({ error: err?.message ?? "Internal error" }, 500);
  }
});
