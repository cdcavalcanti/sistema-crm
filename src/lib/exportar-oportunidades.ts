// Exporta as oportunidades (respeitando os filtros ativos) para um arquivo
// Excel (.xlsx). Pagina client-side para contornar o limite default de 1000
// linhas do PostgREST, igual ao KanbanView/Relatorios.

import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import {
  applyOportunidadeFiltros,
  fetchContatoIdsForSearch,
  type OportunidadeFilters,
} from "@/lib/oportunidades-filtros";
import { fmtDate, fmtDateTime } from "@/lib/format";

const PAGE = 1000;

const SELECT =
  "titulo, nome_estabelecimento, anos_operacao, interesse, responsavel, origem, valor, " +
  "data_visita, data_fechamento, motivo_perda, criado_em, " +
  "contato:contatos(nome, email, telefone), etapa:etapas(nome)";

type LinhaExport = {
  titulo: string | null;
  nome_estabelecimento: string | null;
  anos_operacao: number | null;
  interesse: string | null;
  responsavel: string | null;
  origem: string;
  valor: number | null;
  data_visita: string | null;
  data_fechamento: string | null;
  motivo_perda: string | null;
  criado_em: string;
  contato: { nome: string | null; email: string | null; telefone: string | null } | null;
  etapa: { nome: string | null } | null;
};

function nomeArquivo(): string {
  // AAAA-MM-DD em fuso local
  const d = new Date();
  const off = d.getTimezoneOffset();
  const dia = new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
  return `oportunidades_${dia}.xlsx`;
}

export async function exportarOportunidadesXlsx(filters: OportunidadeFilters): Promise<number> {
  const contatoIds = await fetchContatoIdsForSearch(filters.searchText);

  const linhas: LinhaExport[] = [];
  let offset = 0;
  while (true) {
    let query = supabase
      .from("oportunidades")
      .select(SELECT)
      .order("criado_em", { ascending: false })
      .range(offset, offset + PAGE - 1);
    query = applyOportunidadeFiltros(query, filters, contatoIds);
    const { data, error } = await query;
    if (error) throw error;
    if (!data?.length) break;
    linhas.push(...(data as unknown as LinhaExport[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  const rows = linhas.map((o) => ({
    Oportunidade: o.titulo ?? "",
    Estabelecimento: o.nome_estabelecimento ?? "",
    Anos: o.anos_operacao ?? "",
    Segmento: o.interesse ?? "",
    Etapa: o.etapa?.nome ?? "",
    Responsável: o.responsavel ?? "",
    Origem: o.origem ?? "",
    Contato: o.contato?.nome ?? "",
    "E-mail": o.contato?.email ?? "",
    Telefone: o.contato?.telefone ?? "",
    "Valor (R$)": o.valor != null ? Number(o.valor) : "",
    "Data da demo": o.data_visita ? fmtDateTime(o.data_visita) : "",
    "Data do fechamento": o.data_fechamento ? fmtDate(o.data_fechamento) : "",
    "Motivo da perda": o.motivo_perda ?? "",
    "Criado em": fmtDateTime(o.criado_em),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Oportunidades");
  XLSX.writeFile(wb, nomeArquivo());
  return rows.length;
}
