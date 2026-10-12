// IA do CRM — mesmo tenant logado, mesmo gateway do assistente (OPENAI_API_KEY).
// acao: perguntar | sugerir | confirmar | recusar | config | salvar_config
// Modo leitura nunca grava no negócio. Escrita só depois de confirmar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  reunirEvidencias,
  respostaDeterministica,
  type Citacao,
} from "../_shared/iaEvidencias.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TENANT = "sistema-crm";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function userClient(req: Request) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(url, anon, { global: { headers: { Authorization: auth } } });
}

async function exigirUser(sb: ReturnType<typeof userClient>) {
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

async function isAdmin(sb: ReturnType<typeof userClient>, userId: string) {
  const { data } = await sb.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  return roles.includes("admin") || roles.includes("super_admin");
}

async function carregarConfig(sb: ReturnType<typeof userClient>) {
  const { data } = await sb.from("ia_tenant_config").select("*").eq("id", true).maybeSingle();
  return data ?? {
    persona: "IA comercial deste CRM. Português do Brasil. Só dados do sistema.",
    o_que_pode_prometer: "Não promete o que o operador não confirmou. Não envia mensagem sozinha neste corte.",
    regra_atribuicao: "fixo",
    responsavel_padrao: "Comercial",
    prazo_sem_resposta_horas: 24,
    dias_sem_atividade: 7,
    campanha_fria_aprovada: false,
  };
}

async function logConsulta(
  sb: ReturnType<typeof userClient>,
  row: {
    user_id: string;
    modo: "leitura" | "acao";
    provider: string;
    modelo?: string | null;
    pergunta?: string | null;
    resposta?: string | null;
    citacoes?: Citacao[];
    oportunidade_id?: string | null;
  },
) {
  await sb.from("ia_consultas").insert({
    user_id: row.user_id,
    modo: row.modo,
    provider: row.provider,
    modelo: row.modelo ?? null,
    pergunta: row.pergunta ?? null,
    resposta: row.resposta ?? null,
    citacoes: row.citacoes ?? [],
    oportunidade_id: row.oportunidade_id ?? null,
  });
}

async function redigirComGateway(
  evidenciasJson: string,
  pergunta: string,
  persona: string,
): Promise<{ texto: string; provider: string; modelo: string } | null> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return null;
  const modelo = "gpt-4o-mini";
  const instructions =
    `${persona}\n\n` +
    "MODO LEITURA. Você NÃO cria, NÃO move e NÃO apaga. " +
    "Responda em português do Brasil. Use SOMENTE o JSON de evidências. " +
    "Cada número precisa do registro no formato [[oportunidade:UUID]] ou [[tarefa:UUID]] etc. " +
    "Se o campo não estiver no JSON, diga que não está no CRM. Não complete com palpite. " +
    "Não use conhecimento geral do mercado.";
  const r = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: modelo,
      instructions,
      input: `Pergunta do operador: ${pergunta}\n\nEvidências (tenant ${TENANT}):\n${evidenciasJson}`,
    }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  const texto =
    j.output_text ??
    (Array.isArray(j.output)
      ? j.output
          .flatMap((o: { content?: Array<{ text?: string }> }) => o.content ?? [])
          .map((c: { text?: string }) => c.text ?? "")
          .join("")
      : "");
  if (!String(texto).trim()) return null;
  return { texto: String(texto).trim(), provider: "openai", modelo };
}

async function perguntar(sb: ReturnType<typeof userClient>, userId: string, body: Record<string, unknown>) {
  const pergunta = String(body.pergunta ?? "").trim();
  if (!pergunta) return json({ error: "empty_question" }, 400);
  const oportunidadeId = (body.oportunidade_id as string | undefined) || null;
  const cfg = await carregarConfig(sb);
  const { intent, evidencia } = await reunirEvidencias(sb, pergunta, oportunidadeId);
  const payloadEv = JSON.stringify({ intent, evidencia }, null, 2).slice(0, 24_000);
  const llm = await redigirComGateway(payloadEv, pergunta, cfg.persona);
  const resposta = llm?.texto ?? respostaDeterministica(pergunta, evidencia);
  const provider = llm?.provider ?? "deterministico";
  const modelo = llm?.modelo ?? "regras-crm";
  await logConsulta(sb, {
    user_id: userId,
    modo: "leitura",
    provider,
    modelo,
    pergunta,
    resposta,
    citacoes: evidencia.citacoes,
    oportunidade_id: oportunidadeId,
  });
  return json({
    ok: true,
    modo: "leitura",
    tenant: TENANT,
    provider,
    modelo,
    resposta,
    citacoes: evidencia.citacoes,
    intent: intent.tipo,
  });
}

async function sugerir(sb: ReturnType<typeof userClient>, userId: string, body: Record<string, unknown>) {
  const oportunidadeId = String(body.oportunidade_id ?? "");
  if (!oportunidadeId) return json({ error: "oportunidade_id_required" }, 400);
  const { data: o, error } = await sb
    .from("oportunidades")
    .select(
      "id, titulo, valor, origem, responsavel, interesse, observacoes, descricao, etapa_id, contato_id, atualizado_em, contato:contatos(id, nome, email, telefone), etapa:etapas(id, nome, tipo, ordem)",
    )
    .eq("id", oportunidadeId)
    .maybeSingle();
  if (error || !o) return json({ error: "negocio_nao_visivel" }, 404);

  const { data: etapas } = await sb.from("etapas").select("id, nome, tipo, ordem").order("ordem");
  const { data: tarefas } = await sb
    .from("tarefas")
    .select("id, titulo, status, due_date")
    .eq("oportunidade_id", o.id)
    .in("status", ["aberta", "em_andamento"]);
  const cfg = await carregarConfig(sb);
  const perguntaOp = String(body.pergunta ?? "").toLowerCase();
  const querApagar = /apag|exclu/.test(perguntaOp);
  const querDisparo = /disparo|massa|campanha para todos/.test(perguntaOp);

  const campos: Array<{ campo: string; atual: unknown; sugerido: unknown; motivo: string }> = [];
  if (o.valor == null) {
    campos.push({
      campo: "valor",
      atual: null,
      sugerido: null,
      motivo: "Valor em aberto não está no CRM — não invento cifra. Operador preenche.",
    });
  }
  if (!o.responsavel) {
    campos.push({
      campo: "responsavel",
      atual: null,
      sugerido: cfg.responsavel_padrao,
      motivo: "Negócio sem responsável; regra do tenant sugere o padrão.",
    });
  }

  const ordemAtual = o.etapa?.ordem ?? 0;
  const proxima = (etapas ?? []).find(
    (e: { ordem: number; tipo: string | null }) => e.ordem > ordemAtual && e.tipo !== "perdido",
  );
  const etapaSugerida = proxima
    ? { id: proxima.id, nome: proxima.nome, motivo: "Próxima etapa do pipeline configurado neste tenant." }
    : null;

  const due = new Date();
  due.setDate(due.getDate() + 2);
  const tarefa = {
    titulo: `Follow-up: ${o.titulo || o.contato?.nome || "negócio"}`,
    due_date: due.toISOString(),
    prioridade: "media",
    motivo: "Prazo sugerido a partir da config do tenant; nada é criado até confirmar.",
  };

  const semContato = !o.contato?.telefone && !o.contato?.email;
  const handoffHumano = {
    sim: semContato || (tarefas ?? []).length >= 3,
    motivo: semContato
      ? "Sem telefone e sem e-mail no CRM — um humano precisa completar o contato."
      : (tarefas ?? []).length >= 3
        ? "Já há várias tarefas abertas neste negócio."
        : "Pode seguir no comercial, se o operador confirmar.",
  };

  let perigo: "normal" | "apagar" | "disparo_massa" = "normal";
  const afetados: Array<{ tipo: string; id: string; label: string }> = [
    { tipo: "oportunidade", id: o.id, label: o.titulo || o.id },
  ];
  if (querApagar) {
    perigo = "apagar";
  }
  if (querDisparo) {
    perigo = "disparo_massa";
    const { data: abertas } = await sb
      .from("oportunidades")
      .select("id, titulo, etapa:etapas(tipo)")
      .limit(200);
    for (const x of abertas ?? []) {
      if (x.etapa?.tipo === "ganho" || x.etapa?.tipo === "perdido") continue;
      afetados.push({ tipo: "oportunidade", id: x.id, label: x.titulo || x.id });
    }
  }

  const payload = {
    campos,
    etapa: etapaSugerida,
    tarefa,
    handoff_humano: handoffHumano,
    persona: cfg.persona,
    o_que_pode_prometer: cfg.o_que_pode_prometer,
  };

  const { data: proposta, error: pErr } = await sb
    .from("ia_propostas")
    .insert({
      oportunidade_id: o.id,
      user_id: userId,
      status: "pendente",
      perigo,
      payload,
      afetados,
    })
    .select("id, status, perigo, payload, afetados, criado_em")
    .single();
  if (pErr || !proposta) return json({ error: "proposta_insert_failed", detalhe: pErr?.message }, 500);

  await logConsulta(sb, {
    user_id: userId,
    modo: "acao",
    provider: "deterministico",
    modelo: "regras-crm",
    pergunta: String(body.pergunta ?? "sugerir ficha"),
    resposta: JSON.stringify({ proposta_id: proposta.id, perigo }),
    oportunidade_id: o.id,
  });

  return json({ ok: true, modo: "acao", tenant: TENANT, provider: "deterministico", proposta });
}

async function confirmar(sb: ReturnType<typeof userClient>, userId: string, body: Record<string, unknown>) {
  const id = String(body.proposta_id ?? "");
  const confirmado = body.confirmado === true;
  if (!id) return json({ error: "proposta_id_required" }, 400);
  if (!confirmado) return json({ error: "precisa_confirmado_true" }, 400);

  const { data: p, error } = await sb.from("ia_propostas").select("*").eq("id", id).maybeSingle();
  if (error || !p || p.user_id !== userId) return json({ error: "proposta_nao_encontrada" }, 404);
  if (p.status !== "pendente") return json({ error: "proposta_ja_resolvida" }, 409);

  if (p.perigo === "apagar" || p.perigo === "disparo_massa") {
    const palavra = String(body.confirmacao_explicita ?? "").trim().toUpperCase();
    if (palavra !== "CONFIRMAR") {
      return json({
        error: "confirmacao_explicita",
        detalhe: "Apagar ou disparo em massa exige digitar CONFIRMAR e a lista de afetados já está na proposta.",
        afetados: p.afetados,
      }, 400);
    }
  }

  if (p.perigo === "disparo_massa") {
    await sb.from("ia_propostas").update({
      status: "recusada",
      resolvido_em: new Date().toISOString(),
      confirmacao_explicita: String(body.confirmacao_explicita ?? ""),
    }).eq("id", id);
    return json({
      ok: false,
      error: "disparo_massa_fora_deste_corte",
      detalhe: "Neste corte a IA não dispara mensagem. A lista de afetados foi preservada e nada foi enviado.",
      afetados: p.afetados,
    });
  }

  if (p.perigo === "apagar") {
    const { error: delErr } = await sb.from("oportunidades").delete().eq("id", p.oportunidade_id);
    if (delErr) return json({ error: "nao_foi_possivel_apagar", detalhe: delErr.message }, 403);
    await sb.from("ia_propostas").update({
      status: "confirmada",
      resolvido_em: new Date().toISOString(),
      confirmacao_explicita: String(body.confirmacao_explicita ?? "CONFIRMAR"),
    }).eq("id", id);
    await sb.from("ia_consultas").insert({
      user_id: userId,
      modo: "acao",
      provider: "deterministico",
      pergunta: "confirmar apagar",
      resposta: `apagou oportunidade ${p.oportunidade_id}`,
      oportunidade_id: p.oportunidade_id,
    });
    return json({ ok: true, gravado: { apagou: p.oportunidade_id } });
  }

  const payload = p.payload as {
    campos?: Array<{ campo: string; sugerido: unknown }>;
    etapa?: { id: string } | null;
    tarefa?: { titulo: string; due_date: string; prioridade?: string } | null;
    handoff_humano?: { sim: boolean };
  };
  const patch: Record<string, unknown> = {};
  const aplicados: string[] = [];
  for (const c of payload.campos ?? []) {
    if (c.campo === "valor" && (c.sugerido === null || c.sugerido === undefined)) continue;
    if (c.sugerido !== null && c.sugerido !== undefined) {
      patch[c.campo] = c.sugerido;
      aplicados.push(c.campo);
    }
  }
  if (payload.etapa?.id) {
    patch.etapa_id = payload.etapa.id;
    aplicados.push("etapa_id");
  }
  if (Object.keys(patch).length) {
    const { error: upErr } = await sb.from("oportunidades").update(patch).eq("id", p.oportunidade_id);
    if (upErr) return json({ error: "nao_gravou_negocio", detalhe: upErr.message }, 403);
  }

  let tarefaId: string | null = null;
  if (payload.tarefa?.titulo) {
    const { data: tar, error: tErr } = await sb
      .from("tarefas")
      .insert({
        titulo: payload.tarefa.titulo,
        due_date: payload.tarefa.due_date,
        prioridade: payload.tarefa.prioridade ?? "media",
        status: "aberta",
        oportunidade_id: p.oportunidade_id,
        criado_por: userId,
      })
      .select("id")
      .single();
    if (!tErr && tar) {
      tarefaId = tar.id;
      aplicados.push("tarefa");
    }
  }

  const linhas = [`IA (confirmada pelo operador): ${aplicados.join(", ") || "nenhuma alteração de campo"}.`];
  if (payload.handoff_humano?.sim) linhas.push("Sinalizado para atendimento humano.");
  await sb.from("oportunidade_comentarios").insert({
    oportunidade_id: p.oportunidade_id,
    user_id: userId,
    autor_email: "ia-crm",
    autor_nome: "IA do CRM",
    conteudo: linhas.join(" "),
  });

  await sb.from("ia_propostas").update({
    status: "confirmada",
    resolvido_em: new Date().toISOString(),
  }).eq("id", id);

  return json({
    ok: true,
    gravado: { oportunidade_id: p.oportunidade_id, campos: aplicados, tarefa_id: tarefaId },
  });
}

async function recusar(sb: ReturnType<typeof userClient>, userId: string, body: Record<string, unknown>) {
  const id = String(body.proposta_id ?? "");
  const { data: p } = await sb.from("ia_propostas").select("id, user_id, status").eq("id", id).maybeSingle();
  if (!p || p.user_id !== userId) return json({ error: "proposta_nao_encontrada" }, 404);
  if (p.status !== "pendente") return json({ error: "proposta_ja_resolvida" }, 409);
  await sb.from("ia_propostas").update({ status: "recusada", resolvido_em: new Date().toISOString() }).eq("id", id);
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const sb = userClient(req);
  const user = await exigirUser(sb);
  if (!user) return json({ error: "unauthorized" }, 401);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return json({ error: "bad_request" }, 400);
  const acao = String(body.acao ?? "");

  if (acao === "perguntar") return perguntar(sb, user.id, body);
  if (acao === "sugerir") return sugerir(sb, user.id, body);
  if (acao === "confirmar") return confirmar(sb, user.id, body);
  if (acao === "recusar") return recusar(sb, user.id, body);
  if (acao === "config") {
    const cfg = await carregarConfig(sb);
    return json({ ok: true, tenant: TENANT, config: cfg });
  }
  if (acao === "salvar_config") {
    if (!(await isAdmin(sb, user.id))) return json({ error: "forbidden" }, 403);
    const patch = {
      persona: body.persona != null ? String(body.persona) : undefined,
      o_que_pode_prometer: body.o_que_pode_prometer != null ? String(body.o_que_pode_prometer) : undefined,
      regra_atribuicao: body.regra_atribuicao != null ? String(body.regra_atribuicao) : undefined,
      responsavel_padrao: body.responsavel_padrao != null ? String(body.responsavel_padrao) : undefined,
      prazo_sem_resposta_horas: body.prazo_sem_resposta_horas != null ? Number(body.prazo_sem_resposta_horas) : undefined,
      dias_sem_atividade: body.dias_sem_atividade != null ? Number(body.dias_sem_atividade) : undefined,
      campanha_fria_aprovada: body.campanha_fria_aprovada != null ? Boolean(body.campanha_fria_aprovada) : undefined,
      atualizado_por: user.id,
    };
    const limpo = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const { data, error } = await sb.from("ia_tenant_config").update(limpo).eq("id", true).select("*").maybeSingle();
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, config: data });
  }
  return json({ error: "acao_desconhecida" }, 400);
});
