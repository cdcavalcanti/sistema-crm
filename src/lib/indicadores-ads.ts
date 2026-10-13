export type PlataformaAds = "meta_ads" | "google_ads";

export const ORIGENS_ADS: Record<PlataformaAds, string[]> = {
  meta_ads: ["meta_ads", "Meta Ads", "facebook_ads", "Facebook Ads"],
  google_ads: ["google_ads", "Google Ads", "adwords", "AdWords"],
};

export type SnapshotAds = {
  id: string;
  plataforma: PlataformaAds;
  periodo_inicio: string;
  periodo_fim: string;
  conta_id: string | null;
  conta_nome: string | null;
  campanha_id: string | null;
  campanha_nome: string | null;
  investimento: number | null;
  impressoes: number | null;
  alcance: number | null;
  cliques: number | null;
  ctr: number | null;
  cpc: number | null;
  cpl: number | null;
  cpm: number | null;
  conversoes: number | null;
  leads_plataforma: number | null;
  receita_ads: number | null;
  roas: number | null;
  fonte: string;
  coletado_em: string;
};

export type CrmCanal = {
  leads: number;
  abertos: number;
  ganhos: number;
  perdidos: number;
  somaAberta: number;
  somaGanho: number;
};

export function crmDoCanal(
  opps: { origem?: string | null; valor?: number | null; etapa?: { tipo?: string } | null }[],
  plataforma: PlataformaAds,
): CrmCanal {
  const origens = ORIGENS_ADS[plataforma];
  const doCanal = opps.filter((o) => origens.includes(o.origem ?? ""));
  const abertos = doCanal.filter((o) => o.etapa?.tipo !== "ganho" && o.etapa?.tipo !== "perdido");
  const ganhos = doCanal.filter((o) => o.etapa?.tipo === "ganho");
  return {
    leads: doCanal.length,
    abertos: abertos.length,
    ganhos: ganhos.length,
    perdidos: doCanal.filter((o) => o.etapa?.tipo === "perdido").length,
    somaAberta: abertos.reduce((s, o) => s + Number(o.valor ?? 0), 0),
    somaGanho: ganhos.reduce((s, o) => s + Number(o.valor ?? 0), 0),
  };
}

export function recorteMaisRecente(rows: SnapshotAds[], plataforma: PlataformaAds) {
  const doCanal = rows.filter((r) => r.plataforma === plataforma);
  if (!doCanal.length) return { conta: null as SnapshotAds | null, campanhas: [] as SnapshotAds[], todos: [] as SnapshotAds[] };
  const maisNovo = doCanal.reduce((a, b) => (a.coletado_em >= b.coletado_em ? a : b));
  const mesmaJanela = doCanal.filter(
    (r) => r.periodo_inicio === maisNovo.periodo_inicio && r.periodo_fim === maisNovo.periodo_fim,
  );
  const campanhas = mesmaJanela.filter((r) => r.campanha_id || r.campanha_nome);
  const conta =
    mesmaJanela.find((r) => !r.campanha_id && !r.campanha_nome) ??
    (campanhas.length ? null : maisNovo);
  return { conta, campanhas, todos: mesmaJanela };
}

export function cplCrm(investimento: number | null, leads: number) {
  if (investimento == null || !leads) return null;
  return investimento / leads;
}

export function roasCrm(somaGanho: number, investimento: number | null) {
  if (investimento == null || investimento <= 0 || somaGanho <= 0) return null;
  return somaGanho / investimento;
}
