import { CrudModulo } from "@/components/modulos/CrudModulo";
import { RESPONSAVEIS_CRM } from "@/lib/constants";

export default function Pedidos() {
  return (
    <CrudModulo
      tabela="pedidos"
      eyebrow="Comercial"
      titulo="Pedidos"
      subtitulo="Pedidos gerados a partir de orçamentos. Sem estoque, nota fiscal ou ERP — o registro fica no mesmo negócio."
      campos={[
        { key: "titulo", label: "Título", tipo: "text", obrigatorio: true },
        { key: "status", label: "Status", tipo: "select", opcoes: [
          { value: "em_execucao", label: "Em execução" },
          { value: "faturado", label: "Faturado" },
          { value: "pausado", label: "Pausado" },
        ]},
        { key: "valor", label: "Valor", tipo: "number" },
        { key: "responsavel", label: "Responsável", tipo: "select", opcoes: RESPONSAVEIS_CRM.map((r) => ({ value: r, label: r })) },
        { key: "oportunidade_id", label: "Negócio", tipo: "oportunidade" },
        { key: "contato_id", label: "Lead", tipo: "contato" },
        { key: "notas", label: "Notas", tipo: "textarea" },
      ]}
      colunas={[
        { key: "titulo", label: "Pedido" },
        { key: "oportunidade", label: "Oportunidade" },
        { key: "status", label: "Status" },
        { key: "valor", label: "Valor" },
        { key: "criado_em", label: "Criado em" },
      ]}
    />
  );
}
