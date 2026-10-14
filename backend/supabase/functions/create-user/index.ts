// Cria novo usuário (uso pela página /admin/usuarios).
// Admin pode criar admin/usuario; super_admin pode criar qualquer papel.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72),
  nome: z.string().min(1).max(120),
  role: z.enum(["super_admin", "admin", "usuario"]),
  responsavel_crm: z.string().max(80).optional().nullable(),
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
  const { data: rolesRows } = await admin.from("user_roles").select("role").eq("user_id", callerId);
  const callerRoles = (rolesRows ?? []).map((r) => r.role);
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
    return new Response(
      JSON.stringify({ error: "invalid_payload", details: parsed.error.flatten() }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const { email, password, nome, role, responsavel_crm } = parsed.data;

  if (role === "super_admin" && !isSuper) {
    return new Response(JSON.stringify({ error: "forbidden_role" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nome },
    });
    if (error || !created.user) {
      return new Response(JSON.stringify({ error: "create_failed", message: error?.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (role !== "usuario") {
      await admin.from("user_roles").delete().eq("user_id", created.user.id);
      await admin.from("user_roles").insert({ user_id: created.user.id, role });
    }

    const carteira = (responsavel_crm ?? "").trim() || "Comercial";
    await admin
      .from("profiles")
      .update({ responsavel_crm: carteira, nome })
      .eq("user_id", created.user.id);

    await admin.from("audit_logs").insert({
      user_id: callerId,
      actor_email: callerEmail,
      acao: "usuario.criado",
      entidade: "auth.users",
      entidade_id: created.user.id,
      detalhes: { email, nome, role, responsavel_crm: carteira },
    });

    return new Response(JSON.stringify({ ok: true, user_id: created.user.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create_user_error", err);
    return new Response(
      JSON.stringify({ error: "internal_error", message: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
