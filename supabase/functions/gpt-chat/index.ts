// Assistente GPT (OpenAI Responses API) do CRM — chat de uso geral, por usuário.
// Recursos: streaming, visão (imagens de entrada), BUSCA NA WEB (web_search nativo)
// e GERAÇÃO DE IMAGEM (ferramenta gerar_imagem -> gpt-image-1 -> Storage).
//
// Protocolo SSE devolvido ao front (cada linha `data: <json>`):
//   { "meta": { "conversa_id", "titulo" } }
//   { "delta": "<texto>" }
//   { "tool": "web_search" }            -> pesquisou na web
//   { "status": "<msg>" }               -> progresso (ex.: gerando imagem)
//   { "image": { "url": "<url>" } }     -> imagem gerada pronta
//   { "done": true } | { "error": "<msg>" }
//
// verify_jwt = true (default) — só usuários autenticados.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODELOS_OK = new Set(["gpt-4o", "gpt-4o-mini"]);
const SYSTEM_PROMPT =
  "Você é um assistente útil, direto e confiável. Responda em português do Brasil, salvo se " +
  "pedirem outro idioma. Use markdown quando ajudar (listas, tabelas, blocos de código). " +
  "Você pode pesquisar na internet quando precisar de informação atual e pode gerar imagens " +
  "com a ferramenta gerar_imagem quando pedirem para criar/desenhar/gerar uma imagem. " +
  "Ao gerar uma imagem, NÃO a inclua em markdown (![](...)) na resposta — ela já é exibida " +
  "automaticamente na tela; apenas comente brevemente. Seja objetivo.";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Anexo = { tipo: string; nome?: string; mime?: string; url?: string; texto?: string };

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Converte o histórico do banco para o formato `input` do Responses API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapHistory(hist: any[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const input: any[] = [];
  for (const m of hist) {
    const anexos: Anexo[] = Array.isArray(m.anexos) ? m.anexos : [];
    if (m.papel === "user") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const content: any[] = [];
      if (m.conteudo) content.push({ type: "input_text", text: m.conteudo });
      for (const a of anexos) {
        if (a.tipo === "imagem" && a.url) content.push({ type: "input_image", image_url: a.url });
        else if (a.tipo === "arquivo" && a.texto) content.push({ type: "input_text", text: `[Arquivo: ${a.nome ?? "arquivo"}]\n${a.texto}` });
      }
      if (content.length === 0) content.push({ type: "input_text", text: "(vazio)" });
      input.push({ role: "user", content });
    } else if (m.papel === "assistant") {
      const texto = m.conteudo || (anexos.some((a) => a.tipo === "imagem") ? "[imagem gerada]" : "");
      if (texto) input.push({ role: "assistant", content: [{ type: "output_text", text: texto }] });
    }
  }
  return input;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp({ error: "method_not_allowed" }, 405);

  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) return jsonResp({ error: "openai_key_missing" }, 500);
  const openaiHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` };

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: userData } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (!user) return jsonResp({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  if (!body) return jsonResp({ error: "bad_request" }, 400);
  const content: string = (body.content ?? "").toString();
  const anexos: Anexo[] = Array.isArray(body.anexos) ? body.anexos : [];
  const modelo = MODELOS_OK.has(body.modelo) ? body.modelo : "gpt-4o";
  let conversaId: string | null = body.conversa_id ?? null;
  if (!content.trim() && anexos.length === 0) return jsonResp({ error: "empty_message" }, 400);

  let titulo = "Nova conversa";
  if (conversaId) {
    const { data: conv } = await admin
      .from("gpt_conversas").select("id, titulo, user_id").eq("id", conversaId).maybeSingle();
    if (!conv || conv.user_id !== user.id) return jsonResp({ error: "conversa_not_found" }, 404);
    titulo = conv.titulo;
  } else {
    titulo = (content.trim() || "Imagem").slice(0, 60);
    const { data: nova, error } = await admin
      .from("gpt_conversas").insert({ user_id: user.id, titulo, modelo }).select("id").single();
    if (error || !nova) return jsonResp({ error: "conversa_insert_failed" }, 500);
    conversaId = nova.id;
  }

  await admin.from("gpt_mensagens").insert({ conversa_id: conversaId, papel: "user", conteudo: content, anexos });

  const { data: hist } = await admin
    .from("gpt_mensagens").select("papel, conteudo, anexos")
    .eq("conversa_id", conversaId).order("criado_em", { ascending: true });

  const cid = conversaId as string;
  const enc = new TextEncoder();

  // Gera imagem via gpt-image-1 e sobe pro Storage (bucket público gpt-media).
  async function gerarImagem(prompt: string): Promise<string> {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: openaiHeaders,
      body: JSON.stringify({ model: "gpt-image-1", prompt, n: 1, size: "1024x1024" }),
    });
    if (!r.ok) throw new Error(`img_${r.status}: ${(await r.text()).slice(0, 140)}`);
    const j = await r.json();
    const b64 = j.data?.[0]?.b64_json;
    if (!b64) throw new Error("sem_imagem");
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const path = `${user!.id}/${crypto.randomUUID()}.png`;
    const up = await admin.storage.from("gpt-media").upload(path, bytes, { contentType: "image/png", upsert: false });
    if (up.error) throw up.error;
    return admin.storage.from("gpt-media").getPublicUrl(path).data.publicUrl;
  }

  const tools = [
    { type: "web_search_preview" },
    {
      type: "function",
      name: "gerar_imagem",
      description: "Gera uma imagem a partir de uma descrição. Use quando pedirem para criar/desenhar/gerar/ilustrar uma imagem.",
      parameters: {
        type: "object",
        properties: { prompt: { type: "string", description: "Descrição detalhada da imagem a gerar." } },
        required: ["prompt"],
        additionalProperties: false,
      },
    },
  ];

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      send({ meta: { conversa_id: cid, titulo } });

      let fullText = "";
      const imagens: Anexo[] = [];
      let usouWeb = false;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let input: any = mapHistory(hist ?? []);
      let prevId: string | null = null;

      try {
        for (let iter = 0; iter < 4; iter++) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const payload: any = { model: modelo, instructions: SYSTEM_PROMPT, tools, tool_choice: "auto", stream: true, store: true, input };
          if (prevId) payload.previous_response_id = prevId;

          const resp = await fetch("https://api.openai.com/v1/responses", {
            method: "POST", headers: openaiHeaders, body: JSON.stringify(payload),
          });
          if (!resp.ok || !resp.body) {
            send({ error: `openai_${resp.status}: ${(await resp.text().catch(() => "")).slice(0, 200)}` });
            break;
          }

          const reader = resp.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          let func: { name: string; call_id: string; args: string } | null = null;
          let completedId: string | null = null;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const linhas = buf.split("\n");
            buf = linhas.pop() ?? "";
            for (const l of linhas) {
              const t = l.trim();
              if (!t.startsWith("data:")) continue;
              const dado = t.slice(5).trim();
              if (!dado || dado === "[DONE]") continue;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              let j: any;
              try { j = JSON.parse(dado); } catch { continue; }
              const ty = j.type as string;
              if (ty === "response.output_text.delta") {
                fullText += j.delta ?? "";
                send({ delta: j.delta ?? "" });
              } else if (ty === "response.output_item.added") {
                const it = j.item ?? {};
                if (it.type === "function_call") func = { name: it.name, call_id: it.call_id, args: "" };
                else if (typeof it.type === "string" && it.type.includes("web_search") && !usouWeb) {
                  usouWeb = true; send({ tool: "web_search" });
                }
              } else if (ty === "response.function_call_arguments.delta") {
                if (func) func.args += j.delta ?? "";
              } else if (ty === "response.completed") {
                completedId = j.response?.id ?? null;
              }
            }
          }
          prevId = completedId;

          if (func && func.name === "gerar_imagem") {
            send({ status: "🎨 Gerando imagem…" });
            let url: string | null = null;
            let erro: string | null = null;
            try {
              const args = JSON.parse(func.args || "{}");
              url = await gerarImagem(String(args.prompt || content || "imagem"));
            } catch (e) { erro = String(e).slice(0, 150); }
            if (url) {
              imagens.push({ tipo: "imagem", nome: "imagem.png", mime: "image/png", url });
              send({ image: { url } });
              input = [{ type: "function_call_output", call_id: func.call_id, output: JSON.stringify({ ok: true, url }) }];
            } else {
              send({ status: "⚠️ Não consegui gerar a imagem." });
              input = [{ type: "function_call_output", call_id: func.call_id, output: JSON.stringify({ ok: false, erro }) }];
            }
            continue; // volta ao loop para o modelo fechar a resposta
          }
          break; // sem tool call -> terminou
        }
      } catch (e) {
        send({ error: String(e).slice(0, 200) });
      }

      if (fullText || imagens.length) {
        await admin.from("gpt_mensagens").insert({ conversa_id: cid, papel: "assistant", conteudo: fullText, anexos: imagens });
      }
      await admin.from("gpt_conversas").update({ atualizado_em: new Date().toISOString() }).eq("id", cid);
      send({ done: true });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
