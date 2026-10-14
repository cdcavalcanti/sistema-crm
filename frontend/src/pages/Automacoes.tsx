import { CrudModulo } from "@/components/modulos/CrudModulo";

export default function Automacoes() {
  return (
    <CrudModulo
      tabela="automacao_regras"
      eyebrow="Administração"
      titulo="Automações"
      subtitulo="Regras por evento neste CRM — não por lembrete de pessoa. Mensagem sozinha continua fora deste corte."
      vincular={false}
      aviso="Lead entrou e sem resposta já rodam em criarLead / crm-ia-eventos."
      campos={[
        { key: "titulo", label: "Nome", tipo: "text", obrigatorio: true },
        { key: "evento", label: "Evento", tipo: "select", opcoes: [
          { value: "lead_entrou", label: "Lead entrou" },
          { value: "sem_resposta", label: "Sem resposta no prazo" },
          { value: "esfriou", label: "Negócio esfriou" },
          { value: "etapa_mudou", label: "Mudou de etapa" },
        ]},
        { key: "acao", label: "Ação", tipo: "select", opcoes: [
          { value: "criar_oportunidade", label: "Criar oportunidade" },
          { value: "criar_tarefa", label: "Criar tarefa" },
          { value: "fila_campanha", label: "Fila de campanha (sem disparo)" },
        ]},
        { key: "status", label: "Status", tipo: "select", opcoes: [
          { value: "ativa", label: "Ativa" },
          { value: "pausada", label: "Pausada" },
        ]},
        { key: "notas", label: "Notas", tipo: "textarea" },
      ]}
      colunas={[
        { key: "titulo", label: "Nome" },
        { key: "evento", label: "Evento" },
        { key: "acao", label: "Ação" },
        { key: "status", label: "Status" },
      ]}
    />
  );
}
