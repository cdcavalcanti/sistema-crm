import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Search, X, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fmtNumber } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ORIGENS_DESTAQUE, OUTRAS_ORIGENS_LABEL, displayOrigem } from "@/lib/origem";
import {
  FILTROS_VAZIOS,
  FILTRO_TODOS,
  applyOportunidadeFiltros,
  fetchContatoIdsForSearch,
  fetchResponsaveisDisponiveis,
  temFiltrosAtivos,
  type OportunidadeFilters,
} from "@/lib/oportunidades-filtros";
import { exportarOportunidadesXlsx } from "@/lib/exportar-oportunidades";

const COLORS = ["#3b82f6", "#06b6d4", "#8b5cf6", "#a855f7", "#f97316", "#eab308", "#14b8a6", "#0ea5e9", "#10b981", "#ef4444"];

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="surface-card p-5">
      <p className="page-eyebrow">{label}</p>
      <div className="mt-1 font-display text-3xl font-semibold">{value}</div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function Relatorios() {
  const [filters, setFilters] = useState<OportunidadeFilters>(FILTROS_VAZIOS);
  const [exportando, setExportando] = useState(false);
  const setFilter = <K extends keyof OportunidadeFilters>(k: K, v: OportunidadeFilters[K]) =>
    setFilters((f) => ({ ...f, [k]: v }));

  const { data: responsaveis = [] } = useQuery({
    queryKey: ["responsaveis-distintos"],
    queryFn: fetchResponsaveisDisponiveis,
    staleTime: 60_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["relatorios", filters],
    queryFn: async () => {
      const PAGE = 1000;
      const contatoIds = await fetchContatoIdsForSearch(filters.searchText);
      const out: any[] = [];
      let offset = 0;
      while (true) {
        let q = supabase
          .from("oportunidades")
          .select("id, etapa_id, origem, valor, motivo_perda, criado_em, etapa:etapas(tipo)")
          .order("criado_em", { ascending: false })
          .range(offset, offset + PAGE - 1);
        q = applyOportunidadeFiltros(q, filters, contatoIds);
        const { data, error } = await q;
        if (error) throw error;
        if (!data?.length) break;
        out.push(...data);
        if (data.length < PAGE) break;
        offset += PAGE;
      }
      const etapas = await supabase.from("etapas").select("id, nome, cor, ordem, tipo").order("ordem");
      return { etapas: (etapas.data ?? []) as any[], oportunidades: out as any[] };
    },
  });

  const stats = useMemo(() => {
    if (!data) return null;
    const ops = data.oportunidades;
    const total = ops.length;
    const ganhos = ops.filter((o) => o.etapa?.tipo === "ganho").length;
    const perdidas = ops.filter((o) => o.etapa?.tipo === "perdido");
    const conversao = total ? (ganhos / total) * 100 : 0;

    const funil = data.etapas.map((e) => ({
      name: e.nome,
      total: ops.filter((o) => o.etapa_id === e.id).length,
      cor: e.cor,
    }));

    const origens: Record<string, number> = {};
    for (const o of ops) {
      const d = displayOrigem(o.origem);
      origens[d] = (origens[d] ?? 0) + 1;
    }
    const ordem = [...ORIGENS_DESTAQUE, OUTRAS_ORIGENS_LABEL];
    const origemSerie = ordem.map((name) => ({ name, total: origens[name] ?? 0 })).filter((d) => d.total > 0);

    // Motivos de perda — só entre as perdidas COM motivo informado.
    const semMotivo = perdidas.filter((o) => !o.motivo_perda).length;
    const comMotivo = perdidas.filter((o) => o.motivo_perda);
    const motivosMap: Record<string, number> = {};
    for (const o of comMotivo) motivosMap[o.motivo_perda] = (motivosMap[o.motivo_perda] ?? 0) + 1;
    const motivosSerie = Object.entries(motivosMap)
      .map(([name, t]) => ({ name, total: t }))
      .sort((a, b) => b.total - a.total);

    return {
      total,
      ganhos,
      perdidas: perdidas.length,
      conversao,
      funil,
      origemSerie,
      motivosSerie,
      comMotivoTotal: comMotivo.length,
      semMotivo,
    };
  }, [data]);

  const gerarRelatorio = async () => {
    setExportando(true);
    try {
      const n = await exportarOportunidadesXlsx(filters);
      toast.success(`Relatório gerado (${n} oportunidade${n === 1 ? "" : "s"})`);
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao exportar");
    } finally {
      setExportando(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="page-eyebrow">Painel de desempenho</p>
          <h1 className="page-title">Relatórios</h1>
          <p className="page-subtitle">Pipeline, conversão e canais — filtre e exporte para Excel.</p>
        </div>
        <Button variant="outline" onClick={gerarRelatorio} disabled={exportando}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          {exportando ? "Gerando…" : "Exportar Excel"}
        </Button>
      </header>

      {/* Filtros */}
      <div className="surface-card space-y-3 p-4">
        <div className="flex items-center gap-3">
          <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <Input
            placeholder="Buscar (nome, empresa, telefone, observações…)"
            value={filters.searchText}
            onChange={(e) => setFilter("searchText", e.target.value)}
            className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Origem</label>
            <Select value={filters.origem} onValueChange={(v) => setFilter("origem", v)}>
              <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTRO_TODOS}>Todas</SelectItem>
                {ORIGENS_DESTAQUE.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                <SelectItem value={OUTRAS_ORIGENS_LABEL}>{OUTRAS_ORIGENS_LABEL}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Responsável</label>
            <Select value={filters.responsavel} onValueChange={(v) => setFilter("responsavel", v)}>
              <SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTRO_TODOS}>Todos</SelectItem>
                {responsaveis.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Criado de</label>
            <Input type="date" value={filters.criadoDe} onChange={(e) => setFilter("criadoDe", e.target.value)} className="h-9 w-[150px]" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Até</label>
            <Input type="date" value={filters.criadoAte} onChange={(e) => setFilter("criadoAte", e.target.value)} className="h-9 w-[150px]" />
          </div>
          {temFiltrosAtivos(filters) && (
            <Button variant="ghost" size="sm" className="h-9 self-end text-muted-foreground" onClick={() => setFilters(FILTROS_VAZIOS)}>
              <X className="mr-1.5 h-3.5 w-3.5" /> Limpar
            </Button>
          )}
        </div>
      </div>

      {isLoading && <Skeleton className="h-96 w-full" />}

      {stats && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Oportunidades" value={fmtNumber(stats.total)} hint="No filtro atual" />
            <Stat label="Ganhos" value={fmtNumber(stats.ganhos)} hint="Fechamentos" />
            <Stat label="Conversão" value={`${stats.conversao.toFixed(1)}%`} hint="Ganhas / Total" />
            <Stat label="Perdidas" value={fmtNumber(stats.perdidas)} hint="Etapas de perda" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="surface-card p-6">
              <h2 className="mb-4 font-display text-lg font-semibold">Origem dos leads</h2>
              <div className="grid h-64 grid-cols-[160px_1fr] items-center gap-4">
                <div className="h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={stats.origemSerie} dataKey="total" nameKey="name" cx="50%" cy="50%" innerRadius={42} outerRadius={72} paddingAngle={2} stroke="hsl(var(--background))" strokeWidth={2}>
                        {stats.origemSerie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number, n: string) => [`${v} lead(s)`, n]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="space-y-2 text-sm">
                  {stats.origemSerie.map((d, i) => {
                    const pct = stats.total ? (d.total / stats.total) * 100 : 0;
                    return (
                      <li key={d.name} className="flex items-center gap-2" title={d.name}>
                        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="min-w-0 flex-1 truncate">{d.name}</span>
                        <span className="flex-shrink-0 tabular-nums text-xs text-muted-foreground">{d.total} · {pct.toFixed(0)}%</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            <div className="surface-card p-6">
              <h2 className="mb-1 font-display text-lg font-semibold">Motivos de perda</h2>
              <p className="mb-4 text-xs text-muted-foreground">
                {stats.comMotivoTotal} com motivo informado · {stats.semMotivo} sem informar (de {stats.perdidas} perdidas)
              </p>
              {stats.motivosSerie.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Nenhum motivo de perda informado no filtro atual.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {stats.motivosSerie.map((d) => {
                    const pct = stats.comMotivoTotal ? (d.total / stats.comMotivoTotal) * 100 : 0;
                    return (
                      <li key={d.name} className="flex items-center gap-3">
                        <span className="min-w-0 flex-1 truncate">{d.name}</span>
                        <div className="h-2 w-40 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-destructive" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="flex-shrink-0 tabular-nums text-xs text-muted-foreground">{d.total} · {pct.toFixed(0)}%</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="surface-card p-6 lg:col-span-2">
              <h2 className="mb-4 font-display text-lg font-semibold">Funil por etapa</h2>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.funil} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} width={180} />
                    <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                      {stats.funil.map((d: any, i: number) => <Cell key={i} fill={d.cor || "hsl(var(--primary))"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
