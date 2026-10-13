import { CrudModulo } from "@/components/modulos/CrudModulo";
import { RESPONSAVEIS_CRM } from "@/lib/constants";

export default function Propostas() {
  return (
    <CrudModulo
      tabela="propostas"
      eyebrow="Operação"
      titulo="Propostas"
      subtitulo="Proposta comercial do mesmo negócio. Sem planilha paralela."
      campos={[
        { key: "titulo", label: "Título", tipo: "text", obrigatorio: true },
        { key: "status", label: "Status", tipo: "select", opcoes: [
          { value: "rascunho", label: "Rascunho" },
          { value: "enviada", label: "Enviada" },
          { value: "em_analise", label: "Em análise" },
          { value: "aceita", label: "Aceita" },
          { value: "recusada", label: "Recusada" },
        ]},
        { key: "valor", label: "Valor", tipo: "number" },
        { key: "validade", label: "Validade", tipo: "date" },
        { key: "responsavel", label: "Responsável", tipo: "select", opcoes: RESPONSAVEIS_CRM.map((r) => ({ value: r, label: r })) },
        { key: "oportunidade_id", label: "Negócio", tipo: "oportunidade" },
        { key: "contato_id", label: "Contato", tipo: "contato" },
        { key: "notas", label: "Notas", tipo: "textarea" },
      ]}
      colunas={[
        { key: "titulo", label: "Título" },
        { key: "status", label: "Status" },
        { key: "valor", label: "Valor" },
        { key: "validade", label: "Validade" },
        { key: "oportunidade", label: "Negócio" },
      ]}
    />
  );
}
