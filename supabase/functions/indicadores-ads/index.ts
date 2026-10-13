// Ponte com a plataforma de indicadores → aba /indicadores deste CRM.
// POST: empurra snapshot Meta Ads / Google Ads (conta + campanhas).
// GET: devolve o funil deste tenant nessas origens, para a plataforma cruzar CPL/ROAS reais.
//
// Auth: ?secret= ou header x-indicadores-secret.
// Secrets: INDICADORES_ADS_SECRET (fallback AGENDA_SYNC_SECRET).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-indicadores-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function plataformaDe(raw: unknown): "meta_ads" | "google_ads" | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s-]+/g, "_");
  if (["meta", "meta_ads", "facebook", "facebook_ads", "instagram_ads", "fb"].includes(s)) return "meta_ads";
  if (["google", "google_ads", "googleads", "adwords", "gads"].includes(s)) return "google_ads";
  return null;
}

const ORIGEM_CRM: Record<"meta_ads" | "google_ads", string[]> = {
  meta_ads: ["meta_ads", "Meta Ads", "facebook_ads", "Facebook Ads"],
  google_ads: ["google_ads", "Google Ads", "adwords", "AdWords"],
};

function metricas(obj: Record<string, unknown>) {
  return {
    investimento: num(obj.investimento ?? obj.spend ?? obj.gasto),
    impressoes: num(obj.impressoes ?? obj.impressions),
    alcance: num(obj.alcance ?? obj.reach),
    cliques: num(obj.cliques ?? obj.clicks),
    ctr: num(obj.ctr),
    cpc: num(obj.cpc),
    cpl: num(obj.cpl ?? obj.custo_por_lead),
    cpm: num(obj.cpm),
    conversoes: num(obj.conversoes ?? obj.conversions),
    leads_plataforma: num(obj.leads_plataforma ?? obj.leads ?? obj.lead),
    receita_ads: num(obj.receita_ads ?? obj.receita ?? obj.revenue),
    roas: num(obj.roas),
    campanha_id: str(obj.campanha_id ?? obj.campaign_id),
    campanha_nome: str(obj.campanha_nome ?? obj.campaign_name ?? obj.campanha),
    conta_id: str(obj.conta_id ?? obj.account_id),
    conta_nome: str(obj.conta_nome ?? obj.account_name ?? obj.conta),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") ?? req.headers.get("x-indicadores-secret");
  const expected = Deno.env.get("INDICADORES_ADS_SECRET") ?? Deno.env.get("AGENDA_SYNC_SECRET");
  if (!expected || secret !== expected) return json({ error: "unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (req.method === "GET") {
    const plat = plataformaDe(url.searchParams.get("plataforma") ?? "meta_ads") ?? "meta_ads";
    const origens = ORIGEM_CRM[plat];
    const { data: opps } = await admin
      .from("oportunidades")
      .select("id, origem, valor, etapa:etapas(tipo)");
    const doCanal = (opps ?? []).filter((o: { origem?: string | null }) => origens.includes(o.origem ?? ""));
    const abertos = doCanal.filter((o: { etapa?: { tipo?: string } | null }) => {
      const t = o.etapa?.tipo;
      return t !== "ganho" && t !== "perdido";
    });
    const ganhos = doCanal.filter((o: { etapa?: { tipo?: string } | null }) => o.etapa?.tipo === "ganho");
    const crm = {
      leads: doCanal.length,
      abertos: abertos.length,
      ganhos: ganhos.length,
      perdidos: doCanal.filter((o: { etapa?: { tipo?: string } | null }) => o.etapa?.tipo === "perdido").length,
      soma_aberta: abertos.reduce((s: number, o: { valor?: number | null }) => s + Number(o.valor ?? 0), 0),
      soma_ganho: ganhos.reduce((s: number, o: { valor?: number | null }) => s + Number(o.valor ?? 0), 0),
    };
    const { data: ads } = await admin
      .from("indicadores_ads")
      .select("*")
      .eq("plataforma", plat)
      .order("coletado_em", { ascending: false })
      .limit(40);
    return json({ ok: true, plataforma: plat, crm, ads: ads ?? [] });
  }

  if (req.method !== "POST") return json({ error: "method" }, 405);

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "json inválido" }, 400);

  const payloads = Array.isArray(body) ? body : [body];
  const agora = new Date().toISOString();
  let gravados = 0;

  for (const raw of payloads) {
    if (!raw || typeof raw !== "object") continue;
    const obj = raw as Record<string, unknown>;
    const plataforma = plataformaDe(obj.plataforma ?? obj.platform);
    if (!plataforma) return json({ error: "plataforma deve ser meta_ads ou google_ads" }, 400);
    const periodo_inicio = str(obj.periodo_inicio ?? obj.data_inicio ?? obj.since);
    const periodo_fim = str(obj.periodo_fim ?? obj.data_fim ?? obj.until);
    if (!periodo_inicio || !periodo_fim) {
      return json({ error: "periodo_inicio e periodo_fim são obrigatórios (YYYY-MM-DD)" }, 400);
    }

    await admin.from("indicadores_ads").delete().eq("plataforma", plataforma).eq("periodo_inicio", periodo_inicio).eq(
      "periodo_fim",
      periodo_fim,
    );

    const base = metricas(obj);
    const campanhas = Array.isArray(obj.campanhas) ? obj.campanhas : [];
    const linhas: Record<string, unknown>[] = [
      {
        plataforma,
        periodo_inicio,
        periodo_fim,
        ...base,
        fonte: str(obj.fonte) ?? "plataforma",
        payload: obj,
        coletado_em: agora,
      },
    ];
    for (const c of campanhas) {
      if (!c || typeof c !== "object") continue;
      const m = metricas({ ...obj, ...(c as Record<string, unknown>) });
      linhas.push({
        plataforma,
        periodo_inicio,
        periodo_fim,
        ...m,
        fonte: str(obj.fonte) ?? "plataforma",
        payload: c,
        coletado_em: agora,
      });
    }

    const { error } = await admin.from("indicadores_ads").insert(linhas);
    if (error) return json({ error: error.message }, 400);
    gravados += linhas.length;
  }

  return json({ ok: true, gravados });
});
