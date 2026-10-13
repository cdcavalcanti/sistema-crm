import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney } from "@/lib/format";
import { recorteMaisRecente, type SnapshotAds } from "@/lib/indicadores-ads";

const BLOCOS = [
  { to: "/indicadores", t: "Indicadores", d: "Funil + Meta Ads + Google Ads." },
  { to: "/admin/ia", t: "Auditoria IA comercial", d: "Persona, prazos, o que pode prometer." },
  { to: "/reunioes", t: "Auditoria de reuniões", d: "Ata no mesmo negócio." },
  { to: "/outbound", t: "Prospecção outbound", d: "Fila de abordagem." },
  { to: "/meta", t: "Templates WhatsApp", d: "Templates oficiais e disparos." },
  { to: "/automacoes", t: "Automações", d: "Evento → tarefa ou oportunidade." },
];

export default function CentralGestao() {
  const { data } = useQuery({
    queryKey: ["gestao-exec"],
    queryFn: async () => {
      const [opps, ads] = await Promise.all([
        supabase.from("oportunidades").select("id, valor, etapa:etapas(tipo)"),
        supabase.from("indicadores_ads").select("*").order("coletado_em", { ascending: false }).limit(40),
      ]);
      const rows = opps.data ?? [];
      const ganhos = rows.filter((o: { etapa?: { tipo?: string } | null }) => o.etapa?.tipo === "ganho");
      const abertos = rows.filter((o: { etapa?: { tipo?: string } | null }) => {
        const t = o.etapa?.tipo;
        return t !== "ganho" && t !== "perdido";
      });
      const meta = recorteMaisRecente((ads.error ? [] : (ads.data ?? [])) as SnapshotAds[], "meta_ads");
      const google = recorteMaisRecente((ads.error ? [] : (ads.data ?? [])) as SnapshotAds[], "google_ads");
      return {
        pipeline: abertos.reduce((s: number, o: { valor?: number | null }) => s + Number(o.valor ?? 0), 0),
        ganhos: ganhos.length,
        taxa: rows.length ? (ganhos.length / rows.length) * 100 : 0,
        leads: rows.length,
        metaInv: meta.conta?.investimento ?? null,
        googleInv: google.conta?.investimento ?? null,
      };
    },
  });

  return (
    <div className="space-y-8">
      <header>
        <p className="page-eyebrow">Gestão autônoma</p>
        <h1 className="page-title">Central de gestão</h1>
        <p className="page-subtitle">Visão executiva deste tenant — do investimento à venda, sem planilha ao lado.</p>
      </header>
      {data && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { l: "Pipeline", v: fmtMoney(data.pipeline) },
            { l: "Negócios ganhos", v: String(data.ganhos) },
            { l: "Taxa de ganho", v: `${data.taxa.toFixed(0)}%` },
            { l: "Leads na base", v: String(data.leads) },
            { l: "Investimento Meta Ads", v: fmtMoney(data.metaInv) },
            { l: "Investimento Google Ads", v: fmtMoney(data.googleInv) },
          ].map((c) => (
            <div key={c.l} className="surface-card p-4">
              <p className="page-eyebrow">{c.l}</p>
              <p className="mt-2 text-2xl font-medium tabular-nums">{c.v}</p>
            </div>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {BLOCOS.map((b) => (
          <Link key={b.to} to={b.to} className="surface-card block p-5 hover:shadow-elegant">
            <h2 className="text-base font-medium">{b.t}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{b.d}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
