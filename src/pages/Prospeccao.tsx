import { CrudModulo } from "@/components/modulos/CrudModulo";
import { RESPONSAVEIS_CRM } from "@/lib/constants";

export default function Prospeccao() {
  return (
    <CrudModulo
      tabela="prospeccao"
      eyebrow="Gestão autônoma"
      titulo="Prospecção outbound"
      subtitulo="Fila de quem o time vai abordar. Vira lead/oportunidade neste CRM, não numa lista à parte."
      campos={[
        { key: "titulo", label: "Alvo", tipo: "text", obrigatorio: true },
        { key: "status", label: "Status", tipo: "select", opcoes: [
          { value: "fila", label: "Fila" },
          { value: "em_contato", label: "Em contato" },
          { value: "qualificado", label: "Qualificado" },
          { value: "descartado", label: "Descartado" },
        ]},
        { key: "origem", label: "Origem", tipo: "text" },
        { key: "proximo_passo", label: "Próximo passo", tipo: "text" },
        { key: "responsavel", label: "Responsável", tipo: "select", opcoes: RESPONSAVEIS_CRM.map((r) => ({ value: r, label: r })) },
        { key: "contato_id", label: "Contato", tipo: "contato" },
        { key: "oportunidade_id", label: "Negócio", tipo: "oportunidade" },
        { key: "notas", label: "Notas", tipo: "textarea" },
      ]}
      colunas={[
        { key: "titulo", label: "Alvo" },
        { key: "status", label: "Status" },
        { key: "origem", label: "Origem" },
        { key: "proximo_passo", label: "Próximo passo" },
        { key: "responsavel", label: "Responsável" },
      ]}
    />
  );
}
