// Envio de mensagem de WhatsApp (provedor WAHA) — Sistema CRM.
//
// Chamada pelo front (usuário autenticado). Lê a conversa, envia o texto via
// WAHA e grava a mensagem (direcao=saida). A API key da WAHA fica só aqui.
//
// Payload: { conversa_id: uuid, texto: string }
//
// ⚠️ Usa a sessão WAHA exclusiva do Sistema CRM (WAHA_SESSION) — nada compartilhado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const schema = z
  .object({
    conversa_id: z.string().uuid(),
    texto: z.string().max(4096).optional().nullable(),
    reply_to: z.string().max(300).optional().nullable(), // wa_message_id citado
    midia: z
      .object({
        tipo: z.enum(["imagem", "audio", "video", "documento"]),
        data: z.string().min(1), // base64 (sem prefixo data:)
        mimetype: z.string().min(1),
        filename: z.string().optional(),
      })
      .optional(),
  })
  .refine((d) => (d.texto && d.texto.trim()) || d.midia, {
    message: "texto ou midia obrigatório",
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
  const userId = userData.user.id;
  const userEmail = userData.user.email ?? null;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "invalid_payload", details: parsed.error.flatten() }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const { conversa_id, texto, midia, reply_to } = parsed.data;

  const admin = createClient(supabaseUrl, service);

  const { data: conversa, error: convErr } = await admin
    .from("conversas")
    .select("id, wa_chat_id")
    .eq("id", conversa_id)
    .maybeSingle();
  if (convErr || !conversa) {
    return new Response(JSON.stringify({ error: "conversa_not_found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const wahaUrl = Deno.env.get("WAHA_URL");
  const wahaKey = Deno.env.get("WAHA_API_KEY");
  const wahaSession = Deno.env.get("WAHA_SESSION") ?? "default";
  if (!wahaUrl || !wahaKey) {
    return new Response(JSON.stringify({ error: "waha_not_configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const base = wahaUrl.replace(/\/$/, "");
  // Define endpoint + payload conforme texto ou mídia
  let endpoint = `${base}/api/sendText`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: Record<string, any> = { session: wahaSession, chatId: conversa.wa_chat_id, text: texto };
  let tipoMsg = "texto";
  if (midia) {
    tipoMsg = midia.tipo;
    const file = { mimetype: midia.mimetype, filename: midia.filename ?? "arquivo", data: midia.data };
    const map: Record<string, string> = {
      imagem: "sendImage", video: "sendVideo", audio: "sendVoice", documento: "sendFile",
    };
    endpoint = `${base}/api/${map[midia.tipo]}`;
    payload = { session: wahaSession, chatId: conversa.wa_chat_id, file };
    if (midia.tipo !== "audio") payload.caption = texto ?? undefined; // voice não tem caption
  }
  // Responder/citar uma mensagem (WAHA aceita reply_to com o id da mensagem citada)
  if (reply_to) payload.reply_to = reply_to;

  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": wahaKey },
      body: JSON.stringify(payload),
    });

    const wahaBody = await resp.json().catch(() => ({}));
    const status = resp.ok ? "enviada" : "falhou";
    const waMessageId: string | null = wahaBody?.id ?? wahaBody?.key?.id ?? null;

    const { data: msg, error: msgErr } = await admin
      .from("mensagens")
      .insert({
        conversa_id,
        wa_message_id: waMessageId,
        direcao: "saida",
        corpo: texto ?? null,
        tipo: tipoMsg,
        media_mime: midia?.mimetype ?? null,
        media_nome: midia?.filename ?? null,
        status,
        autor_id: userId,
        autor_email: userEmail,
        responde_a: reply_to ?? null,
      })
      .select("id")
      .single();
    if (msgErr) throw msgErr;

    const previa = midia ? "📎 Mídia" : (texto ?? "").slice(0, 120);
    await admin
      .from("conversas")
      .update({ ultimo_em: new Date().toISOString(), ultima_msg: `Você: ${previa}` })
      .eq("id", conversa_id);

    if (!resp.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: "waha_send_failed", details: wahaBody, mensagem_id: msg.id }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ ok: true, mensagem_id: msg.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("whatsapp_send_error", err);
    return new Response(JSON.stringify({ error: "internal_error", message: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
