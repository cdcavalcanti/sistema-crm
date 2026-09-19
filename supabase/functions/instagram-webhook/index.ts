// Webhook do Instagram DIRETO pela API do Meta (Instagram Messaging), sem o
// gateway Chatwoot. Grava as DMs recebidas nas mesmas tabelas do chat
// (conversas/mensagens, canal='instagram'), aparecendo na aba de Instagram.
//
// Configuração no Meta (App → Webhooks → Instagram):
//   Callback URL: {FUNCTIONS_URL}/instagram-webhook
//   Verify token: valor do secret INSTAGRAM_VERIFY_TOKEN
//   Campo assinado: "messages"
//
// GET  → handshake de verificação do Meta (hub.challenge).
// POST → eventos de mensagem; valida X-Hub-Signature-256 com META_APP_SECRET.
//
// deploy: verify_jwt = false (webhook público, autenticado por assinatura/token).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Valida a assinatura X-Hub-Signature-256 (HMAC-SHA256 do corpo cru com o app secret).
async function assinaturaOk(appSecret: string, raw: string, header: string | null): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // comparação simples (o valor não é secreto do lado de cá)
  return `sha256=${hex}` === header;
}

// Busca nome/username/foto do remetente (best-effort) para exibir bonito na lista.
async function perfil(igsid: string): Promise<{ nome?: string; username?: string; foto?: string }> {
  const token = Deno.env.get("META_PAGE_ACCESS_TOKEN");
  const ver = Deno.env.get("META_GRAPH_VERSION") ?? "v21.0";
  if (!token) return {};
  try {
    const r = await fetch(`https://graph.facebook.com/${ver}/${igsid}?fields=name,username,profile_pic&access_token=${encodeURIComponent(token)}`);
    if (!r.ok) return {};
    const j = await r.json();
    return { nome: j.name, username: j.username, foto: j.profile_pic };
  } catch { return {}; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);

  // -------- 1) Verificação do webhook (GET) --------
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = Deno.env.get("INSTAGRAM_VERIFY_TOKEN");
    if (mode === "subscribe" && expected && token === expected) {
      return new Response(challenge ?? "", { status: 200, headers: corsHeaders });
    }
    return new Response("forbidden", { status: 403, headers: corsHeaders });
  }

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // -------- 2) Recebimento de mensagens (POST) --------
  const raw = await req.text();
  const appSecret = Deno.env.get("META_APP_SECRET") ?? "";
  if (appSecret) {
    // Proteção principal: assinatura HMAC do Meta (X-Hub-Signature-256).
    const ok = await assinaturaOk(appSecret, raw, req.headers.get("x-hub-signature-256"));
    if (!ok) return json({ error: "invalid_signature" }, 401);
  } else {
    // Sem app secret configurado: exige o token na URL (?token=INSTAGRAM_VERIFY_TOKEN)
    // como proteção. Registre a callback URL COM ?token=... para o Meta reenviar.
    const t = url.searchParams.get("token");
    if (!t || t !== Deno.env.get("INSTAGRAM_VERIFY_TOKEN")) return json({ error: "unauthorized" }, 401);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let evt: any;
  try { evt = JSON.parse(raw); } catch { return json({ error: "bad_json" }, 400); }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let gravadas = 0;
  for (const entry of evt.entry ?? []) {
    for (const m of entry.messaging ?? []) {
      // ignora eco das mensagens que NÓS enviamos
      if (m.message?.is_echo) continue;
      const igsid: string | undefined = m.sender?.id;
      const mid: string | undefined = m.message?.mid;
      if (!igsid || !mid) continue;

      const texto: string | null = m.message?.text ?? null;
      const temAnexo = Array.isArray(m.message?.attachments) && m.message.attachments.length > 0;
      if (texto === null && !temAnexo) continue; // sem conteúdo tratável

      // acha/cria a conversa desse usuário (canal instagram)
      const { data: conv } = await admin
        .from("conversas").select("id").eq("instagram_user_id", igsid).maybeSingle();
      let conversaId = conv?.id as string | undefined;
      if (!conversaId) {
        const p = await perfil(igsid);
        const { data: nova, error } = await admin
          .from("conversas")
          .insert({
            canal: "instagram",
            instagram_user_id: igsid,
            instagram_username: p.username ?? null,
            nome_whatsapp: p.nome ?? p.username ?? null, // usado como título na lista
            foto_url: p.foto ?? null,
            nao_lidas: 0,
          })
          .select("id").single();
        if (error || !nova) continue;
        conversaId = nova.id;
      }

      // insere a mensagem (dedup por instagram_message_id)
      const { error: msgErr } = await admin.from("mensagens").insert({
        conversa_id: conversaId,
        instagram_message_id: mid,
        direcao: "entrada",
        corpo: texto,
        tipo: texto ? "texto" : "imagem",
        status: "entregue",
      });
      // 23505 = duplicata (reentrega do Meta) — ignora
      if (msgErr && msgErr.code !== "23505") continue;
      if (!msgErr) gravadas++;

      // atualiza a conversa (última msg + não lidas)
      const { data: atual } = await admin.from("conversas").select("nao_lidas").eq("id", conversaId).maybeSingle();
      await admin.from("conversas").update({
        ultimo_em: new Date().toISOString(),
        ultima_msg: texto ? texto.slice(0, 120) : "📎 Mídia",
        nao_lidas: (atual?.nao_lidas ?? 0) + 1,
      }).eq("id", conversaId);
    }
  }

  return json({ ok: true, gravadas });
});
