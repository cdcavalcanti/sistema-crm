import { supabase, usesPreviewData } from "@/integrations/supabase/client";
import { reunirEvidencias, respostaDeterministica, type Citacao } from "@/lib/ia-evidencias";

export type { Citacao };

export type IaRespostaLeitura = {
  ok: boolean;
  modo: "leitura";
  tenant: string;
  provider: string;
  modelo: string;
  resposta: string;
  citacoes: Citacao[];
  intent?: string;
  error?: string;
};

export type IaProposta = {
  id: string;
  status: string;
  perigo: "normal" | "apagar" | "disparo_massa";
  payload: {
    campos?: Array<{ campo: string; atual: unknown; sugerido: unknown; motivo: string }>;
    etapa?: { id: string; nome: string; motivo: string } | null;
    tarefa?: { titulo: string; due_date: string; prioridade?: string; motivo?: string } | null;
    handoff_humano?: { sim: boolean; motivo: string };
    persona?: string;
    o_que_pode_prometer?: string;
  };
  afetados: Array<{ tipo: string; id: string; label: string }>;
  criado_em?: string;
};

export type IaTenantConfig = {
  persona: string;
  o_que_pode_prometer: string;
  regra_atribuicao: "fixo" | "round_robin" | "origem";
  responsavel_padrao: string;
  prazo_sem_resposta_horas: number;
  dias_sem_atividade: number;
  campanha_fria_aprovada: boolean;
};

const TENANT = "sistema-crm";

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("crm-ia", { body });
  if (error) throw error;
  return data as T;
}

async function perguntarPreview(pergunta: string, oportunidadeId?: string): Promise<IaRespostaLeitura> {
  const { intent, evidencia } = await reunirEvidencias(supabase, pergunta, oportunidadeId ?? null);
  const resposta = respostaDeterministica(pergunta, evidencia);
  return {
    ok: true,
    modo: "leitura",
    tenant: TENANT,
    provider: "deterministico",
    modelo: "preview",
    resposta,
    citacoes: evidencia.citacoes,
    intent: intent.tipo,
  };
}

export async function perguntarAoCrm(pergunta: string, oportunidadeId?: string): Promise<IaRespostaLeitura> {
  if (usesPreviewData()) return perguntarPreview(pergunta, oportunidadeId);
  const data = await invoke<IaRespostaLeitura>({
    acao: "perguntar",
    pergunta,
    oportunidade_id: oportunidadeId ?? null,
  });
  if (!data?.ok && data?.error) throw new Error(data.error);
  return data;
}

async function sugerirPreview(oportunidadeId: string, pergunta?: string): Promise<IaProposta> {
  const { data: o } = await supabase
    .from("oportunidades")
    .select("id, titulo, valor, responsavel, contato:contatos(id, nome), etapa:etapas(id, nome, ordem, tipo)")
    .eq("id", oportunidadeId)
    .maybeSingle();
  if (!o) throw new Error("negocio_nao_visivel");
  const { data: etapas } = await supabase.from("etapas").select("id, nome, tipo, ordem").order("ordem");
  const proxima = (etapas ?? []).find(
    (e: { ordem: number; tipo: string | null }) => e.ordem > (o.etapa?.ordem ?? 0) && e.tipo !== "perdido",
  );
  const due = new Date();
  due.setDate(due.getDate() + 2);
  const perigo = /apag|exclu/.test((pergunta ?? "").toLowerCase())
    ? "apagar"
    : /disparo|massa/.test((pergunta ?? "").toLowerCase())
      ? "disparo_massa"
      : "normal";
  const id = crypto.randomUUID();
  const proposta: IaProposta = {
    id,
    status: "pendente",
    perigo,
    payload: {
      campos: o.valor == null
        ? [{ campo: "valor", atual: null, sugerido: null, motivo: "Valor não está no CRM — não invento cifra." }]
        : [],
      etapa: proxima
        ? { id: proxima.id, nome: proxima.nome, motivo: "Próxima etapa do pipeline deste tenant." }
        : null,
      tarefa: {
        titulo: `Follow-up: ${o.titulo || o.contato?.nome || "negócio"}`,
        due_date: due.toISOString(),
        prioridade: "media",
        motivo: "Nada é criado até o operador confirmar.",
      },
      handoff_humano: {
        sim: false,
        motivo: "Pode seguir no comercial se confirmar.",
      },
      o_que_pode_prometer:
        "Não promete desconto nem envio de mensagem sozinha neste corte.",
    },
    afetados: [{ tipo: "oportunidade", id: o.id, label: o.titulo || o.id }],
  };
  await supabase.from("ia_propostas").insert({
    id,
    oportunidade_id: oportunidadeId,
    user_id: "00000000-0000-4000-8000-000000000001",
    status: "pendente",
    perigo,
    payload: proposta.payload,
    afetados: proposta.afetados,
  });
  return proposta;
}

export async function sugerirAcao(oportunidadeId: string, pergunta?: string): Promise<IaProposta> {
  if (usesPreviewData()) return sugerirPreview(oportunidadeId, pergunta);
  const data = await invoke<{ ok: boolean; proposta: IaProposta; error?: string }>({
    acao: "sugerir",
    oportunidade_id: oportunidadeId,
    pergunta: pergunta ?? "",
  });
  if (!data?.ok || !data.proposta) throw new Error(data?.error ?? "falha_sugerir");
  return data.proposta;
}

export async function confirmarProposta(
  propostaId: string,
  opts?: { confirmacaoExplicita?: string },
): Promise<{ ok: boolean; gravado?: unknown; error?: string; afetados?: unknown }> {
  if (usesPreviewData()) {
    const { data: p } = await supabase.from("ia_propostas").select("*").eq("id", propostaId).maybeSingle();
    if (!p || p.status !== "pendente") throw new Error("proposta_nao_encontrada");
    if (p.perigo === "apagar" || p.perigo === "disparo_massa") {
      if ((opts?.confirmacaoExplicita ?? "").trim().toUpperCase() !== "CONFIRMAR") {
        return { ok: false, error: "confirmacao_explicita", afetados: p.afetados };
      }
    }
    if (p.perigo === "disparo_massa") {
      await supabase.from("ia_propostas").update({ status: "recusada" }).eq("id", propostaId);
      return { ok: false, error: "disparo_massa_fora_deste_corte", afetados: p.afetados };
    }
    const payload = p.payload as IaProposta["payload"];
    const patch: Record<string, unknown> = {};
    for (const c of payload.campos ?? []) {
      if (c.sugerido != null) patch[c.campo] = c.sugerido;
    }
    if (payload.etapa?.id) patch.etapa_id = payload.etapa.id;
    if (Object.keys(patch).length) {
      await supabase.from("oportunidades").update(patch).eq("id", p.oportunidade_id);
    }
    if (payload.tarefa?.titulo) {
      await supabase.from("tarefas").insert({
        titulo: payload.tarefa.titulo,
        due_date: payload.tarefa.due_date,
        status: "aberta",
        prioridade: payload.tarefa.prioridade ?? "media",
        oportunidade_id: p.oportunidade_id,
      });
    }
    await supabase.from("oportunidade_comentarios").insert({
      oportunidade_id: p.oportunidade_id,
      conteudo: "IA (confirmada pelo operador) gravou sugestão neste negócio.",
      autor_nome: "IA do CRM",
      autor_email: "ia-crm",
    });
    await supabase.from("ia_propostas").update({ status: "confirmada" }).eq("id", propostaId);
    return { ok: true, gravado: { oportunidade_id: p.oportunidade_id } };
  }
  return invoke({
    acao: "confirmar",
    proposta_id: propostaId,
    confirmado: true,
    confirmacao_explicita: opts?.confirmacaoExplicita ?? null,
  });
}

export async function recusarProposta(propostaId: string): Promise<void> {
  if (usesPreviewData()) {
    await supabase.from("ia_propostas").update({ status: "recusada" }).eq("id", propostaId);
    return;
  }
  await invoke({ acao: "recusar", proposta_id: propostaId });
}

export async function carregarIaConfig(): Promise<IaTenantConfig> {
  if (usesPreviewData()) {
    const { data } = await supabase.from("ia_tenant_config").select("*").eq("id", true).maybeSingle();
    return (
      data ?? {
        persona: "IA comercial deste CRM.",
        o_que_pode_prometer: "Não envia mensagem sozinha neste corte.",
        regra_atribuicao: "fixo",
        responsavel_padrao: "Comercial",
        prazo_sem_resposta_horas: 24,
        dias_sem_atividade: 7,
        campanha_fria_aprovada: false,
      }
    );
  }
  const data = await invoke<{ ok: boolean; config: IaTenantConfig }>({ acao: "config" });
  return data.config;
}

export async function salvarIaConfig(patch: Partial<IaTenantConfig>): Promise<IaTenantConfig> {
  if (usesPreviewData()) {
    await supabase.from("ia_tenant_config").update(patch).eq("id", true);
    return carregarIaConfig();
  }
  const data = await invoke<{ ok: boolean; config: IaTenantConfig; error?: string }>({
    acao: "salvar_config",
    ...patch,
  });
  if (!data?.ok) throw new Error(data?.error ?? "falha_salvar_config");
  return data.config;
}

export function hrefCitacao(c: Citacao): string | null {
  if (c.tipo === "oportunidade") return `/oportunidades/${c.id}`;
  if (c.tipo === "contato") return `/contatos/${c.id}`;
  if (c.tipo === "tarefa") return `/tarefas`;
  return null;
}
