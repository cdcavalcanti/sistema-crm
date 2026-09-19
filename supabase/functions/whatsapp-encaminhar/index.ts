// Encaminhar mensagem para outra conversa — Sistema CRM.
// Body: { mensagem_id, destino_conversa_id }  — Auth: Bearer (usuário logado).
//
// O engine GOWS da WAHA NÃO implementa forward nativo (501). Então encaminhamos
// RE-ENVIANDO o conteúdo para o destino (texto via sendText; mídia baixada da
// WAHA e reenviada). No CRM a mensagem fica marcada como encaminhada.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const bytesParaBase64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: u, error: uErr } = await uc.auth.getUser(auth.replace("Bearer ", ""));
  if (uErr || !u?.user) return json({ error: "unauthorized" }, 401);

  const { mensagem_id, destino_conversa_id } = await req.json().catch(() => ({}));
  if (!mensagem_id || !destino_conversa_id) return json({ error: "parametros_invalidos" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: msg } = await admin
    .from("mensagens").select("wa_message_id, corpo, tipo, media_mime, media_nome, conversa_id").eq("id", mensagem_id).maybeSingle();
  if (!msg) return json({ error: "mensagem_nao_encontrada" }, 404);

  const { data: destino } = await admin
    .from("conversas").select("wa_chat_id").eq("id", destino_conversa_id).maybeSingle();
  if (!destino) return json({ error: "conversa_destino_nao_encontrada" }, 404);

  const wahaUrl = (Deno.env.get("WAHA_URL") ?? "").replace(/\/$/, "");
  const wahaKey = Deno.env.get("WAHA_API_KEY") ?? "";
  const session = Deno.env.get("WAHA_SESSION") ?? "default";
  if (!wahaUrl || !wahaKey) return json({ error: "waha_not_configured" }, 500);
  const H = { "Content-Type": "application/json", "X-Api-Key": wahaKey };

  try {
    const ehMidia = msg.tipo && msg.tipo !== "texto";
    let endpoint = `${wahaUrl}/api/sendText`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let payload: Record<string, any> = { session, chatId: destino.wa_chat_id, text: msg.corpo ?? "" };

    if (ehMidia) {
      // baixa a mídia da mensagem de origem (precisa do chat de origem)
      const { data: orig } = await admin.from("conversas").select("wa_chat_id").eq("id", msg.conversa_id).maybeSingle();
      if (!orig) return json({ error: "conversa_origem_nao_encontrada" }, 404);
      const mUrl = `${wahaUrl}/api/${session}/chats/${encodeURIComponent(orig.wa_chat_id)}/messages/${encodeURIComponent(msg.wa_message_id ?? "")}?downloadMedia=true`;
      const mRes = await fetch(mUrl, { headers: { "X-Api-Key": wahaKey } });
      const mJson = mRes.ok ? await mRes.json() : null;
      const mediaUrl: string | null = mJson?.media?.url ?? null;
      const mimetype: string = mJson?.media?.mimetype ?? msg.media_mime ?? "application/octet-stream";
      if (!mediaUrl) return json({ ok: false, error: "midia_indisponivel" }, 502);
      const fRes = await fetch(mediaUrl, { headers: { "X-Api-Key": wahaKey } });
      if (!fRes.ok) return json({ ok: false, error: "midia_download_falhou" }, 502);
      const data = bytesParaBase64(await fRes.arrayBuffer());
      const map: Record<string, string> = {
        imagem: "sendImage", figurinha: "sendImage", video: "sendVideo", audio: "sendVoice", documento: "sendFile",
      };
      endpoint = `${wahaUrl}/api/${map[msg.tipo] ?? "sendFile"}`;
      payload = {
        session, chatId: destino.wa_chat_id,
        file: { mimetype, filename: msg.media_nome ?? "arquivo", data },
      };
      if (msg.tipo !== "audio" && msg.corpo) payload.caption = msg.corpo;
    }

    const resp = await fetch(endpoint, { method: "POST", headers: H, body: JSON.stringify(payload) });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) return json({ ok: false, error: "envio_falhou", details: body }, 502);
    const waMessageId: string | null = body?.id ?? body?.key?.id ?? null;

    await admin.from("mensagens").insert({
      conversa_id: destino_conversa_id,
      wa_message_id: waMessageId,
      direcao: "saida",
      corpo: msg.corpo,
      tipo: msg.tipo,
      media_mime: msg.media_mime,
      media_nome: msg.media_nome,
      status: "enviada",
      encaminhada: true,
      autor_id: u.user.id,
      autor_email: u.user.email ?? null,
    });

    const previa = ehMidia ? "📎 Mídia" : (msg.corpo ?? "").slice(0, 120);
    await admin.from("conversas")
      .update({ ultimo_em: new Date().toISOString(), ultima_msg: `Você: ${previa}` })
      .eq("id", destino_conversa_id);

    return json({ ok: true });
  } catch (err) {
    console.error("whatsapp_encaminhar_error", err);
    return json({ error: "internal_error", message: String(err) }, 500);
  }
});
