export function npsFaixa(score: number | null | undefined) {
  if (score == null) return { id: "pendente", label: "Pendente", cls: "bg-muted text-muted-foreground" };
  if (score <= 4) return { id: "critico", label: "Crítico", cls: "bg-rose-100 text-rose-800" };
  if (score <= 6) return { id: "risco", label: "Em risco", cls: "bg-orange-100 text-orange-800" };
  if (score === 7) return { id: "atencao", label: "Em atenção", cls: "bg-amber-100 text-amber-800" };
  if (score === 8) return { id: "saudavel", label: "Saudável", cls: "bg-lime-100 text-lime-800" };
  return { id: "defensor", label: "Defensor", cls: "bg-emerald-100 text-emerald-800" };
}

export function npsClassificacao(score: number) {
  if (score <= 6) return "detrator";
  if (score <= 8) return "neutro";
  return "promotor";
}

export function npsIndice(scores: number[]) {
  if (!scores.length) return null;
  const prom = scores.filter((s) => s >= 9).length / scores.length;
  const det = scores.filter((s) => s <= 6).length / scores.length;
  return Math.round((prom - det) * 100);
}

export function npsSelo(indice: number | null) {
  if (indice == null) return { label: "Sem respostas", cls: "bg-muted text-muted-foreground" };
  if (indice >= 75) return { label: "Excelente", cls: "bg-emerald-100 text-emerald-800" };
  if (indice >= 50) return { label: "Saudável", cls: "bg-lime-100 text-lime-800" };
  if (indice >= 0) return { label: "Em atenção", cls: "bg-amber-100 text-amber-800" };
  return { label: "Crítico", cls: "bg-rose-100 text-rose-800" };
}

export function npsBreakdown(scores: number[]) {
  const detratores = scores.filter((s) => s <= 6).length;
  const neutros = scores.filter((s) => s >= 7 && s <= 8).length;
  const promotores = scores.filter((s) => s >= 9).length;
  const n = scores.length;
  return {
    detratores,
    neutros,
    promotores,
    n,
    pctDetratores: n ? (detratores / n) * 100 : 0,
    pctNeutros: n ? (neutros / n) * 100 : 0,
    pctPromotores: n ? (promotores / n) * 100 : 0,
  };
}
