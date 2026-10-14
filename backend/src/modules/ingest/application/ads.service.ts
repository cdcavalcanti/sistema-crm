import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../core/database/prisma.service";

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export function plataformaDe(raw: unknown): "meta_ads" | "google_ads" | null {
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

@Injectable()
export class AdsService {
  constructor(private readonly prisma: PrismaService) {}

  async ingest(body: Record<string, unknown>) {
    const plataforma = plataformaDe(body.plataforma ?? body.platform);
    if (!plataforma) return { error: "plataforma inválida" };
    const periodoInicio = new Date(String(body.periodo_inicio ?? body.start ?? new Date().toISOString().slice(0, 10)));
    const periodoFim = new Date(String(body.periodo_fim ?? body.end ?? new Date().toISOString().slice(0, 10)));
    const row = await this.prisma.indicadorAds.create({
      data: {
        plataforma,
        periodoInicio,
        periodoFim,
        contaId: str(body.conta_id ?? body.account_id),
        contaNome: str(body.conta_nome ?? body.account_name),
        campanhaId: str(body.campanha_id ?? body.campaign_id),
        campanhaNome: str(body.campanha_nome ?? body.campaign_name),
        investimento: num(body.investimento ?? body.spend),
        impressoes: num(body.impressoes ?? body.impressions) != null ? BigInt(num(body.impressoes ?? body.impressions)!) : null,
        alcance: num(body.alcance ?? body.reach) != null ? BigInt(num(body.alcance ?? body.reach)!) : null,
        cliques: num(body.cliques ?? body.clicks) != null ? BigInt(num(body.cliques ?? body.clicks)!) : null,
        ctr: num(body.ctr),
        cpc: num(body.cpc),
        cpl: num(body.cpl),
        cpm: num(body.cpm),
        conversoes: num(body.conversoes ?? body.conversions),
        leadsPlataforma: num(body.leads_plataforma ?? body.leads),
        receitaAds: num(body.receita_ads ?? body.revenue),
        roas: num(body.roas),
        fonte: str(body.fonte) ?? "plataforma",
        payload: body as Prisma.InputJsonValue,
      },
    });
    return { ok: true, id: row.id };
  }

  async snapshot() {
    const opps = await this.prisma.oportunidade.findMany({
      select: { origem: true, valor: true, etapa: { select: { tipo: true } } },
    });
    return { oportunidades: opps };
  }
}
