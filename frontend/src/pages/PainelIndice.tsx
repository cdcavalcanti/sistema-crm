import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fmtMoney } from "@/lib/format";

export default function PainelIndice() {
  const { data, isLoading } = useQuery({
    queryKey: ["painel-indice"],
    queryFn: async () => {
      const [opps, tarefas, nps, diag] = await Promise.all([
        supabase.from("oportunidades").select("id, valor, etapa:etapas(tipo)"),
        supabase.from("tarefas").select("id, status, due_date"),
        supabase.from("nps_respostas").select("score, status"),
        supabase.from("diagnosticos").select("id, titulo, indice, status, eixo, contato:contatos(nome)").order("criado_em", { ascending: false }),
      ]);
      const negocios = opps.data ?? [];
      const abertos = negocios.filter((o: { etapa?: { tipo?: string } | null }) => {
        const t = o.etapa?.tipo;
        return t !== "ganho" && t !== "perdido";
      });
      const soma = abertos.reduce((s: number, o: { valor?: number | null }) => s + Number(o.valor ?? 0), 0);
      const vencidas = (tarefas.data ?? []).filter(
        (t: { status: string; due_date: string | null }) =>
          t.status !== "concluida" && t.due_date && t.due_date < new Date().toISOString(),
      ).length;
      const notas = (nps.data ?? [])
        .map((n: { score: number | null }) => n.score)
        .filter((s: number | null): s is number => s != null);
      const npsMedio = notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null;
      const indice = (diag.data ?? [])
        .map((d: { indice: number | null }) => d.indice)
        .filter((s: number | null): s is number => s != null);
      const idx = indice.length ? indice.reduce((a, b) => a + b, 0) / indice.length : null;
      return {
        abertos: abertos.length,
        soma,
        vencidas,
        npsMedio,
        idx,
        diagnosticos: diag.data ?? [],
      };
    },
  });

  const cards = [
    { label: "Negócios em aberto", value: data?.abertos ?? "—", to: "/oportunidades" },
    { label: "Soma em aberto", value: data ? fmtMoney(data.soma) : "—", to: "/oportunidades" },
    { label: "Tarefas vencidas", value: data?.vencidas ?? "—", to: "/tarefas" },
    { label: "NPS médio", value: data?.npsMedio == null ? "—" : data.npsMedio.toFixed(1), to: "/nps" },
    { label: "Índice diagnóstico", value: data?.idx == null ? "—" : Math.round(data.idx), to: "/diagnosticos" },
  ];

  return (
    <div className="space-y-8">
      <header>
        <p className="page-eyebrow">Diagnóstico</p>
        <h1 className="page-title">Painel índice</h1>
        <p className="page-subtitle">Números deste tenant. O que não está no CRM não é inventado.</p>
      </header>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((c) => (
              <Link key={c.label} to={c.to} className="surface-card block p-5 hover:shadow-elegant">
                <p className="page-eyebrow">{c.label}</p>
                <p className="mt-2 text-3xl font-medium tabular-nums">{c.value}</p>
              </Link>
            ))}
          </div>
          <div className="space-y-2">
            <h2 className="text-base font-medium">Diagnósticos recentes</h2>
            {(data?.diagnosticos as { id: string; titulo: string; indice: number | null; eixo: string | null; contato?: { nome?: string } | null }[]).map((d) => (
              <Link key={d.id} to="/diagnosticos" className="surface-card flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{d.titulo}</p>
                  <p className="text-xs text-muted-foreground">{d.contato?.nome ?? "—"} · {d.eixo ?? "—"}</p>
                </div>
                <span className="font-display text-2xl tabular-nums">{d.indice ?? "—"}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
