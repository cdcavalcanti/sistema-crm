// Webhook de entrada do Instagram, via Chatwoot (gateway) — Sistema CRM.
//
// O Chatwoot deve ser configurado para POSTar os eventos aqui:
//   {PUBLIC_FUNCTIONS_URL}/instagram-chatwoot-webhook?secret={CHATWOOT_WEBHOOK_SECRET}
//   (Configurações → Integrações → Webhooks, evento "message_created")
//
// Espelha o padrão do whatsapp-webhook: recebe o push do gateway, grava nas
// tabelas conversas/mensagens (canal='instagram') e o front atualiza sozinho
// pelo Supabase Realtime. O token do Chatwoot NÃO é usado aqui (só no envio);
// a entrada é autenticada pelo secret do webhook.
//
// Só tratamos a inbox do Instagram (CHATWOOT_INSTAGRAM_INBOX_ID). O WhatsApp
// continua entrando pela WAHA — nada compartilhado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Chatwoot manda file_type como image/audio/video/file/... — mapeia pro nosso tipo.
function tipoDoAnexo(fileType?: string | null): string {
  switch (fileType) {
    case "image": return "imagem";
    case "audio": return "audio";
    case "video": return "video";
    default: return "documento";
  }
}

// message_type vem ora como string ("incoming"/"outgoing"), ora como número (0/1).
function direcaoDe(messageType: unknown): "entrada" | "saida" | null {
  if (messageType === "incoming" || messageType === 0) return "entrada";
  if (messageType === "outgoing" || messageType === 1) return "saida";
  return null; // activity/template/etc. — ignora
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // -------- valida secret --------
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") ?? req.headers.get("x-webhook-secret");
  const expected = Deno.env.get("CHATWOOT_WEBHOOK_SECRET");
  if (!expected || secret !== expected) return json({ error: "unauthorized" }, 401);

  try {
    const evt = await req.json().catch(() => null);
    const event: string = evt?.event ?? "";

    // Só nos interessa mensagem criada. Demais eventos respondem ok.
    if (event !== "message_created") return json({ ok: true, ignored: event });

    // No message_created os campos da mensagem vêm no topo do payload.
    const p = evt ?? {};
    const conv = p.conversation ?? {};
    const inboxId: number | null = p.inbox?.id ?? conv.inbox_id ?? null;

    // Filtra só a inbox do Instagram (as demais não são deste chat).
    const igInbox = Number(Deno.env.get("CHATWOOT_INSTAGRAM_INBOX_ID") ?? "228");
    if (!inboxId || Number(inboxId) !== igInbox) {
      return json({ ok: true, ignored: "outra_inbox", inbox: inboxId });
    }

    // Notas privadas do agente não são mensagem do cliente — ignora.
    if (p.private === true) return json({ ok: true, ignored: "private" });

    const direcao = direcaoDe(p.message_type);
    if (!direcao) return json({ ok: true, ignored: "tipo_nao_suportado" });

    const chatwootMessageId: number | null = p.id ?? null;
    const chatwootConversationId: number | null = conv.id ?? null;
    if (!chatwootConversationId) return json({ error: "sem_conversation_id" }, 400);

    const corpo: string | null = p.content ?? null;
    const anexos: any[] = Array.isArray(p.attachments) ? p.attachments : [];
    const primeiro = anexos[0] ?? null;
    const tipo = primeiro ? tipoDoAnexo(primeiro.file_type) : "texto";
    const mediaUrl: string | null = primeiro?.data_url ?? primeiro?.thumb_url ?? null;
    const mediaNome: string | null = primeiro?.file_type ? String(primeiro.file_type) : null;

    // Remetente (contato do Instagram). Em conversa 1:1 é sempre o mesmo.
    const sender = conv.meta?.sender ?? p.sender ?? {};
    const nome: string | null = sender.name ?? null;
    const foto: string | null = sender.thumbnail ?? null;
    const contatoChatwootId: number | null = sender.id ?? null;
    const igUser: string | null =
      sender.additional_attributes?.username ??
      sender.additional_attributes?.social_profiles?.instagram ??
      null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // -------- dedupe por chatwoot_message_id --------
    if (chatwootMessageId) {
      const { data: existente } = await supabase
        .from("mensagens")
        .select("id")
        .eq("chatwoot_message_id", chatwootMessageId)
        .maybeSingle();
      if (existente) return json({ ok: true, duplicate: true });
    }

    // -------- acha/cria conversa (canal='instagram') --------
    let conversaId: string;
    const { data: c } = await supabase
      .from("conversas")
      .select("id, nao_lidas")
      .eq("chatwoot_conversation_id", chatwootConversationId)
      .maybeSingle();

    if (c) {
      conversaId = c.id;
    } else {
      const { data: nova, error } = await supabase
        .from("conversas")
        .insert({
          canal: "instagram",
          chatwoot_conversation_id: chatwootConversationId,
          chatwoot_inbox_id: inboxId,
          chatwoot_contact_id: contatoChatwootId,
          instagram_username: igUser,
          nome_whatsapp: nome, // reusa o campo de exibição (tituloConversa)
          foto_url: foto,
          eh_grupo: false,
        })
        .select("id")
        .single();
      if (error || !nova) throw error ?? new Error("conversa_insert_failed");
      conversaId = nova.id;
    }

    // -------- insere mensagem --------
    const { error: msgErr } = await supabase.from("mensagens").insert({
      conversa_id: conversaId,
      chatwoot_message_id: chatwootMessageId,
      direcao,
      corpo,
      tipo,
      media_url: mediaUrl,
      media_nome: mediaNome,
      // Instagram/Chatwoot não expõe os "risquinhos"; entrada=entregue, saída=enviada.
      status: direcao === "entrada" ? "entregue" : "enviada",
    });
    if (msgErr) throw msgErr;

    // -------- atualiza conversa (último em / não lidas / nome / foto) --------
    const base = corpo ? corpo.slice(0, 120) : tipo !== "texto" ? "📎 Mídia" : "";
    const previa = (direcao === "saida" ? `Você: ${base}` : base) || null;
    const naoLidas = direcao === "entrada" ? (c?.nao_lidas ?? 0) + 1 : (c?.nao_lidas ?? 0);
    await supabase
      .from("conversas")
      .update({
        ultimo_em: new Date().toISOString(),
        nao_lidas: naoLidas,
        ultima_msg: previa,
        ...(nome ? { nome_whatsapp: nome } : {}),
        ...(foto ? { foto_url: foto } : {}),
        ...(igUser ? { instagram_username: igUser } : {}),
      })
      .eq("id", conversaId);

    return json({ ok: true, conversa_id: conversaId });
  } catch (err) {
    console.error("chatwoot_webhook_error", err);
    return json({ error: "internal_error", message: String(err) }, 500);
  }
});
