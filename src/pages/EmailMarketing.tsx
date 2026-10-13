import { CrudModulo } from "@/components/modulos/CrudModulo";
import { RESPONSAVEIS_CRM } from "@/lib/constants";

export default function EmailMarketing() {
  return (
    <CrudModulo
      tabela="email_campanhas"
      eyebrow="Comunicação"
      titulo="E-mail marketing"
      subtitulo="Campanha neste CRM. Rascunho e fila — neste corte não dispara sozinho."
      aviso="Disparo em massa pede confirmação explícita. Nada sai sem o operador."
      campos={[
        { key: "titulo", label: "Campanha", tipo: "text", obrigatorio: true },
        { key: "assunto", label: "Assunto", tipo: "text" },
        { key: "status", label: "Status", tipo: "select", opcoes: [
          { value: "rascunho", label: "Rascunho" },
          { value: "aguardando", label: "Aguardando confirmação" },
          { value: "pausada", label: "Pausada" },
        ]},
        { key: "responsavel", label: "Responsável", tipo: "select", opcoes: RESPONSAVEIS_CRM.map((r) => ({ value: r, label: r })) },
        { key: "notas", label: "Corpo / notas", tipo: "textarea" },
      ]}
      colunas={[
        { key: "titulo", label: "Campanha" },
        { key: "assunto", label: "Assunto" },
        { key: "status", label: "Status" },
        { key: "responsavel", label: "Responsável" },
        { key: "criado_em", label: "Criada" },
      ]}
    />
  );
}
