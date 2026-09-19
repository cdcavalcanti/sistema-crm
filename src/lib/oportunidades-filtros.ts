// Tipos e helpers compartilhados entre a listagem e o kanban de oportunidades.
// Aplica os filtros consistentemente nas duas visualizações.

import { supabase } from "@/integrations/supabase/client";
import { ORIGENS_DESTAQUE, OUTRAS_ORIGENS_LABEL } from "@/lib/origem";

export const FILTRO_TODOS = "__todos__";

export type OportunidadeFilters = {
  searchText: string;
  origem: string;       // FILTRO_TODOS | um label de ORIGENS_DESTAQUE | OUTRAS_ORIGENS_LABEL
  responsavel: string;  // FILTRO_TODOS | nome do responsável
  criadoDe: string;     // YYYY-MM-DD ou ""
  criadoAte: string;    // YYYY-MM-DD ou ""
};

export const FILTROS_VAZIOS: OportunidadeFilters = {
  searchText: "",
  origem: FILTRO_TODOS,
  responsavel: FILTRO_TODOS,
  criadoDe: "",
  criadoAte: "",
};

export function temFiltrosAtivos(f: OportunidadeFilters): boolean {
  return (
    f.searchText.trim() !== "" ||
    f.origem !== FILTRO_TODOS ||
    f.responsavel !== FILTRO_TODOS ||
    f.criadoDe !== "" ||
    f.criadoAte !== ""
  );
}

// Busca contato_ids cujos dados batem com o texto. Usado pra fazer o search
// text encontrar oportunidades por qualquer dado do contato vinculado:
// nome, email, telefone, estabelecimento, segmento e observações. Quando o termo
// é numérico (telefone), também casa pelos dígitos puros.
export async function fetchContatoIdsForSearch(text: string): Promise<string[]> {
  const t = text.trim();
  if (!t) return [];
  const orParts = [
    `nome.ilike.%${t}%`,
    `telefone.ilike.%${t}%`,
    `email.ilike.%${t}%`,
    `nome_estabelecimento.ilike.%${t}%`,
    `segmento.ilike.%${t}%`,
    `observacoes.ilike.%${t}%`,
  ];
  const digits = t.replace(/\D/g, "");
  if (digits.length >= 3) orParts.push(`telefone.ilike.%${digits}%`);
  const { data } = await supabase
    .from("contatos")
    .select("id")
    .or(orParts.join(","))
    .limit(500);
  return (data ?? []).map((c) => (c as { id: string }).id);
}

// Aplica todos os filtros numa query de oportunidades já em construção.
// O caller é responsável por chamar fetchContatoIdsForSearch antes e passar
// o resultado em `contatoIds`.
//
// Retorna a query encadeada (PostgrestFilterBuilder). Tipagem permissiva
// porque cada query parte de tipos genéricos do supabase-js.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyOportunidadeFiltros(query: any, f: OportunidadeFilters, contatoIds: string[]) {
  const t = f.searchText.trim();
  if (t) {
    const orParts = [
      `titulo.ilike.%${t}%`,
      `nome_estabelecimento.ilike.%${t}%`,
      `responsavel.ilike.%${t}%`,
      `interesse.ilike.%${t}%`,
      `origem.ilike.%${t}%`,
      `observacoes.ilike.%${t}%`,
      `descricao.ilike.%${t}%`,
      `motivo_perda.ilike.%${t}%`,
    ];
    if (contatoIds.length) {
      orParts.push(`contato_id.in.(${contatoIds.join(",")})`);
    }
    query = query.or(orParts.join(","));
  }

  if (f.origem !== FILTRO_TODOS) {
    if (f.origem === OUTRAS_ORIGENS_LABEL) {
      // Exclui os 4 destaques (case/acento-insensitive não é trivial em PostgREST;
      // valores são canônicos no banco, então usamos NOT IN com os exatos).
      const exclude = ORIGENS_DESTAQUE.map((o) => `"${o.replace(/"/g, '\\"')}"`).join(",");
      query = query.not("origem", "in", `(${exclude})`);
    } else {
      query = query.eq("origem", f.origem);
    }
  }

  if (f.responsavel !== FILTRO_TODOS) {
    query = query.eq("responsavel", f.responsavel);
  }

  if (f.criadoDe) {
    query = query.gte("criado_em", `${f.criadoDe}T00:00:00`);
  }
  if (f.criadoAte) {
    query = query.lte("criado_em", `${f.criadoAte}T23:59:59`);
  }

  return query;
}

// Busca os responsáveis distintos no banco, pra popular o dropdown.
// (PostgREST não tem DISTINCT, então pegamos um lote e deduplicamos.)
export async function fetchResponsaveisDisponiveis(): Promise<string[]> {
  const { data } = await supabase
    .from("oportunidades")
    .select("responsavel")
    .not("responsavel", "is", null)
    .limit(5000);
  const set = new Set<string>();
  for (const r of (data ?? []) as Array<{ responsavel: string | null }>) {
    if (r.responsavel) set.add(r.responsavel);
  }
  return [...set].sort();
}
