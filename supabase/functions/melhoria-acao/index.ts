// API JSON da aprovação de melhorias (consumida pela página /aprovar do app).
// POST { op, id, t, acao }
//   op="info"     → devolve dados da melhoria pra montar a tela de confirmação
//   op="executar" → aplica a ação (aprovar|backlog) — só no clique do usuário
// Servir HTML direto daqui não funciona (Supabase força text/plain), por isso
// a UI fica no app (Vercel) e aqui é só dados.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function enviarGrupo(texto: string) {
  const chatId = Deno.env.get("ALERTA_WHATSAPP_CHATID");
  const wahaUrl = (Deno.env.get("WAHA_URL") ?? "").replace(/\/$/, "");
  const wahaKey = Deno.env.get("WAHA_API_KEY") ?? "";
  const session = Deno.env.get("ALERTA_WAHA_SESSION") ?? Deno.env.get("WAHA_SESSION") ?? "default";
  if (!chatId || !wahaUrl || !wahaKey) return;
  await fetch(`${wahaUrl}/api/sendText`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Api-Key": wahaKey },
    body: JSON.stringify({ session, chatId, text: texto }),
  }).catch(() => {});
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const { op, id, t, acao } = await req.json().catch(() => ({}));
  if (!id || !t) return json({ error: "parametros_invalidos" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: mel } = await admin.from("melhorias").select("*").eq("id", id).maybeSingle();
  if (!mel || mel.token !== t) return json({ error: "nao_encontrada" }, 403);

  // ---- info: dados pra tela ----
  if (op === "info") {
    return json({ ok: true, titulo: mel.titulo, descricao: mel.descricao, resumo: mel.resumo_ajuste, status: mel.status });
  }

  // ---- executar: aplica a ação ----
  if (op === "executar") {
    if (["concluida", "aprovada", "backlog"].includes(mel.status)) {
      return json({ ok: true, jaProcessada: true, status: mel.status });
    }
    if (acao === "aprovar") {
      await admin.from("melhorias").update({ status: "aprovada" }).eq("id", id);
      await enviarGrupo(`👍 *Aprovada:* ${mel.titulo}\n_Subindo automaticamente se o build passar…_`);
      return json({ ok: true, status: "aprovada" });
    }
    if (acao === "backlog") {
      await admin.from("melhorias").update({ status: "backlog" }).eq("id", id);
      await enviarGrupo(`📋 *Em backlog:* ${mel.titulo}`);
      return json({ ok: true, status: "backlog" });
    }
    return json({ error: "acao_invalida" }, 400);
  }

  return json({ error: "op_invalida" }, 400);
});
