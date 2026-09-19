// Participantes de um grupo de WhatsApp (para a UI do chat).
// Body: { conversa_id }  — Auth: Bearer (JWT do usuário logado).
//
// A WAHA expõe os membros em GET /api/{session}/groups/{gid}/participants, com:
//   { JID/LID: "...@lid", PhoneNumber: "55...@s.whatsapp.net", DisplayName, IsAdmin }
// Usamos o PhoneNumber (telefone real) p/ exibir e casar com contatos; o LID p/
// casar com o nome que já vimos nas mensagens. Nome: DisplayName > mensagens > contato.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const soDigitos = (s: string) => (String(s ?? "").split("@")[0] ?? "").replace(/\D/g, "");

type Membro = { telefone: string; lid: string; nome: string | null; admin: boolean };

// Lê os membros de qualquer formato que a WAHA devolva (lista direta, ou objeto
// com Participants/participants/members), cobrindo chaves NOWEB (Capital) e WEBJS.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extrairMembros(info: any): Membro[] {
  const lista = Array.isArray(info)
    ? info
    : (info?.Participants ?? info?.participants ?? info?.groupMetadata?.participants ?? info?.members ?? []);
  const out: Membro[] = [];
  for (const p of Array.isArray(lista) ? lista : []) {
    const phone = soDigitos(p?.PhoneNumber ?? p?.phoneNumber ?? "");
    const lid = soDigitos(p?.LID ?? p?.JID ?? p?.id?._serialized ?? p?.id ?? p?.jid ?? "");
    const telefone = phone || lid;
    if (!telefone) continue;
    const nome = String(p?.DisplayName ?? p?.name ?? p?.notify ?? "").trim() || null;
    const admin = !!(p?.IsAdmin || p?.IsSuperAdmin || p?.isAdmin || p?.isSuperAdmin || p?.admin ||
      /admin/i.test(String(p?.role ?? "")));
    out.push({ telefone, lid: lid || telefone, nome, admin });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: u, error: uErr } = await uc.auth.getUser(auth.replace("Bearer ", ""));
  if (uErr || !u?.user) return json({ error: "unauthorized" }, 401);

  const { conversa_id } = await req.json().catch(() => ({}));
  if (!conversa_id) return json({ error: "conversa_id_obrigatorio" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: conv } = await admin
    .from("conversas").select("wa_chat_id, eh_grupo, nome_whatsapp").eq("id", conversa_id).maybeSingle();
  if (!conv || !conv.eh_grupo) return json({ error: "nao_eh_grupo" }, 400);

  // nome por chave (LID/telefone em dígitos) a partir das mensagens recebidas
  const nomePorChave = new Map<string, string>();
  const { data: msgs } = await admin
    .from("mensagens").select("remetente_telefone, remetente_nome")
    .eq("conversa_id", conversa_id).not("remetente_telefone", "is", null).limit(2000);
  for (const m of msgs ?? []) {
    if (m.remetente_telefone && m.remetente_nome && !nomePorChave.has(m.remetente_telefone)) {
      nomePorChave.set(m.remetente_telefone, m.remetente_nome);
    }
  }

  // membros da WAHA — /participants traz a lista completa
  const wahaUrl = (Deno.env.get("WAHA_URL") ?? "").replace(/\/$/, "");
  const wahaKey = Deno.env.get("WAHA_API_KEY") ?? "";
  const session = Deno.env.get("WAHA_SESSION") ?? "default";
  const gid = encodeURIComponent(conv.wa_chat_id);
  let membros: Membro[] = [];
  for (const path of [`/api/${session}/groups/${gid}/participants`, `/api/${session}/groups/${gid}`]) {
    try {
      const r = await fetch(`${wahaUrl}${path}`, { headers: { "X-Api-Key": wahaKey } });
      if (!r.ok) continue;
      membros = extrairMembros(await r.json());
      if (membros.length) break;
    } catch { /* tenta o próximo */ }
  }
  // backstop: se a WAHA não trouxer, usa quem já falou no grupo
  if (!membros.length) {
    membros = [...nomePorChave.keys()].map((t) => ({ telefone: t, lid: t, nome: nomePorChave.get(t) ?? null, admin: false }));
  }

  // contatos do CRM (últimos 8 dígitos -> nome)
  const nomePorContato = new Map<string, string>();
  const { data: cts } = await admin.from("contatos").select("nome, telefone").not("telefone", "is", null).limit(3000);
  for (const ct of cts ?? []) {
    const d = (ct.telefone ?? "").replace(/\D/g, "");
    if (d) nomePorContato.set(d.slice(-8), ct.nome);
  }

  const vistos = new Set<string>();
  const participantes = membros
    .filter((m) => (vistos.has(m.telefone) ? false : (vistos.add(m.telefone), true)))
    .map((m) => ({
      telefone: m.telefone,
      admin: m.admin,
      nome: m.nome ?? nomePorChave.get(m.lid) ?? nomePorChave.get(m.telefone) ??
        nomePorContato.get(m.telefone.slice(-8)) ?? null,
    }));

  return json({ ok: true, assunto: conv.nome_whatsapp, total: participantes.length, participantes });
});
