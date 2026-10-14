import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmtDate, fmtMoney, fmtNumber, fmtPct } from "@/lib/format";
import { npsBreakdown, npsFaixa, npsIndice, npsSelo } from "@/lib/nps";
import {
  crmDoCanal,
  cplCrm,
  recorteMaisRecente,
  roasCrm,
  type PlataformaAds,
  type SnapshotAds,
} from "@/lib/indicadores-ads";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

function Barra({ label, pct, className }: { label: string; pct: number; className: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${className}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

function AdsCanal({
  titulo,
  plataforma,
  rows,
  opps,
}: {
  titulo: string;
  plataforma: PlataformaAds;
  rows: SnapshotAds[];
  opps: { origem?: string | null; valor?: number | null; etapa?: { tipo?: string } | null }[];
}) {
  const crm = crmDoCanal(opps, plataforma);
  const { conta, campanhas, todos } = recorteMaisRecente(rows, plataforma);
  const soma = (key: "investimento" | "impressoes" | "cliques") => {
    const n = campanhas.reduce((s, c) => s + Number(c[key] ?? 0), 0);
    return n > 0 ? n : null;
  };
  const investimento = conta?.investimento ?? soma("investimento");
  const periodo = todos[0];
  const kpis = [
    { l: "Investimento", v: fmtMoney(investimento) },
    { l: "Cliques", v: fmtNumber(conta?.cliques ?? soma("cliques")), h: conta?.ctr != null ? `CTR ${fmtPct(conta.ctr)}` : undefined },
    { l: "Leads no CRM", v: String(crm.leads), h: `${crm.abertos} abertos · ${crm.ganhos} ganhos` },
    { l: "CPL (CRM)", v: fmtMoney(cplCrm(investimento, crm.leads)), h: "gasto ÷ leads deste canal" },
    { l: "Ganhos do canal", v: fmtMoney(crm.somaGanho) },
    {
      l: "ROAS (CRM)",
      v: roasCrm(crm.somaGanho, investimento) == null ? "—" : `${roasCrm(crm.somaGanho, investimento)!.toFixed(2).replace(".", ",")}x`,
      h: "receita ganha ÷ investimento",
    },
  ];

  return (
    <section className="surface-card space-y-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="page-eyebrow">{plataforma === "meta_ads" ? "Meta" : "Google"}</p>
          <h2 className="text-lg font-medium">{titulo}</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {periodo
            ? `${fmtDate(periodo.periodo_inicio)} — ${fmtDate(periodo.periodo_fim)}${periodo.conta_nome ? ` · ${periodo.conta_nome}` : ""}`
            : "Aguardando a plataforma de indicadores enviar o recorte."}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k) => (
          <div key={k.l} className="rounded-sm border border-border/70 bg-background/60 p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{k.l}</p>
            <p className="mt-2 text-2xl font-medium tabular-nums">{k.v}</p>
            {k.h && <p className="mt-1 text-xs text-muted-foreground">{k.h}</p>}
          </div>
        ))}
      </div>
      {campanhas.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Campanha</TableHead>
              <TableHead>Investimento</TableHead>
              <TableHead>Cliques</TableHead>
              <TableHead>Leads (ads)</TableHead>
              <TableHead>CPL</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campanhas.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.campanha_nome ?? c.campanha_id ?? "—"}</TableCell>
                <TableCell className="tabular-nums">{fmtMoney(c.investimento)}</TableCell>
                <TableCell className="tabular-nums">{fmtNumber(c.cliques)}</TableCell>
                <TableCell className="tabular-nums">{fmtNumber(c.leads_plataforma)}</TableCell>
                <TableCell className="tabular-nums">{fmtMoney(c.cpl)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

export default function Indicadores() {
  const { data, isLoading } = useQuery({
    queryKey: ["indicadores-ads"],
    queryFn: async () => {
      const [opps, ads, nps] = await Promise.all([
        supabase.from("oportunidades").select("origem, valor, etapa:etapas(tipo)"),
        supabase.from("indicadores_ads").select("*").order("coletado_em", { ascending: false }).limit(80),
        supabase.from("nps_respostas").select("score, status"),
      ]);
      if (opps.error) throw opps.error;
      return {
        opps: opps.data ?? [],
        ads: ads.error ? [] : ((ads.data ?? []) as SnapshotAds[]),
        nps: nps.data ?? [],
      };
    },
  });

  const scores = (data?.nps ?? [])
    .map((n: { score: number | null }) => n.score)
    .filter((s: number | null): s is number => s != null);
  const indice = npsIndice(scores);
  const selo = npsSelo(indice);
  const mix = npsBreakdown(scores);
  const risco = (data?.nps ?? []).filter((n: { score: number | null }) => {
    const id = npsFaixa(n.score).id;
    return id === "critico" || id === "risco";
  }).length;
  const defensores = scores.filter((s) => s >= 9).length;
  const marker = indice == null ? 50 : ((indice + 100) / 200) * 100;

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="page-eyebrow">Gestão</p>
          <h1 className="page-title">Indicadores</h1>
          <p className="page-subtitle">NPS da carteira e mídia paga, cruzados com o que está no funil.</p>
        </div>
        <Link to="/equipe" className="text-sm text-primary hover:underline">Abrir NPS dos clientes</Link>
      </header>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <section className="surface-elevated space-y-6 p-6">
            <div>
              <p className="page-eyebrow">NPS da operação</p>
              <div className="mt-2 flex flex-wrap items-end gap-4">
                <p className="font-display text-5xl tabular-nums">{indice ?? "—"}</p>
                <span className={`rounded-full px-2.5 py-0.5 text-xs ${selo.cls}`}>{selo.label}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {scores.length
                  ? `${mix.promotores} promotores − ${mix.detratores} detratores, sobre ${mix.n} resposta${mix.n === 1 ? "" : "s"}.`
                  : "Ainda não há notas 0–10 neste tenant."}
              </p>
            </div>
            <div>
              <div className="relative h-2.5 rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500">
                <span
                  className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground"
                  style={{ left: `${marker}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>−100</span>
                <span>0</span>
                <span>100</span>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Barra label="Promotores (9–10)" pct={mix.pctPromotores} className="bg-emerald-500" />
              <Barra label="Neutros (7–8)" pct={mix.pctNeutros} className="bg-amber-400" />
              <Barra label="Detratores (0–6)" pct={mix.pctDetratores} className="bg-rose-500" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { l: "Respostas", v: String(mix.n), to: "/equipe" },
                { l: "Carteira em risco", v: String(risco), to: "/equipe?faixa=risco" },
                { l: "Defensores", v: String(defensores), to: "/equipe" },
                { l: "Média das notas", v: scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—" },
              ].map((c) =>
                c.to ? (
                  <Link key={c.l} to={c.to} className="rounded-sm border border-border/70 bg-background/70 p-4 hover:shadow-elegant">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{c.l}</p>
                    <p className="mt-2 text-2xl font-medium tabular-nums">{c.v}</p>
                  </Link>
                ) : (
                  <div key={c.l} className="rounded-sm border border-border/70 bg-background/70 p-4">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{c.l}</p>
                    <p className="mt-2 text-2xl font-medium tabular-nums">{c.v}</p>
                  </div>
                ),
              )}
            </div>
          </section>

          <AdsCanal titulo="Meta Ads" plataforma="meta_ads" rows={data?.ads ?? []} opps={data?.opps ?? []} />
          <AdsCanal titulo="Google Ads" plataforma="google_ads" rows={data?.ads ?? []} opps={data?.opps ?? []} />
        </>
      )}
    </div>
  );
}
