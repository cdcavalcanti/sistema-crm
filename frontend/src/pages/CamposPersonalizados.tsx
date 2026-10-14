import { CrudModulo } from "@/components/modulos/CrudModulo";

export default function CamposPersonalizados() {
  return (
    <CrudModulo
      tabela="campos_personalizados"
      eyebrow="Administração"
      titulo="Campos personalizados"
      subtitulo="Campos extras deste tenant em contato ou negócio. Sem planilha ao lado."
      vincular={false}
      campos={[
        { key: "titulo", label: "Rótulo", tipo: "text", obrigatorio: true },
        { key: "chave", label: "Chave", tipo: "text", obrigatorio: true },
        { key: "entidade", label: "Onde", tipo: "select", opcoes: [
          { value: "contato", label: "Contato / lead" },
          { value: "oportunidade", label: "Negócio" },
          { value: "empresa", label: "Empresa" },
        ]},
        { key: "tipo_campo", label: "Tipo", tipo: "select", opcoes: [
          { value: "texto", label: "Texto" },
          { value: "numero", label: "Número" },
          { value: "data", label: "Data" },
          { value: "lista", label: "Lista" },
        ]},
        { key: "status", label: "Status", tipo: "select", opcoes: [
          { value: "ativo", label: "Ativo" },
          { value: "inativo", label: "Inativo" },
        ]},
        { key: "notas", label: "Notas", tipo: "textarea" },
      ]}
      colunas={[
        { key: "titulo", label: "Rótulo" },
        { key: "chave", label: "Chave" },
        { key: "entidade", label: "Onde" },
        { key: "tipo_campo", label: "Tipo" },
        { key: "status", label: "Status" },
      ]}
    />
  );
}
