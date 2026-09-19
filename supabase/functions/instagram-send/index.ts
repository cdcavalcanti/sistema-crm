// Envio de mensagem de Instagram, via Chatwoot (gateway) — Sistema CRM.
//
// Espelha o whatsapp-send: chamada pelo front (usuário logado), lê a conversa,
// envia pela API do Chatwoot e grava a mensagem (direcao=saida). O token do
// Chatwoot (api_access_token) fica SÓ aqui, server-side — nunca no navegador.
//
// Payload: { conversa_id: uuid, texto?: string, midia?: {...base64...} }
//
// Obs.: o Chatwoot também devolve esta mensagem pelo webhook (message_type
// outgoing); a dedupe por chatwoot_message_id evita gravar duas vezes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const schema = z
  .object({
    conversa_id: z.string().uuid(),
    texto: z.string().max(4096).optional().nullable(),
    midia: z
      .object({
        tipo: z.enum(["imagem", "audio", "video", "documento"]),
        data: z.string().min(1), // base64 (sem prefixo data:)
        mimetype: z.string().min(1),
        filename: z.string().optional(),
      })
      .optional(),
  })
  .refine((d) => (d.texto && d.texto.trim()) || d.midia, { message: "texto ou midia obrigatório" });

// base64 -> Uint8Array (para montar o arquivo no multipart do Chatwoot)
function base64ParaBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anon);
  const { data: userData, error: userError } = await userClient.auth.getUser(auth.replace("Bearer ", ""));
  if (userError || !userData?.user) return json({ error: "unauthorized" }, 401);
  const userId = userData.user.id;
  const userEmail = userData.user.email ?? null;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: "invalid_payload", details: parsed.error.flatten() }, 400);
  const { conversa_id, texto, midia } = parsed.data;

  const admin = createClient(supabaseUrl, service);

  const { data: conversa, error: convErr } = await admin
    .from("conversas")
    .select("id, canal, chatwoot_conversation_id")
    .eq("id", conversa_id)
    .maybeSingle();
  if (convErr || !conversa) return json({ error: "conversa_not_found" }, 404);
  if (conversa.canal !== "instagram" || !conversa.chatwoot_conversation_id) {
    return json({ error: "conversa_nao_e_chatwoot" }, 400);
  }

  const cwUrl = (Deno.env.get("CHATWOOT_URL") ?? "").replace(/\/$/, "");
  const cwToken = Deno.env.get("CHATWOOT_TOKEN") ?? "";
  const cwAccount = Deno.env.get("CHATWOOT_ACCOUNT_ID") ?? "4";
  if (!cwUrl || !cwToken) return json({ error: "chatwoot_not_configured" }, 500);

  const endpoint = `${cwUrl}/api/v1/accounts/${cwAccount}/conversations/${conversa.chatwoot_conversation_id}/messages`;
  const tipoMsg = midia?.tipo ?? "texto";

  try {
    let resp: Response;
    if (midia) {
      // Mídia: multipart/form-data com attachments[] (não define Content-Type
      // manualmente — o fetch monta o boundary do FormData).
      const form = new FormData();
      if (texto?.trim()) form.append("content", texto);
      form.append("message_type", "outgoing");
      const blob = new Blob([base64ParaBytes(midia.data)], { type: midia.mimetype });
      form.append("attachments[]", blob, midia.filename ?? "arquivo");
      resp = await fetch(endpoint, { method: "POST", headers: { api_access_token: cwToken }, body: form });
    } else {
      resp = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", api_access_token: cwToken },
        body: JSON.stringify({ content: texto, message_type: "outgoing" }),
      });
    }

    const cwBody = await resp.json().catch(() => ({}));
    const status = resp.ok ? "enviada" : "falhou";
    const chatwootMessageId: number | null = cwBody?.id ?? null;

    const { data: msg, error: msgErr } = await admin
      .from("mensagens")
      .insert({
        conversa_id,
        chatwoot_message_id: chatwootMessageId,
        direcao: "saida",
        corpo: texto ?? null,
        tipo: tipoMsg,
        media_mime: midia?.mimetype ?? null,
        media_nome: midia?.filename ?? null,
        status,
        autor_id: userId,
        autor_email: userEmail,
      })
      .select("id")
      .maybeSingle();
    // Corrida com o webhook: o Chatwoot devolve esta mensagem (eco outgoing) e o
    // instagram-chatwoot-webhook grava o MESMO chatwoot_message_id. Se ele venceu
    // a corrida, o insert aqui bate no índice UNIQUE (23505) — não é erro: a
    // mensagem já está registrada. Só relançamos erros de verdade.
    if (msgErr && msgErr.code !== "23505") throw msgErr;

    const previa = midia ? "📎 Mídia" : (texto ?? "").slice(0, 120);
    await admin
      .from("conversas")
      .update({ ultimo_em: new Date().toISOString(), ultima_msg: `Você: ${previa}` })
      .eq("id", conversa_id);

    if (!resp.ok) {
      return json({ ok: false, error: "chatwoot_send_failed", details: cwBody, mensagem_id: msg?.id ?? null }, 502);
    }
    return json({ ok: true, mensagem_id: msg?.id ?? null });
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : JSON.stringify(err);
    console.error("chatwoot_send_error", detalhe);
    return json({ error: "internal_error", message: detalhe }, 500);
  }
});
