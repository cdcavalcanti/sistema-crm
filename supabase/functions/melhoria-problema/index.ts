// "Reportar problema" — disparado pelo botão na lista de "Chamadas recentes" do
// CRM. Avisa o grupo (mesmo grupo onde a melhoria é enviada para aprovação) que
// o solicitante NÃO conseguiu confirmar que o ajuste foi realmente realizado.
// A notificação é estruturada para que o time consiga agir rápido.
//
// Body: { melhoria_id }
// Auth: Bearer (JWT do usuário logado no CRM).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PROJETO = "Sistema CRM";

// Rótulos amigáveis de status (espelham os do app em PedirMelhoria.tsx).
const STATUS_LABEL: Record<string, string> = {
  solicitada: "Em análise",
  preparando: "Preparando ajuste",
  aguardando_aprovacao: "Aguardando aprovação",
  aprovada: "Aprovada · subindo",
  concluida: "Concluída",
  backlog: "Backlog",
  falhou: "Falhou",
};

// Envia ao grupo via WAHA (mesmo canal das notificações de aprovação).
async function enviarGrupo(texto: string): Promise<boolean> {
  const chatId = Deno.env.get("ALERTA_WHATSAPP_CHATID");
  const wahaUrl = (Deno.env.get("WAHA_URL") ?? "").replace(/\/$/, "");
  const wahaKey = Deno.env.get("WAHA_API_KEY") ?? "";
  const session = Deno.env.get("ALERTA_WAHA_SESSION") ?? Deno.env.get("WAHA_SESSION") ?? "default";
  if (!chatId || !wahaUrl || !wahaKey) return false;
  try {
    const r = await fetch(`${wahaUrl}/api/sendText`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Api-Key": wahaKey },
      body: JSON.stringify({ session, chatId, text: texto }),
    });
    return r.ok;
  } catch (e) { console.error("enviarGrupo_falhou", e); return false; }
}

function montarMensagem(
  m: { titulo: string; descricao: string | null; status: string; resumo_ajuste: string | null; solicitante_email: string | null },
  reportadoPor: string,
) {
  const statusLabel = STATUS_LABEL[m.status] ?? m.status;
  const ajuste = (m.resumo_ajuste ?? "").trim();
  const quando = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return (
    `⚠️ *Problema na confirmação do ajuste* — *${PROJETO}*\n` +
    `━━━━━━━━━━━━━━━\n` +
    `📌 *Melhoria:* ${m.titulo}\n` +
    `🙋 *Solicitante:* ${m.solicitante_email ?? "—"}\n` +
    `📊 *Status atual:* ${statusLabel}\n` +
    `🔧 *O que deveria ter subido:* ${ajuste.length > 4 ? ajuste.slice(0, 320) : "—"}\n` +
    `━━━━━━━━━━━━━━━\n` +
    `🚨 O solicitante *não conseguiu confirmar* que o ajuste foi realmente realizado.\n` +
    `👉 Por favor, verifiquem se a mudança foi publicada/aplicada em produção e retornem ao solicitante.\n` +
    `━━━━━━━━━━━━━━━\n` +
    `📣 *Reportado por:* ${reportadoPor}\n` +
    `🕒 ${quando}`
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Autenticação: só usuário logado no CRM pode reportar.
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: u, error: uErr } = await uc.auth.getUser(auth.replace("Bearer ", ""));
  if (uErr || !u?.user) return json({ error: "unauthorized" }, 401);

  const { melhoria_id } = await req.json().catch(() => ({}));
  if (!melhoria_id) return json({ error: "melhoria_id_obrigatorio" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: mel, error: melErr } = await admin
    .from("melhorias")
    .select("titulo, descricao, status, resumo_ajuste, solicitante_email, problema_reportado_em")
    .eq("id", melhoria_id)
    .maybeSingle();
  if (melErr) return json({ error: "db_erro", detalhe: melErr.message }, 500);
  if (!mel) return json({ error: "nao_encontrada" }, 404);

  // Garante o registro do report (idempotente). A RPC chamada pelo front já faz
  // isso, mas reforçamos aqui caso a função seja chamada isoladamente.
  if (!mel.problema_reportado_em) {
    await admin.from("melhorias").update({
      problema_reportado_em: new Date().toISOString(),
      problema_reportado_por: u.user.email ?? null,
    }).eq("id", melhoria_id);
  }

  const ok = await enviarGrupo(montarMensagem(mel, u.user.email ?? "usuário do CRM"));
  // Marca como notificado pra o cron (melhorias-monitor) não reenviar o aviso.
  if (ok) {
    await admin.from("melhorias").update({ problema_notificado_em: new Date().toISOString() }).eq("id", melhoria_id);
    return json({ ok: true });
  }
  // Não conseguiu enviar agora: deixa notificado_em nulo pro monitor reenviar.
  return json({ error: "notificacao_nao_enviada" }, 502);
});
