// Chatwoot → pausar/retomar SDR (tabela pausar_ia).
//
// Uso (macros / automações do Chatwoot):
//   POST .../functions/v1/sdr-pausar?acao=pausar&secret=SDR_PAUSAR_SECRET
//   POST .../functions/v1/sdr-pausar?acao=retomar&secret=SDR_PAUSAR_SECRET
//
// Body: payload de conversa do Chatwoot (macro/automação), ou JSON simples
//   { "telefone": "5587...", "nome": "opcional", "acao": "pausar"|"retomar" }
//
// Auth: ?secret= / header x-sdr-pausar-secret (SDR_PAUSAR_SECRET ou SDR_HANDOFF_SECRET)
//       ou Bearer de usuário autenticado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-sdr-pausar-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function soDigitos(v: unknown): string {
  return String(v ?? "").replace(/\D/g, "");
}

/** Extrai telefone do payload flat ou do shape de conversa Chatwoot. */
function extrairTelefone(body: Record<string, unknown>): string {
  const direto = soDigitos(body.telefone ?? body.phone);
  if (direto.length >= 8) return direto;

  const meta = (body.meta as Record<string, unknown> | undefined) ?? {};
  const sender =
    (meta.sender as Record<string, unknown> | undefined) ??
    (body.sender as Record<string, unknown> | undefined) ??
    {};
  const deSender = soDigitos(sender.phone_number ?? sender.identifier ?? sender.phone);
  if (deSender.length >= 8) return deSender;

  const conv = (body.conversation as Record<string, unknown> | undefined) ?? {};
  const convMeta = (conv.meta as Record<string, unknown> | undefined) ?? {};
  const convSender = (convMeta.sender as Record<string, unknown> | undefined) ?? {};
  return soDigitos(convSender.phone_number ?? convSender.identifier);
}

function extrairNome(body: Record<string, unknown>): string | null {
  if (typeof body.nome === "string" && body.nome.trim()) return body.nome.trim();
  const meta = (body.meta as Record<string, unknown> | undefined) ?? {};
  const sender = (meta.sender as Record<string, unknown> | undefined) ?? {};
  if (typeof sender.name === "string" && sender.name.trim()) return sender.name.trim();
  return null;
}

function temEtiquetaPausar(body: Record<string, unknown>): boolean | null {
  const labels = body.labels;
  if (!Array.isArray(labels)) return null;
  const nomes = labels.map((l) => String(l).toLowerCase());
  if (nomes.some((n) => n.includes("pausar-ia") || n === "pausar_ia" || n === "pausar ia")) {
    return true;
  }
  if (nomes.some((n) => n.includes("retomar-ia") || n === "retomar_ia")) {
    return false;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = new URL(req.url);
  const secret =
    url.searchParams.get("secret") ??
    req.headers.get("x-sdr-pausar-secret") ??
    req.headers.get("x-sdr-handoff-secret");
  const expected =
    Deno.env.get("SDR_PAUSAR_SECRET") ?? Deno.env.get("SDR_HANDOFF_SECRET") ?? "";
  const authHeader = req.headers.get("Authorization");

  const sbUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey =
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

  let autorizado = false;
  if (!expected) {
    // Sem secret configurado: aceita (dev). Em produção, defina o secret.
    autorizado = true;
  } else if (secret && secret === expected) {
    autorizado = true;
  }

  if (!autorizado && authHeader?.startsWith("Bearer ")) {
    const userClient = createClient(sbUrl, anonKey || serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (userData?.user) autorizado = true;
  }

  if (!autorizado) return json({ error: "unauthorized" }, 401);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  let acao = String(url.searchParams.get("acao") ?? body.acao ?? "").toLowerCase();
  if (acao !== "pausar" && acao !== "retomar") {
    const viaLabel = temEtiquetaPausar(body);
    if (viaLabel === true) acao = "pausar";
    else if (viaLabel === false) acao = "retomar";
    else acao = "pausar"; // default seguro: humano pediu o webhook = pausar
  }

  const telefone = extrairTelefone(body);
  if (telefone.length < 8) {
    return json({ error: "telefone_nao_encontrado", hint: "meta.sender.phone_number" }, 400);
  }

  const nome = extrairNome(body);
  const admin = createClient(sbUrl, serviceKey);

  // Canoniza com o telefone já usado em dados_conversa (se existir)
  let telCanon = telefone;
  const suf = telefone.slice(-8);
  const { data: leads } = await admin
    .from("dados_conversa")
    .select("telefone, nome")
    .ilike("telefone", `%${suf}`)
    .order("updated_at", { ascending: false })
    .limit(5);
  const match = (leads ?? []).find((r) => soDigitos(r.telefone).endsWith(suf));
  if (match?.telefone) telCanon = soDigitos(match.telefone) || String(match.telefone);

  if (acao === "retomar") {
    const { error } = await admin.from("pausar_ia").delete().eq("telefone", telCanon);
    if (error) return json({ error: error.message }, 500);
    // também tenta variação com o telefone cru do Chatwoot
    if (telCanon !== telefone) {
      await admin.from("pausar_ia").delete().eq("telefone", telefone);
    }
    return json({ ok: true, acao: "retomar", telefone: telCanon });
  }

  // pausar (idempotente)
  const { data: ja } = await admin
    .from("pausar_ia")
    .select("id")
    .eq("telefone", telCanon)
    .maybeSingle();

  if (ja) {
    return json({ ok: true, acao: "pausar", telefone: telCanon, ja_existia: true });
  }

  const { error: insErr } = await admin.from("pausar_ia").insert({
    telefone: telCanon,
    nome: nome ?? match?.nome ?? null,
  });
  if (insErr && !String(insErr.message).toLowerCase().includes("duplicate")) {
    return json({ error: insErr.message }, 500);
  }

  return json({ ok: true, acao: "pausar", telefone: telCanon, ja_existia: false });
});
