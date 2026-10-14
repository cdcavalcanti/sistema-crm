/** Normalização e match de telefone SDR ↔ CRM (E.164 sem +, últimos 8). */

export function digitosTelefone(raw?: string | null): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** Sufixo estável para match (DDD+número local BR ≈ 8–11 dígitos). */
export function sufixoTelefone(raw?: string | null, n = 8): string | null {
  const d = digitosTelefone(raw);
  if (d.length < n) return d.length >= 8 ? d.slice(-8) : null;
  return d.slice(-n);
}

export type SdrEtapa = "novo" | "qualificando" | "qualificado" | "transferido" | "descartado";

export type SdrQualificacao = {
  nome?: string;
  segmento?: string;
  faturamento_mensal?: string;
  dor_principal?: string;
  dependencia_dono?: string;
  tamanho_equipe?: string;
  tempo_negocio?: string;
  oferta_sugerida?: string;
  motivo_handoff?: string;
  resumo_handoff?: string;
  transferido_em?: string;
  [key: string]: unknown;
};

export type DadosConversaSdr = {
  id: number;
  telefone: string;
  nome: string | null;
  conversation_id: string;
  etapa: SdrEtapa | string;
  qualificacao: SdrQualificacao | null;
  origem: string | null;
  chatwoot_conversation_id: string | null;
  chatwoot_contact_id: string | null;
  ativada_em: string | null;
  qtd_interacao: number | null;
  inicio_int: string | null;
  ultima_int: string | null;
  updated_at: string | null;
  // colunas legadas (schema antigo) — opcional
  segmento?: string | null;
  faturamento_mensal?: string | null;
  dor_principal?: string | null;
  dependencia_dono?: string | null;
  tamanho_equipe?: string | null;
  tempo_negocio?: string | null;
  oferta_sugerida?: string | null;
  motivo_handoff?: string | null;
  resumo_handoff?: string | null;
  transferido_em?: string | null;
};

export function qualificacaoDe(lead: DadosConversaSdr | null | undefined): SdrQualificacao {
  if (!lead) return {};
  const q = (lead.qualificacao && typeof lead.qualificacao === "object" ? lead.qualificacao : {}) as SdrQualificacao;
  return {
    segmento: q.segmento ?? lead.segmento ?? undefined,
    faturamento_mensal: q.faturamento_mensal ?? lead.faturamento_mensal ?? undefined,
    dor_principal: q.dor_principal ?? lead.dor_principal ?? undefined,
    dependencia_dono: q.dependencia_dono ?? lead.dependencia_dono ?? undefined,
    tamanho_equipe: q.tamanho_equipe ?? lead.tamanho_equipe ?? undefined,
    tempo_negocio: q.tempo_negocio ?? lead.tempo_negocio ?? undefined,
    oferta_sugerida: q.oferta_sugerida ?? lead.oferta_sugerida ?? undefined,
    motivo_handoff: q.motivo_handoff ?? lead.motivo_handoff ?? undefined,
    resumo_handoff: q.resumo_handoff ?? lead.resumo_handoff ?? undefined,
    transferido_em: q.transferido_em ?? lead.transferido_em ?? undefined,
    nome: q.nome ?? lead.nome ?? undefined,
  };
}

export type StatusSdrUi = "ativa" | "pausada" | "transferida" | "descartada" | "ausente";

export function statusSdrUi(opts: {
  lead: DadosConversaSdr | null | undefined;
  pausada: boolean;
}): StatusSdrUi {
  if (!opts.lead) return "ausente";
  if (opts.lead.etapa === "descartado") return "descartada";
  if (opts.lead.etapa === "transferido") return "transferida";
  if (opts.pausada) return "pausada";
  return "ativa";
}
