// Sincroniza as conversas do WhatsApp (WAHA) para o Sistema CRM.
// A WAHA é a fonte: lê chats/overview (id real @c.us, nome, foto, última msg)
// e as mensagens recentes de cada conversa, populando conversas/mensagens.
// Corrige o problema dos chats @lid (sem nome/foto/telefone) gravados pelo webhook.
//
// Protegido por ?secret= (AGENDA_SYNC_SECRET reutilizado p/ jobs internos) ou
// WHATSAPP_WEBHOOK_SECRET. ?dryRun=1 lista sem gravar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function tipoDeMime(mime?: string | null): string {
  if (!mime) return "documento";
  if (mime.startsWith("image/")) return mime.includes("webp") ? "figurinha" : "imagem";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "documento";
}

// Classifica a mensagem da WAHA mesmo sem baixar a mídia (usa o MediaType do engine).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tipoDaMensagem(m: any): string {
  const mt: string | undefined = m?._data?.Info?.MediaType;
  if (mt) {
    if (mt === "image") return "imagem";
    if (mt === "sticker") return "figurinha";
    if (mt === "video") return "video";
    if (mt === "audio" || mt === "ptt") return "audio";
    if (mt === "document") return "documento";
  }
  if (m?.hasMedia || m?.media?.url || m?.media) return tipoDeMime(m?.media?.mimetype);
  return "texto";
}

// conversas individuais (@c.us) e grupos (@g.us); ignora status/broadcast/newsletter/@lid
function ehChatSuportado(id: string): boolean {
  return id.endsWith("@c.us") || id.endsWith("@g.us");
}

function tsToIso(ts: number | undefined): string {
  if (!ts) return new Date(0).toISOString();
  // WAHA manda em segundos
  return new Date((ts > 1e12 ? ts : ts * 1000)).toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  const ok = secret === Deno.env.get("AGENDA_SYNC_SECRET") || secret === Deno.env.get("WHATSAPP_WEBHOOK_SECRET");
  if (!ok) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const dryRun = url.searchParams.get("dryRun") === "1";
  const msgLimit = Number(url.searchParams.get("msgLimit") ?? "40");

  const wahaUrl = (Deno.env.get("WAHA_URL") ?? "").replace(/\/$/, "");
  const wahaKey = Deno.env.get("WAHA_API_KEY") ?? "";
  const session = Deno.env.get("WAHA_SESSION") ?? "default";
  if (!wahaUrl || !wahaKey) {
    return new Response(JSON.stringify({ error: "waha_not_configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const H = { "X-Api-Key": wahaKey };
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const ovRes = await fetch(`${wahaUrl}/api/${session}/chats/overview?limit=100`, { headers: H });
    if (!ovRes.ok) {
      return new Response(JSON.stringify({ error: "waha_overview", detail: await ovRes.text() }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chats: any[] = (await ovRes.json()).filter((c: any) => ehChatSuportado(c.id ?? ""));

    if (dryRun) {
      return new Response(JSON.stringify({
        ok: true, total: chats.length,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chats: chats.map((c: any) => ({ id: c.id, name: c.name, picture: !!c.picture })),
      }, null, 2), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let convs = 0, msgs = 0;
    for (const c of chats) {
      const waChatId: string = c.id;
      const ehGrupo = waChatId.endsWith("@g.us");
      const telefone = waChatId.split("@")[0].replace(/\D/g, "");
      const lm = c.lastMessage ?? {};
      // em grupo o nome é o assunto do grupo (c.name); nunca o PushName de quem mandou
      const nome = ehGrupo ? (c.name || null) : (c.name || lm._data?.Info?.PushName || null);
      const baseLm = lm.body ? String(lm.body).slice(0, 120) : (lm.hasMedia || lm.media ? "📎 Mídia" : "");
      const senderLm = ehGrupo && !lm.fromMe ? (lm._data?.Info?.PushName ?? null) : null;
      const previa: string | null = ((senderLm ? `${senderLm.split(" ")[0]}: ` : "") + baseLm) || null;

      // grupos não casam com contato
      let contatoId: string | null = null;
      if (!ehGrupo && telefone.length >= 8) {
        const { data: ct } = await admin.from("contatos").select("id")
          .ilike("telefone_digits", `%${telefone.slice(-8)}%`).limit(1).maybeSingle();
        contatoId = ct?.id ?? null;
      }

      const { data: conv, error: convErr } = await admin.from("conversas").upsert({
        wa_chat_id: waChatId,
        telefone,
        nome_whatsapp: nome,
        foto_url: c.picture ?? null,
        contato_id: contatoId,
        eh_grupo: ehGrupo,
        ultima_msg: previa,
        ultimo_em: tsToIso(c.lastMessage?.timestamp),
      }, { onConflict: "wa_chat_id" }).select("id").single();
      if (convErr || !conv) continue;
      convs++;

      // mensagens recentes da conversa
      const mRes = await fetch(
        `${wahaUrl}/api/${session}/chats/${encodeURIComponent(waChatId)}/messages?limit=${msgLimit}&downloadMedia=false`,
        { headers: H },
      );
      if (!mRes.ok) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lista: any[] = await mRes.json();
      for (const m of lista) {
        const mime = m.media?.mimetype ?? null;
        const tipo = tipoDaMensagem(m);
        // em grupo, identifica quem enviou cada mensagem recebida
        const participante = ehGrupo && !m.fromMe ? (m.author ?? m.participant ?? m._data?.Info?.Sender ?? null) : null;
        const { error: msgErr } = await admin.from("mensagens").upsert({
          conversa_id: conv.id,
          wa_message_id: m.id ?? null,
          direcao: m.fromMe ? "saida" : "entrada",
          corpo: m.body ?? null,
          tipo,
          media_url: m.media?.url ?? null,
          media_mime: mime,
          status: m.fromMe ? "enviada" : "entregue",
          criado_em: tsToIso(m.timestamp),
          remetente_telefone: participante ? String(participante).split("@")[0].replace(/\D/g, "") : null,
          remetente_nome: ehGrupo && !m.fromMe ? (m._data?.Info?.PushName ?? null) : null,
          responde_a: m.replyTo ?? m._data?.quotedStanzaID ??
            m._data?.message?.extendedTextMessage?.contextInfo?.stanzaId ?? null,
        }, { onConflict: "wa_message_id" });
        if (!msgErr) msgs++;
      }
    }

    return new Response(JSON.stringify({ ok: true, conversas: convs, mensagens: msgs }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("whatsapp_sync_error", err);
    return new Response(JSON.stringify({ error: "internal_error", message: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
