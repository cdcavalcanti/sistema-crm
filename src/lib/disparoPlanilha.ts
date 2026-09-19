import * as XLSX from "xlsx";
import { paraE164, type PaisLista } from "./telefoneDisparo";

export const MAX_DESTINATARIOS = 10_000;

export type LinhaPlanilha = Record<string, unknown>;
export type Origem = { coluna?: string | null; fixo?: string | null };

export type Preparado = {
  nome: string;
  telefone: string;
  variaveis: string[];
  linha: number;
};

export type ErroLinha = { linha: number; motivo: string; detalhe?: string };

export type Preparacao = {
  destinatarios: Preparado[];
  erros: ErroLinha[];
  duplicados: number;
  excedentes: number;
};

function valorDe(linha: LinhaPlanilha, origem: Origem | undefined): string {
  if (!origem) return "";
  if (origem.fixo != null && origem.fixo !== "") return String(origem.fixo).trim();
  if (!origem.coluna) return "";
  const v = linha[origem.coluna];
  return v === null || v === undefined ? "" : String(v).trim();
}

export function celula(linha: LinhaPlanilha, cabecalho: string): string {
  const v = linha[cabecalho];
  if (v === undefined || v === null) return "";
  return String(v).trim();
}

export async function lerPlanilha(
  arquivo: File,
): Promise<{ cabecalhos: string[]; linhas: LinhaPlanilha[] }> {
  const buf = await arquivo.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const nome = wb.SheetNames[0];
  if (!nome) return { cabecalhos: [], linhas: [] };
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[nome], {
    defval: "",
    raw: false,
  });
  return { cabecalhos: Object.keys(json[0] ?? {}), linhas: json };
}

export function baixarModeloDisparo() {
  const exemplo = [
    { nome: "Maria Silva", telefone: "11999990000", var1: "Maria", var2: "Produto" },
    { nome: "João Souza", telefone: "21988887777", var1: "João", var2: "Produto" },
  ];
  const ws = XLSX.utils.json_to_sheet(exemplo);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "disparo");
  XLSX.writeFile(wb, "modelo_disparo_whatsapp.xlsx");
}

/** Quantas variáveis distintas o corpo usa ({{1}}, {{nome}}…). */
export function quantasVariaveis(corpoTemplate: string): number {
  const re = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
  const set = new Set<string>();
  for (const m of corpoTemplate.matchAll(re)) set.add(m[1]);
  return set.size;
}

export function prepararDestinatarios(input: {
  linhas: LinhaPlanilha[];
  colunaNome: string;
  colunaTelefone: string;
  origensVariaveis: Origem[];
  totalVariaveis: number;
  pais?: PaisLista;
}): Preparacao {
  const destinatarios: Preparado[] = [];
  const erros: ErroLinha[] = [];
  const vistos = new Set<string>();
  let duplicados = 0;

  const capadas = input.linhas.slice(0, MAX_DESTINATARIOS);
  const excedentes = Math.max(0, input.linhas.length - MAX_DESTINATARIOS);

  capadas.forEach((bruta, i) => {
    const linha = i + 2;
    const nome = valorDe(bruta, { coluna: input.colunaNome });
    const telefone = paraE164(
      valorDe(bruta, { coluna: input.colunaTelefone }),
      input.pais ?? "BR",
    );

    if (!nome) {
      erros.push({ linha, motivo: "nome_vazio" });
      return;
    }
    if (!telefone) {
      erros.push({ linha, motivo: "telefone_invalido" });
      return;
    }
    if (vistos.has(telefone)) {
      duplicados++;
      return;
    }

    const variaveis: string[] = [];
    for (let v = 0; v < input.totalVariaveis; v++) {
      const valor = valorDe(bruta, input.origensVariaveis[v]);
      if (!valor) {
        erros.push({ linha, motivo: "variavel_vazia", detalhe: `{{${v + 1}}}` });
        return;
      }
      variaveis.push(valor);
    }

    vistos.add(telefone);
    destinatarios.push({ nome, telefone, variaveis, linha });
  });

  return { destinatarios, erros, duplicados, excedentes };
}

/** Heurística simples de coluna por apelidos. */
export function autoMapearColuna(
  cabecalhos: string[],
  aliases: string[],
): string {
  const norm = (h: string) =>
    h
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/gi, " ")
      .trim()
      .toLowerCase();
  const al = aliases.map(norm);
  for (const h of cabecalhos) {
    const n = norm(h);
    if (al.some((a) => n === a || n.includes(a))) return h;
  }
  return cabecalhos[0] ?? "";
}
