import { CrudModulo } from "@/components/modulos/CrudModulo";
import { RESPONSAVEIS_CRM } from "@/lib/constants";

export default function Orcamentos() {
  return (
    <CrudModulo
      tabela="orcamentos"
      eyebrow="Operação"
      titulo="Orçamentos"
      subtitulo="Valores comerciais ligados ao negócio. Não vira pedido nem estoque."
      campos={[
        { key: "titulo", label: "Título", tipo: "text", obrigatorio: true },
        { key: "status", label: "Status", tipo: "select", opcoes: [
          { value: "rascunho", label: "Rascunho" },
          { value: "enviado", label: "Enviado" },
          { value: "aprovado", label: "Aprovado" },
          { value: "recusado", label: "Recusado" },
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
        { key: "responsavel", label: "Responsável" },
        { key: "oportunidade", label: "Negócio" },
      ]}
    />
  );
}
