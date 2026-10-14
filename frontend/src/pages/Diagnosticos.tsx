import { CrudModulo } from "@/components/modulos/CrudModulo";
import { RESPONSAVEIS_CRM } from "@/lib/constants";

export default function Diagnosticos() {
  return (
    <CrudModulo
      tabela="diagnosticos"
      eyebrow="Diagnóstico"
      titulo="Diagnósticos"
      subtitulo="Índice comercial do negócio neste tenant: follow-up, etapa, risco. Sem palpite fora do CRM."
      campos={[
        { key: "titulo", label: "Título", tipo: "text", obrigatorio: true },
        { key: "status", label: "Status", tipo: "select", opcoes: [
          { value: "aberto", label: "Aberto" },
          { value: "em_curso", label: "Em curso" },
          { value: "encerrado", label: "Encerrado" },
        ]},
        { key: "eixo", label: "Eixo", tipo: "select", opcoes: [
          { value: "follow-up", label: "Follow-up" },
          { value: "proposta", label: "Proposta" },
          { value: "handoff", label: "Handoff humano" },
          { value: "risco", label: "Risco de perda" },
        ]},
        { key: "indice", label: "Índice (0–100)", tipo: "number" },
        { key: "responsavel", label: "Responsável", tipo: "select", opcoes: RESPONSAVEIS_CRM.map((r) => ({ value: r, label: r })) },
        { key: "oportunidade_id", label: "Negócio", tipo: "oportunidade" },
        { key: "contato_id", label: "Contato", tipo: "contato" },
        { key: "notas", label: "Notas", tipo: "textarea" },
      ]}
      colunas={[
        { key: "titulo", label: "Título" },
        { key: "eixo", label: "Eixo" },
        { key: "indice", label: "Índice" },
        { key: "status", label: "Status" },
        { key: "oportunidade", label: "Negócio" },
      ]}
    />
  );
}
