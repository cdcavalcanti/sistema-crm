/** Pipeline comercial B2B genérico — edite para o cliente. */
export const ETAPAS_CRM = [
  { nome: "Lead novo", cor: "#3b82f6", tipo: "inicial" },
  { nome: "Qualificação", cor: "#06b6d4", tipo: "andamento" },
  { nome: "Atendimento humano", cor: "#8b5cf6", tipo: "andamento" },
  { nome: "Demo agendada", cor: "#a855f7", tipo: "andamento" },
  { nome: "Demo realizada", cor: "#f97316", tipo: "andamento" },
  { nome: "Proposta enviada", cor: "#eab308", tipo: "andamento" },
  { nome: "Negociação", cor: "#14b8a6", tipo: "andamento" },
  { nome: "Follow-up / Remarketing", cor: "#0ea5e9", tipo: "remarketing" },
  { nome: "Ganho", cor: "#10b981", tipo: "ganho" },
  { nome: "Perdido", cor: "#ef4444", tipo: "perdido" },
] as const;

export const ORIGENS_OPORTUNIDADE = [
  { value: "formulario_site", label: "Formulário do site" },
  { value: "instagram", label: "Instagram" },
  { value: "meta_ads", label: "Meta Ads" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "indicacao", label: "Indicação" },
  { value: "manual", label: "Cadastro manual" },
  { value: "outro", label: "Outro" },
] as const;

export const STATUS_TAREFA = [
  { value: "aberta", label: "Aberta", cor: "#3b82f6" },
  { value: "em_andamento", label: "Em andamento", cor: "#f59e0b" },
  { value: "concluida", label: "Concluída", cor: "#10b981" },
  { value: "cancelada", label: "Cancelada", cor: "#6b7280" },
] as const;

export const PRIORIDADE_TAREFA = [
  { value: "baixa", label: "Baixa", cor: "#9ca3af" },
  { value: "media", label: "Média", cor: "#3b82f6" },
  { value: "alta", label: "Alta", cor: "#f97316" },
  { value: "urgente", label: "Urgente", cor: "#ef4444" },
] as const;

export const MOTIVOS_PERDA = [
  "Preço / investimento",
  "Escolheu outro sistema",
  "Sem orçamento agora",
  "Não é o momento",
  "Outros",
] as const;

/** Categorias do lead — troque pelos segmentos do cliente (não deixe lista de nichos genéricos na entrega). */
export const SEGMENTOS_CRM = [
  "Segmento A",
  "Segmento B",
  "Segmento C",
  "Outro",
] as const;

/** Porte da organização (coluna legado turno em interesse composto). */
export const PORTES_CRM = [
  "MEI / Autônomo",
  "Pequena",
  "Média",
  "Grande",
  "Multi-unidades",
] as const;

export const RESPONSAVEIS_CRM = ["Comercial", "CS", "SDR"] as const;

export const INTERESSE_SEPARADOR = " · ";

export function composeInteresse(segmento: string, porte: string): string {
  if (!segmento && !porte) return "";
  if (!porte) return segmento;
  if (!segmento) return porte;
  return `${segmento}${INTERESSE_SEPARADOR}${porte}`;
}

export function parseInteresse(value: string | null | undefined): {
  segmento: string;
  porte: string;
} {
  if (!value) return { segmento: "", porte: "" };
  const [segmento, porte] = value.split(INTERESSE_SEPARADOR);
  const segmentoMatch = (SEGMENTOS_CRM as readonly string[]).includes(segmento) ? segmento : "";
  const porteMatch = (PORTES_CRM as readonly string[]).includes(porte) ? porte : "";
  return { segmento: segmentoMatch, porte: porteMatch };
}
