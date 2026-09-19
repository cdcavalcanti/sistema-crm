// Atualiza papel de usuário. Super_admin pode promover/rebaixar qualquer um.
// Admin só altera entre admin/usuario para usuários que NÃO são super_admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const schema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["super_admin", "admin", "usuario"]),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anon);
  const token = auth.replace("Bearer ", "");
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const callerId = userData.user.id;
  const callerEmail = userData.user.email ?? null;
  const admin = createClient(supabaseUrl, service);

  const { data: callerRolesRows } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId);
  const callerRoles = (callerRolesRows ?? []).map((r) => r.role);
  const isSuper = callerRoles.includes("super_admin");
  const isAdmin = callerRoles.includes("admin");
  if (!isSuper && !isAdmin) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: "invalid_payload" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { user_id, role } = parsed.data;

  const { data: targetRolesRows } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", user_id);
  const targetRoles = (targetRolesRows ?? []).map((r) => r.role);
  const targetIsSuper = targetRoles.includes("super_admin");

  if (!isSuper && (targetIsSuper || role === "super_admin")) {
    return new Response(JSON.stringify({ error: "forbidden_role" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await admin.from("user_roles").delete().eq("user_id", user_id);
  const { error } = await admin.from("user_roles").insert({ user_id, role });
  if (error) {
    return new Response(JSON.stringify({ error: "update_failed", message: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await admin.from("audit_logs").insert({
    user_id: callerId,
    actor_email: callerEmail,
    acao: "usuario.papel_alterado",
    entidade: "user_roles",
    entidade_id: user_id,
    detalhes: { de: targetRoles, para: role },
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
