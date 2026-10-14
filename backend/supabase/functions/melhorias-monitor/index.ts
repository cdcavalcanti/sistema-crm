// Orquestra o ciclo de vida das melhorias (cron, ?secret=AGENDA_SYNC_SECRET):
//   preparando            → acha/abre o PR do Claude → notifica o grupo (Aprovar/Backlog)
//   aguardando_aprovacao  → se ainda não notificou (notificado_em null), reenvia (retry)
//   aprovada              → checa o build (CI); se passou → merge → concluida → avisa grupo
//                           se falhou → falhou → avisa grupo
// Usa GITHUB_TOKEN com permissão de Contents/Pull requests/Issues/Actions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
const REPO = Deno.env.get("GITHUB_REPO") ?? "cdcavalcanti/sistema-crm";
const OWNER = REPO.split("/")[0];
const GH = Deno.env.get("GITHUB_TOKEN") ?? "";
const SUPA = Deno.env.get("SUPABASE_URL")!;
const APP = (Deno.env.get("APP_URL") ?? "").replace(/\/$/, ""); // URL pública do CRM (Vercel)
const PROJETO = "Sistema CRM";

const ghHeaders = { Authorization: `Bearer ${GH}`, Accept: "application/vnd.github+json", "User-Agent": "sistema-crm" };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gh(path: string, init: any = {}) {
  const r = await fetch(`https://api.github.com${path}`, { ...init, headers: { ...ghHeaders, ...(init.headers ?? {}) } });
  const txt = await r.text();
  let body: unknown = null;
  try { body = txt ? JSON.parse(txt) : null; } catch { body = txt; }
  return { ok: r.ok, status: r.status, body };
}

// Envia ao grupo e retorna se deu certo (pra controlar retry/duplicação).
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

// Limpa o texto do comentário do Claude pra virar um resumo legível:
// remove cabeçalho "Claude finished…", links, URLs, sobras de URL-encoding,
// blocos de código, checkboxes e marcações de markdown.
function limparResumo(s: string): string {
  let out = (s ?? "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, " ")     // [texto](url) e imagens
    .replace(/https?:\/\/\S+/g, " ")            // urls cruas
    .replace(/%[0-9A-Fa-f]{2}/g, " ")           // sobras de url-encoding (%20, %2C…)
    .replace(/Claude finished[^\n]*/gi, " ")    // boilerplate da action
    .replace(/—+/g, " ")
    .replace(/[•·]/g, " ")
    .replace(/^\s*[-*]\s*\[[ xX]\]\s*/gm, "")   // checkboxes "- [x]"
    .replace(/[#*`>_~|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return out;
}

// Prefere a seção "O que mudou / Resumo / Summary" do comentário do Claude
// (descarta o checklist de tarefas). Se não achar, limpa o corpo todo.
function extrairResumo(body: string): string {
  if (!body) return "";
  const m = body.match(
    /#{0,4}\s*(?:o que mudou|o que foi feito|resumo|summary|what changed|changes?)\s*:?\s*\n([\s\S]*?)(?=\n\s*#{1,4}\s|\n\s*<details|$)/i,
  );
  return limparResumo(m ? m[1] : body).slice(0, 360);
}

function montarMensagem(m: { id: string; token: string; titulo: string; descricao: string | null; solicitante_email: string | null }, resumo: string) {
  const aprovar = `${APP}/aprovar?id=${m.id}&acao=aprovar&t=${m.token}`;
  const backlog = `${APP}/aprovar?id=${m.id}&acao=backlog&t=${m.token}`;
  const ajuste = resumo && resumo.length > 8 ? resumo.slice(0, 320) : "Pequeno ajuste no CRM (ver detalhamento).";
  return (
    `🆕 *Nova melhoria* — *${PROJETO}*\n` +
    `━━━━━━━━━━━━━━━\n` +
    `📌 *Melhoria:* ${m.titulo}\n` +
    `🙋 *Solicitante:* ${m.solicitante_email ?? "—"}\n` +
    `📝 *Detalhamento:* ${(m.descricao ?? "—").trim().slice(0, 320)}\n` +
    `🔧 *O que vai subir:* ${ajuste}\n` +
    `━━━━━━━━━━━━━━━\n` +
    `Toque para decidir (precisa confirmar na tela):\n` +
    `✅ *Aprovar e publicar:*\n${aprovar}\n\n` +
    `📋 *Deixar no backlog:*\n${backlog}`
  );
}

// Notificação de uma nova solicitação (modo manual: sem PR/Claude ainda).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function montarMensagemSolicitada(m: any) {
  const aprovar = `${APP}/aprovar?id=${m.id}&acao=aprovar&t=${m.token}`;
  const backlog = `${APP}/aprovar?id=${m.id}&acao=backlog&t=${m.token}`;
  return (
    `🆕 *Nova melhoria solicitada* — *${PROJETO}*\n` +
    `━━━━━━━━━━━━━━━\n` +
    `📌 *Melhoria:* ${m.titulo}\n` +
    `🙋 *Solicitante:* ${m.solicitante_email ?? "—"}\n` +
    `📝 *Detalhamento:* ${(m.descricao ?? "—").trim().slice(0, 400)}\n` +
    `━━━━━━━━━━━━━━━\n` +
    `Toque para decidir (precisa confirmar na tela):\n` +
    `✅ *Aprovar:*\n${aprovar}\n\n` +
    `📋 *Deixar no backlog:*\n${backlog}`
  );
}

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

// Aviso ao grupo de que o solicitante NÃO conseguiu confirmar o ajuste.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function montarMensagemProblema(m: any): string {
  const statusLabel = STATUS_LABEL[m.status] ?? m.status;
  const ajuste = (m.resumo_ajuste ?? "").trim();
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
    `📣 *Reportado por:* ${m.problema_reportado_por ?? "usuário do CRM"}`
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function preparando(admin: any, m: any) {
  const refs = await gh(`/repos/${REPO}/git/matching-refs/heads/claude/issue-${m.issue_number}-`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const branchRef = Array.isArray(refs.body) && refs.body.length ? (refs.body[refs.body.length - 1] as any).ref : null;
  if (!branchRef) return; // Claude ainda não terminou
  const branch = branchRef.replace("refs/heads/", "");

  // acha PR existente desse branch; se não houver, cria
  let pr = null;
  const ex = await gh(`/repos/${REPO}/pulls?head=${OWNER}:${encodeURIComponent(branch)}&state=open`);
  if (Array.isArray(ex.body) && ex.body.length) pr = ex.body[0];
  if (!pr) {
    const c = await gh(`/repos/${REPO}/pulls`, {
      method: "POST",
      body: JSON.stringify({ title: m.titulo, head: branch, base: "main", body: `Resolve #${m.issue_number}` }),
    });
    if (!c.ok) return;
    pr = c.body;
  }

  // resumo "do que vai subir": comentário do claude[bot] na issue, limpo
  let resumo = "";
  const cms = await gh(`/repos/${REPO}/issues/${m.issue_number}/comments`);
  if (Array.isArray(cms.body)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bot = [...cms.body].reverse().find((c: any) => (c.user?.login ?? "").includes("claude"));
    if (bot?.body) resumo = extrairResumo(bot.body);
  }

  await admin.from("melhorias").update({
    status: "aguardando_aprovacao", pr_number: pr.number, pr_url: pr.html_url, resumo_ajuste: resumo || null,
  }).eq("id", m.id);

  const ok = await enviarGrupo(montarMensagem(m, resumo));
  if (ok) await admin.from("melhorias").update({ notificado_em: new Date().toISOString() }).eq("id", m.id);
}

// Modo manual: notifica o grupo de uma nova solicitação (sem PR; aprovação manual + implementação pelo time).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notificarSolicitada(admin: any, m: any) {
  const ok = await enviarGrupo(montarMensagemSolicitada(m));
  if (ok) await admin.from("melhorias").update({ notificado_em: new Date().toISOString() }).eq("id", m.id);
}

// Retry de notificação: melhoria já em aguardando_aprovacao mas que não chegou no grupo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function renotificar(admin: any, m: any) {
  const ok = await enviarGrupo(montarMensagem(m, m.resumo_ajuste ?? ""));
  if (ok) await admin.from("melhorias").update({ notificado_em: new Date().toISOString() }).eq("id", m.id);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function aprovada(admin: any, m: any) {
  if (!m.pr_number) return;
  const pr = await gh(`/repos/${REPO}/pulls/${m.pr_number}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prb = pr.body as any;
  if (!pr.ok || !prb) return;
  if (prb.merged) {
    await admin.from("melhorias").update({ status: "concluida" }).eq("id", m.id);
    await enviarGrupo(`✅ *Implementada* — *${PROJETO}*\n${m.titulo}\n_Já está no ar._`);
    return;
  }
  const sha = prb.head?.sha;
  if (!sha) return;
  const wr = await gh(`/repos/${REPO}/actions/runs?head_sha=${sha}&per_page=20`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const runs = (wr.body as any)?.workflow_runs ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const build = runs.find((r: any) => (r.name ?? "").toLowerCase() === "build" || String(r.path ?? "").includes("build.yml"));
  if (!build) return;
  if (build.status !== "completed") return;
  if (build.conclusion !== "success") {
    await admin.from("melhorias").update({ status: "falhou" }).eq("id", m.id);
    await enviarGrupo(`🔴 *Falhou no build* — *${PROJETO}*\n${m.titulo}\n_Não foi publicada; precisa de ajuste._`);
    return;
  }
  const mg = await gh(`/repos/${REPO}/pulls/${m.pr_number}/merge`, {
    method: "PUT", body: JSON.stringify({ merge_method: "squash" }),
  });
  if (mg.ok) {
    await admin.from("melhorias").update({ status: "concluida" }).eq("id", m.id);
    await enviarGrupo(`✅ *Implementada* — *${PROJETO}*\n${m.titulo}\n_Build passou e já está subindo em produção._ 🚀`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== Deno.env.get("AGENDA_SYNC_SECRET")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
  }
  if (!GH) return new Response(JSON.stringify({ error: "github_nao_configurado" }), { status: 500, headers: corsHeaders });

  const admin = createClient(SUPA, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: lista } = await admin.from("melhorias").select("*")
    .in("status", ["solicitada", "preparando", "aguardando_aprovacao", "aprovada"])
    .order("criado_em", { ascending: true }).limit(20);

  // Garantia SEMPRE-ONLINE (servidor): notifica qualquer pedido ainda não
  // anunciado — seja 'solicitada' ou já 'aprovada' (cobre aprovação rápida) —
  // independente da sessão do Claude estar aberta. Carência curta (90s) só pra
  // dar chance do vigia ao vivo notificar primeiro e evitar duplicidade.
  const GRACA_MS = 90 * 1000;
  let processadas = 0;
  for (const m of lista ?? []) {
    try {
      if (!m.notificado_em && (m.status === "solicitada" || m.status === "aprovada") &&
          (Date.now() - new Date(m.criado_em).getTime()) > GRACA_MS) {
        await notificarSolicitada(admin, m);
      }
      if (m.status === "preparando") await preparando(admin, m);
      else if (m.status === "aguardando_aprovacao" && !m.notificado_em) await renotificar(admin, m);
      else if (m.status === "aprovada") await aprovada(admin, m);
      processadas++;
    } catch (e) { console.error("monitor_erro", m.id, e); }
  }

  // Problemas reportados pelo solicitante que ainda não foram avisados ao grupo.
  // Independe do status da melhoria e da Edge Function melhoria-problema.
  const { data: problemas } = await admin.from("melhorias").select("*")
    .not("problema_reportado_em", "is", null)
    .is("problema_notificado_em", null)
    .order("problema_reportado_em", { ascending: true }).limit(20);
  for (const m of problemas ?? []) {
    try {
      const ok = await enviarGrupo(montarMensagemProblema(m));
      if (ok) {
        await admin.from("melhorias").update({ problema_notificado_em: new Date().toISOString() }).eq("id", m.id);
        processadas++;
      }
    } catch (e) { console.error("monitor_problema_erro", m.id, e); }
  }

  return new Response(JSON.stringify({ ok: true, processadas }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
