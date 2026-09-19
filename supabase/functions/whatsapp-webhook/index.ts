// Webhook de entrada do WhatsApp (provedor WAHA) — Sistema CRM.
//
// A WAHA deve ser configurada para POSTar os eventos aqui:
//   {PUBLIC_FUNCTIONS_URL}/whatsapp-webhook?secret={WHATSAPP_WEBHOOK_SECRET}
//
// Trata eventos "message" / "message.any":
//   - fromMe=false → entrada (lead/contato)
//   - fromMe=true  → saída (enviada pelo celular ou eco do CRM)
// Dedupe por wa_message_id evita duplicar o que o whatsapp-send já gravou.
//
// ⚠️ Sessão/secret/numero são exclusivos do Sistema CRM — nada compartilhado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { avisarSecretaria } from "../_shared/avisarSecretaria.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function tipoDeMime(mime?: string | null): string {
  if (!mime) return "documento";
  if (mime.startsWith("image/")) return mime.includes("webp") ? "figurinha" : "imagem";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "documento";
}

// "5511999999999@c.us" -> "5511999999999"; "12036-1623@g.us" (grupo) -> dígitos
function digitosDoChatId(chatId: string): string {
  return (chatId.split("@")[0] ?? "").replace(/\D/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // -------- valida secret --------
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") ?? req.headers.get("x-webhook-secret");
  const expected = Deno.env.get("WHATSAPP_WEBHOOK_SECRET");
  if (!expected || secret !== expected) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const evt = await req.json().catch(() => null);
    const event: string = evt?.event ?? "";
    const p = evt?.payload ?? {};

    // message.ack: atualiza o status de entrega/leitura das mensagens ENVIADAS
    // (para os "risquinhos": enviada ✓, entregue ✓✓, lida ✓✓ azul).
    if (event === "message.ack") {
      // o id pode vir como string serializada ("true_55..@c.us_3EB0..") ou
      // como objeto ({ _serialized, id, ... }) dependendo do engine da WAHA.
      const rawId = p.id ?? p.ack?.id ?? null;
      const waId =
        rawId && typeof rawId === "object" ? (rawId._serialized ?? rawId.id ?? null) : rawId;
      const serial = waId ? String(waId) : "";
      // só nos interessa o ack das mensagens que NÓS enviamos (fromMe=true).
      const fromMe = p.fromMe === true || serial.startsWith("true_");
      // o endereço do chat vem ora como @c.us ora como @lid; então casamos pelo
      // ID da mensagem (3º campo do serial: fromMe_chat_MSGID[_participante]),
      // que é único e estável entre o envio e o ack.
      const msgId = serial.split("_")[2] || serial;
      const a = String(p.ackName ?? "").toUpperCase();
      const n = Number(p.ack ?? 0);
      let novo: string | null = null;
      if (a === "READ" || a === "PLAYED" || n >= 3) novo = "lida";
      else if (a === "DEVICE" || n === 2) novo = "entregue";
      else if (a === "SERVER" || n === 1) novo = "enviada";
      // nunca rebaixa (ex.: DEVICE atrasado depois de READ); só sobe o status.
      const rank: Record<string, number> = { pendente: 0, enviada: 1, entregue: 2, lida: 3 };
      const deStatus = Object.keys(rank).filter((s) => rank[s] < (rank[novo ?? ""] ?? 0));
      let matched = 0;
      if (fromMe && novo && msgId) {
        const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data: upd } = await sb
          .from("mensagens")
          .update({ status: novo })
          .eq("direcao", "saida")
          .ilike("wa_message_id", `%${msgId}%`)
          .in("status", deStatus)
          .select("id");
        matched = upd?.length ?? 0;
      }
      console.log(`[ack] name=${a} n=${n} fromMe=${fromMe} novo=${novo} matched=${matched} msgId=${msgId}`);
      return new Response(JSON.stringify({ ok: true, ack: novo, matched }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Só tratamos mensagens; demais eventos (session.status etc.) respondem ok.
    if (event !== "message" && event !== "message.any") {
      return new Response(JSON.stringify({ ok: true, ignored: event }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fromMe = p.fromMe === true;
    // Entrada: "from" é o chat. Saída (celular/CRM): o chat é "to".
    const waChatId: string = fromMe ? (p.to ?? p.from ?? "") : (p.from ?? "");
    if (!waChatId) {
      return new Response(JSON.stringify({ error: "no_chat_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const direcao = fromMe ? "saida" : "entrada";

    // Resolve o chat para o id real @c.us. @lid é resolvido via WAHA
    // (GET /api/{session}/lids/{lid} → { pn }). status/grupos/newsletter são ignorados.
    let chatId = waChatId;
    let ehGrupo = false;
    if (waChatId.endsWith("@g.us")) {
      ehGrupo = true; // grupo: o próprio id do grupo é o chat
    } else if (waChatId.endsWith("@lid")) {
      const wahaUrl = (Deno.env.get("WAHA_URL") ?? "").replace(/\/$/, "");
      const wahaKey = Deno.env.get("WAHA_API_KEY") ?? "";
      const session = Deno.env.get("WAHA_SESSION") ?? "default";
      try {
        const r = await fetch(`${wahaUrl}/api/${session}/lids/${encodeURIComponent(waChatId)}`, {
          headers: { "X-Api-Key": wahaKey },
        });
        const j = r.ok ? await r.json() : null;
        if (j?.pn) chatId = j.pn;
      } catch (_e) { /* ignora; cai no filtro abaixo */ }
    }
    // ignora status/broadcast/newsletter e @lid não resolvido
    if (!ehGrupo && !chatId.endsWith("@c.us")) {
      return new Response(JSON.stringify({ ok: true, ignored: "nao_suportado", chat: waChatId }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const waMessageId: string | null = p.id ?? null;
    const corpo: string | null = p.body ?? null;
    const mime: string | null = p.media?.mimetype ?? null;
    const mediaUrl: string | null = p.media?.url ?? null;
    const mediaNome: string | null = p.media?.filename ?? null;
    const mediaType: string | undefined = p._data?.Info?.MediaType;
    const mtMap: Record<string, string> = {
      image: "imagem", sticker: "figurinha", video: "video", audio: "audio", ptt: "audio", document: "documento",
    };
    const tipo = mediaType && mtMap[mediaType]
      ? mtMap[mediaType]
      : p.hasMedia || mediaUrl
        ? tipoDeMime(mime)
        : "texto";
    const nomeWhats: string | null =
      p._data?.Info?.PushName ?? p.notifyName ?? p._data?.notifyName ?? null;

    // Em grupo, o nome/PushName é de QUEM enviou (não do grupo). Identifica o remetente.
    const participante = ehGrupo
      ? (p.participant ?? p.author ?? p._data?.Info?.Sender ?? null)
      : null;
    const remetenteTelefone = participante ? digitosDoChatId(String(participante)) : null;
    const remetenteNome = ehGrupo ? nomeWhats : null;

    // Se a mensagem recebida for uma resposta, guarda o id da mensagem citada (best-effort).
    const respondeA = p.replyTo ?? p._data?.quotedStanzaID ??
      p._data?.message?.extendedTextMessage?.contextInfo?.stanzaId ?? null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // -------- dedupe por wa_message_id --------
    if (waMessageId) {
      const { data: existente } = await supabase
        .from("mensagens")
        .select("id")
        .eq("wa_message_id", waMessageId)
        .maybeSingle();
      if (existente) {
        return new Response(JSON.stringify({ ok: true, duplicate: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // -------- acha/cria conversa --------
    const telefone = digitosDoChatId(chatId);
    let conversaId: string;
    const { data: conv } = await supabase
      .from("conversas")
      .select("id, nao_lidas, contato_id")
      .eq("wa_chat_id", chatId)
      .maybeSingle();

    if (conv) {
      conversaId = conv.id;
    } else {
      // grupos não casam com contato; o nome do grupo vem do sync (chats/overview)
      let contatoId: string | null = null;
      if (!ehGrupo && telefone.length >= 8) {
        const ult8 = telefone.slice(-8);
        const { data: ct } = await supabase
          .from("contatos")
          .select("id")
          .ilike("telefone_digits", `%${ult8}%`)
          .limit(1)
          .maybeSingle();
        contatoId = ct?.id ?? null;
      }
      const { data: nova, error } = await supabase
        .from("conversas")
        .insert({
          wa_chat_id: chatId,
          telefone,
          nome_whatsapp: ehGrupo ? null : nomeWhats,
          contato_id: contatoId,
          eh_grupo: ehGrupo,
        })
        .select("id")
        .single();
      if (error || !nova) throw error ?? new Error("conversa_insert_failed");
      conversaId = nova.id;
    }

    // -------- insere mensagem --------
    const { error: msgErr } = await supabase.from("mensagens").insert({
      conversa_id: conversaId,
      wa_message_id: waMessageId,
      direcao,
      corpo,
      tipo,
      media_url: mediaUrl,
      media_mime: mime,
      media_nome: mediaNome,
      status: fromMe ? "enviada" : "entregue",
      remetente_nome: fromMe ? null : remetenteNome,
      remetente_telefone: fromMe ? null : remetenteTelefone,
      responde_a: respondeA ? String(respondeA) : null,
    });
    if (msgErr) throw msgErr;

    // -------- atualiza conversa (último em / não lidas / nome) --------
    // Saída do celular/CRM não incrementa não lidas.
    const naoLidas = fromMe ? (conv?.nao_lidas ?? 0) : (conv?.nao_lidas ?? 0) + 1;
    const base = corpo ? corpo.slice(0, 120) : tipo !== "texto" ? "📎 Mídia" : "";
    // em grupo, prefixa a prévia com o primeiro nome de quem enviou (estilo WhatsApp)
    const previa = ((ehGrupo && !fromMe && remetenteNome ? `${remetenteNome.split(" ")[0]}: ` : "") + base) || null;
    await supabase
      .from("conversas")
      .update({
        ultimo_em: new Date().toISOString(),
        nao_lidas: naoLidas,
        ultima_msg: previa,
        // só atualiza o nome em conversas individuais (em grupo o nome é o do grupo, via sync)
        ...(nomeWhats && !ehGrupo && !fromMe ? { nome_whatsapp: nomeWhats } : {}),
      })
      .eq("id", conversaId);

    // -------- Captação Instagram (frase de ativação vinda do Linktree) --------
    const corpoNorm = (corpo ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
    if (!fromMe && !ehGrupo && corpoNorm.includes("vim do instagram")) {
      // dedupe: só cria o lead uma vez por conversa
      const { count: jaCapturado } = await supabase
        .from("entradas_log").select("id", { count: "exact", head: true })
        .eq("canal", "instagram").filter("payload->>wa_chat_id", "eq", chatId);
      if (!jaCapturado) {
        const { data: cc } = await supabase.from("conversas").select("contato_id").eq("id", conversaId).maybeSingle();
        let contatoLeadId: string | null = cc?.contato_id ?? null;
        if (!contatoLeadId) {
          const { data: novoC } = await supabase.from("contatos")
            .insert({ nome: nomeWhats || `Instagram ${telefone.slice(-4)}`, telefone }).select("id").single();
          contatoLeadId = novoC?.id ?? null;
          if (contatoLeadId) await supabase.from("conversas").update({ contato_id: contatoLeadId }).eq("id", conversaId);
        }
        const { data: etapa } = await supabase.from("etapas").select("id").ilike("nome", "Lead novo").limit(1).maybeSingle();
        if (contatoLeadId) {
          const { data: opp } = await supabase.from("oportunidades").insert({
            contato_id: contatoLeadId,
            titulo: nomeWhats || "Lead Instagram",
            origem: "Instagram",
            etapa_id: etapa?.id ?? null,
            observacoes: "Entrou pelo Instagram (Linktree → WhatsApp)",
          }).select("id").single();
          await supabase.from("entradas_log").insert({
            canal: "instagram", origem: "Instagram",
            payload: { wa_chat_id: chatId, mensagem: corpo },
            contato_id: contatoLeadId, oportunidade_id: opp?.id ?? null,
          });
          await avisarSecretaria({ tipo: "lead", nome: nomeWhats || "Lead do Instagram", telefone, origem: "Instagram" });
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, conversa_id: conversaId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("whatsapp_webhook_error", err);
    return new Response(JSON.stringify({ error: "internal_error", message: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
