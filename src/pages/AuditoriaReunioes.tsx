import { CrudModulo } from "@/components/modulos/CrudModulo";
import { RESPONSAVEIS_CRM } from "@/lib/constants";

export default function AuditoriaReunioes() {
  return (
    <CrudModulo
      tabela="reuniao_notas"
      eyebrow="Gestão autônoma"
      titulo="Auditoria de reuniões"
      subtitulo="O que ficou combinado na demo ou na reunião, gravado no mesmo negócio."
      campos={[
        { key: "titulo", label: "Reunião", tipo: "text", obrigatorio: true },
        { key: "data_reuniao", label: "Data", tipo: "date" },
        { key: "status", label: "Status", tipo: "select", opcoes: [
          { value: "registrada", label: "Registrada" },
          { value: "com_acao", label: "Com ação" },
          { value: "encerrada", label: "Encerrada" },
        ]},
        { key: "responsavel", label: "Responsável", tipo: "select", opcoes: RESPONSAVEIS_CRM.map((r) => ({ value: r, label: r })) },
        { key: "oportunidade_id", label: "Negócio", tipo: "oportunidade" },
        { key: "contato_id", label: "Contato", tipo: "contato" },
        { key: "notas", label: "Ata / combinados", tipo: "textarea" },
      ]}
      colunas={[
        { key: "titulo", label: "Reunião" },
        { key: "data_reuniao", label: "Data" },
        { key: "status", label: "Status" },
        { key: "oportunidade", label: "Negócio" },
      ]}
    />
  );
}
