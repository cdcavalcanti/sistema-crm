// Proxy de mídia do WhatsApp (WAHA) → navegador. Sistema CRM.
// Busca a mídia de uma mensagem na WAHA (sob demanda) e devolve os bytes,
// pro front tocar áudio/vídeo, ver imagem ou baixar arquivo. Requer JWT.
//
// Body: { conversa_id, wa_message_id }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405, headers: corsHeaders });

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return new Response("unauthorized", { status: 401, headers: corsHeaders });
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: u, error: uErr } = await userClient.auth.getUser(auth.replace("Bearer ", ""));
  if (uErr || !u?.user) return new Response("unauthorized", { status: 401, headers: corsHeaders });

  const { conversa_id, wa_message_id } = await req.json().catch(() => ({}));
  if (!conversa_id || !wa_message_id) {
    return new Response(JSON.stringify({ error: "invalid_payload" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: conversa } = await admin.from("conversas").select("wa_chat_id").eq("id", conversa_id).maybeSingle();
  if (!conversa) return new Response(JSON.stringify({ error: "conversa_not_found" }), { status: 404, headers: corsHeaders });

  const wahaUrl = (Deno.env.get("WAHA_URL") ?? "").replace(/\/$/, "");
  const wahaKey = Deno.env.get("WAHA_API_KEY") ?? "";
  const session = Deno.env.get("WAHA_SESSION") ?? "default";
  const H = { "X-Api-Key": wahaKey };

  try {
    // Busca a mensagem com a mídia baixada
    const mUrl =
      `${wahaUrl}/api/${session}/chats/${encodeURIComponent(conversa.wa_chat_id)}` +
      `/messages/${encodeURIComponent(wa_message_id)}?downloadMedia=true`;
    const mRes = await fetch(mUrl, { headers: H });
    if (!mRes.ok) {
      return new Response(JSON.stringify({ error: "waha_message", detail: await mRes.text() }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const m = await mRes.json();
    const url: string | null = m?.media?.url ?? null;
    const mimetype: string = m?.media?.mimetype ?? "application/octet-stream";
    if (!url) {
      return new Response(JSON.stringify({ error: "sem_midia" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Baixa os bytes da mídia (a url da WAHA exige a API key)
    const fileRes = await fetch(url, { headers: H });
    if (!fileRes.ok) {
      return new Response(JSON.stringify({ error: "media_fetch", detail: await fileRes.text() }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const bytes = await fileRes.arrayBuffer();
    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": mimetype,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    console.error("whatsapp_media_error", err);
    return new Response(JSON.stringify({ error: "internal_error", message: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
