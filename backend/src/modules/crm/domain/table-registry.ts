export type TableMeta = {
  /** Prisma client delegate name (camelCase model). */
  delegate: string;
  /** Column used for carteira (snake_case as the UI sends it). */
  carteiraField?: "responsavel" | "oportunidade_id";
  adminWrite?: boolean;
  /** Singleton row keyed by boolean id=true */
  singleton?: boolean;
};

export const TABLE_REGISTRY: Record<string, TableMeta> = {
  users: { delegate: "user", adminWrite: true },
  profiles: { delegate: "profile" },
  user_roles: { delegate: "userRole", adminWrite: true },
  funis: { delegate: "funil", adminWrite: true },
  etapas: { delegate: "etapa", adminWrite: true },
  empresas: { delegate: "empresa" },
  contatos: { delegate: "contato" },
  oportunidades: { delegate: "oportunidade", carteiraField: "responsavel" },
  oportunidade_comentarios: { delegate: "oportunidadeComentario", carteiraField: "oportunidade_id" },
  tarefas: { delegate: "tarefa", carteiraField: "oportunidade_id" },
  calendario_eventos: { delegate: "calendarioEvento", carteiraField: "oportunidade_id" },
  google_credentials: { delegate: "googleCredential", adminWrite: true },
  audit_logs: { delegate: "auditLog", adminWrite: true },
  conversas: { delegate: "conversa" },
  mensagens: { delegate: "mensagem" },
  entradas_log: { delegate: "entradaLog", adminWrite: true },
  etiquetas: { delegate: "etiqueta" },
  contato_etiquetas: { delegate: "contatoEtiqueta" },
  indicadores_ads: { delegate: "indicadorAds", adminWrite: true },
  ia_tenant_config: { delegate: "iaTenantConfig", adminWrite: true, singleton: true },
  ia_consultas: { delegate: "iaConsulta" },
  ia_propostas: { delegate: "iaProposta" },
  dados_conversa: { delegate: "dadosConversa" },
  historico_mensagens: { delegate: "historicoMensagem" },
  pausar_ia: { delegate: "pausarIa" },
  orcamentos: { delegate: "orcamento", carteiraField: "oportunidade_id" },
  propostas: { delegate: "proposta", carteiraField: "oportunidade_id" },
  pedidos: { delegate: "pedido", carteiraField: "oportunidade_id" },
  ligacoes: { delegate: "ligacao", carteiraField: "oportunidade_id" },
  nps_respostas: { delegate: "npsResposta", carteiraField: "oportunidade_id" },
  diagnosticos: { delegate: "diagnostico", carteiraField: "oportunidade_id" },
  reuniao_notas: { delegate: "reuniaoNota", carteiraField: "oportunidade_id" },
  prospeccao: { delegate: "prospeccao", carteiraField: "oportunidade_id" },
  email_campanhas: { delegate: "emailCampanha", carteiraField: "oportunidade_id" },
  planejamento: { delegate: "planejamento", carteiraField: "oportunidade_id" },
  campos_personalizados: { delegate: "campoPersonalizado", adminWrite: true },
  automacao_regras: { delegate: "automacaoRegra", adminWrite: true },
  melhorias: { delegate: "melhoria" },
  remarketing_campanha: { delegate: "remarketingCampanha", adminWrite: true },
  remarketing_acoes: { delegate: "remarketingAcao" },
  lgpd_config: { delegate: "lgpdConfig", adminWrite: true, singleton: true },
  lgpd_solicitacoes: { delegate: "lgpdSolicitacao" },
  lgpd_consentimentos: { delegate: "lgpdConsentimento" },
  gpt_conversas: { delegate: "gptConversa" },
  gpt_mensagens: { delegate: "gptMensagem" },
  auditorias: { delegate: "auditoria", adminWrite: true },
  telefones_matriculados: { delegate: "telefoneMatriculado", adminWrite: true },
  emails_matriculados: { delegate: "emailMatriculado", adminWrite: true },
};

export const RELATIONS: Record<string, Record<string, { local: string; table: string; foreign: string; many?: boolean }>> = {
  oportunidades: {
    contato: { local: "contato_id", table: "contatos", foreign: "id" },
    contatos: { local: "contato_id", table: "contatos", foreign: "id" },
    etapa: { local: "etapa_id", table: "etapas", foreign: "id" },
    etapas: { local: "etapa_id", table: "etapas", foreign: "id" },
    empresa: { local: "empresa_id", table: "empresas", foreign: "id" },
    empresas: { local: "empresa_id", table: "empresas", foreign: "id" },
    funil: { local: "funil_id", table: "funis", foreign: "id" },
  },
  etapas: {
    funil: { local: "funil_id", table: "funis", foreign: "id" },
  },
  contatos: {
    contato_etiquetas: { local: "id", table: "contato_etiquetas", foreign: "contato_id", many: true },
    empresa: { local: "empresa_id", table: "empresas", foreign: "id" },
  },
  tarefas: {
    contato: { local: "contato_id", table: "contatos", foreign: "id" },
    contatos: { local: "contato_id", table: "contatos", foreign: "id" },
    oportunidade: { local: "oportunidade_id", table: "oportunidades", foreign: "id" },
    oportunidades: { local: "oportunidade_id", table: "oportunidades", foreign: "id" },
  },
  conversas: {
    contato: { local: "contato_id", table: "contatos", foreign: "id" },
    contatos: { local: "contato_id", table: "contatos", foreign: "id" },
  },
  contato_etiquetas: {
    etiqueta: { local: "etiqueta_id", table: "etiquetas", foreign: "id" },
    etiquetas: { local: "etiqueta_id", table: "etiquetas", foreign: "id" },
  },
  calendario_eventos: {
    contato: { local: "contato_id", table: "contatos", foreign: "id" },
    oportunidade: { local: "oportunidade_id", table: "oportunidades", foreign: "id" },
  },
  gpt_mensagens: {
    conversa: { local: "conversa_id", table: "gpt_conversas", foreign: "id" },
  },
  mensagens: {
    conversa: { local: "conversa_id", table: "conversas", foreign: "id" },
  },
};

const VINCULO = ["orcamentos", "propostas", "ligacoes", "nps_respostas", "diagnosticos", "reuniao_notas", "prospeccao", "email_campanhas", "planejamento", "pedidos"];
for (const t of VINCULO) {
  RELATIONS[t] = {
    contato: { local: "contato_id", table: "contatos", foreign: "id" },
    contatos: { local: "contato_id", table: "contatos", foreign: "id" },
    oportunidade: { local: "oportunidade_id", table: "oportunidades", foreign: "id" },
    oportunidades: { local: "oportunidade_id", table: "oportunidades", foreign: "id" },
  };
}

export function isKnownTable(table: string): table is keyof typeof TABLE_REGISTRY {
  return table in TABLE_REGISTRY;
}
