import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  Users,
  TrendingUp,
  ArrowUpRight,
  Handshake,
  CalendarCheck,
  Percent,
  AlertCircle,
  MessageCircle,
  CheckCircle2,
  Circle,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime } from "@/lib/format";

const ONBOARDING_KEY = "crm-onboarding-dismissed";

function StatCard({
  title,
  value,
  icon: Icon,
  hint,
  loading,
  to,
  accent,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  hint?: string;
  loading?: boolean;
  to?: string;
  accent?: "warn" | "ok" | "neutral";
}) {
  const ring =
    accent === "warn"
      ? "ring-amber-400/40 text-amber-700"
      : accent === "ok"
        ? "ring-emerald-400/40 text-emerald-700"
        : "ring-border/60 text-primary";

  const inner = (
    <div className="surface-card group relative overflow-hidden p-6 transition-shadow hover:shadow-elegant">
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: "radial-gradient(circle, hsl(var(--brand-soft) / 0.5) 0%, transparent 70%)" }}
      />
      <div className="relative flex items-start justify-between">
        <div className="space-y-1">
          <span className="page-eyebrow">{title}</span>
          <div className="font-display text-4xl font-semibold tracking-tight text-foreground">
            {loading ? <span className="text-muted-foreground/50">—</span> : value}
          </div>
          {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-secondary ring-1 ${ring}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );

  return to ? <Link to={to} className="block">{inner}</Link> : inner;
}

function inicioDoDiaIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function OnboardingChecklist({
  temContato,
  temOpp,
  temDemo,
  whatsappOk,
}: {
  temContato: boolean;
  temOpp: boolean;
  temDemo: boolean;
  whatsappOk: boolean;
}) {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(ONBOARDING_KEY) === "1",
  );

  const steps = useMemo(
    () => [
      {
        ok: temContato,
        titulo: "Cadastrar o primeiro estabelecimento",
        to: "/contatos",
        cta: "Abrir contatos",
      },
      {
        ok: temOpp,
        titulo: "Criar uma oportunidade no pipeline",
        to: "/oportunidades",
        cta: "Abrir oportunidades",
      },
      {
        ok: whatsappOk,
        titulo: "Conectar o WhatsApp comercial",
        to: "/chat",
        cta: "Abrir chat",
      },
      {
        ok: temDemo,
        titulo: "Agendar uma demo com o lead",
        to: "/calendario",
        cta: "Abrir calendário",
      },
    ],
    [temContato, temOpp, temDemo, whatsappOk],
  );

  const feitos = steps.filter((s) => s.ok).length;
  if (dismissed || feitos === steps.length) return null;

  return (
    <div className="surface-card relative overflow-hidden border border-primary/15 bg-gradient-to-br from-secondary/40 to-background p-6">
      <button
        type="button"
        className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Dispensar checklist"
        onClick={() => {
          localStorage.setItem(ONBOARDING_KEY, "1");
          setDismissed(true);
        }}
      >
        <X className="h-4 w-4" />
      </button>
      <p className="page-eyebrow">Primeiro dia</p>
      <h2 className="mt-1 font-display text-xl font-semibold">
        Deixe o CRM pronto em 4 passos
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Checklist para o time comercial começar a usar de verdade — sem planilha paralela.
      </p>
      <p className="mt-2 text-xs tabular-nums text-muted-foreground">
        {feitos}/{steps.length} concluídos
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {steps.map((s) => (
          <li
            key={s.titulo}
            className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/70 px-3 py-3"
          >
            {s.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${s.ok ? "text-muted-foreground line-through" : ""}`}>
                {s.titulo}
              </p>
              {!s.ok && (
                <Link to={s.to} className="text-xs font-medium text-primary hover:underline">
                  {s.cta}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const since7 = new Date();
      since7.setDate(since7.getDate() - 7);
      const hoje = inicioDoDiaIso();
      const agora = new Date().toISOString();

      const [
        contatos,
        oportunidades,
        novos,
        leadsHoje,
        etapasResp,
        recentes,
        ganhos,
        tarefas,
        followUpsAtrasados,
        demos,
        whatsappPendentes,
        whatsappStatus,
      ] = await Promise.all([
        supabase.from("contatos").select("id", { count: "exact", head: true }),
        supabase.from("oportunidades").select("id", { count: "exact", head: true }),
        supabase
          .from("oportunidades")
          .select("id", { count: "exact", head: true })
          .gte("criado_em", since7.toISOString()),
        supabase
          .from("oportunidades")
          .select("id", { count: "exact", head: true })
          .gte("criado_em", hoje),
        supabase.from("etapas").select("id, nome, ordem, cor, tipo").order("ordem"),
        supabase
          .from("oportunidades")
          .select(
            "id, criado_em, origem, interesse, contato:contatos(nome,email), etapa:etapas(nome,cor)",
          )
          .order("criado_em", { ascending: false })
          .limit(8),
        supabase
          .from("oportunidades")
          .select("id, etapa:etapas!inner(tipo)", { count: "exact", head: true })
          .eq("etapas.tipo", "ganho"),
        supabase
          .from("tarefas")
          .select("id", { count: "exact", head: true })
          .in("status", ["aberta", "em_andamento"]),
        supabase
          .from("tarefas")
          .select("id", { count: "exact", head: true })
          .in("status", ["aberta", "em_andamento"])
          .lt("due_date", agora),
        supabase
          .from("calendario_eventos")
          .select("id, titulo, inicio")
          .gte("inicio", agora)
          .order("inicio", { ascending: true })
          .limit(5),
        supabase
          .from("conversas")
          .select("id", { count: "exact", head: true })
          .gt("nao_lidas", 0),
        supabase.functions.invoke<{ conectado?: boolean }>("whatsapp-status", { method: "GET" })
          .then((r) => r.data)
          .catch(() => null),
      ]);

      const etapas = (etapasResp.data ?? []) as Array<{
        id: string;
        nome: string;
        cor: string | null;
        tipo: string | null;
        ordem: number;
      }>;
      const porEtapa: Record<string, number> = {};
      for (const e of etapas) porEtapa[e.id] = 0;
      await Promise.all(
        etapas.map(async (e) => {
          const { count } = await supabase
            .from("oportunidades")
            .select("id", { count: "exact", head: true })
            .eq("etapa_id", e.id);
          porEtapa[e.id] = count ?? 0;
        }),
      );

      const totalOpps = oportunidades.count ?? 0;
      const totalGanhos = ganhos.count ?? 0;
      const conversao = totalOpps > 0 ? (totalGanhos / totalOpps) * 100 : 0;

      return {
        totalContatos: contatos.count ?? 0,
        totalOpps,
        novosSemana: novos.count ?? 0,
        leadsHoje: leadsHoje.count ?? 0,
        tarefasAbertas: tarefas.count ?? 0,
        followUpsAtrasados: followUpsAtrasados.count ?? 0,
        fechamentosRealizados: totalGanhos,
        conversao,
        whatsappPendentes: whatsappPendentes.count ?? 0,
        whatsappConectado: !!whatsappStatus?.conectado,
        etapas,
        porEtapa,
        recentes: recentes.data ?? [],
        proximasDemos: demos.data ?? [],
      };
    },
  });

  const maxPorEtapa = Math.max(...Object.values(data?.porEtapa ?? { x: 1 }), 1);

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-2">
        <p className="page-eyebrow">
          Manhã comercial ·{" "}
          {new Date().toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
          })}
        </p>
        <div className="flex items-end justify-between gap-4">
          <h1 className="page-title text-4xl">
            <span className="text-gradient-brand">Sistema CRM</span>
          </h1>
          <Link
            to="/oportunidades?view=kanban"
            className="hidden items-center gap-1.5 text-sm font-medium text-primary hover:underline md:inline-flex"
          >
            Abrir kanban
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
        <p className="page-subtitle max-w-2xl">
          Números que o time olha todo dia: leads, conversão, follow-ups e WhatsApp.
        </p>
      </header>

      <OnboardingChecklist
        temContato={(data?.totalContatos ?? 0) > 0}
        temOpp={(data?.totalOpps ?? 0) > 0}
        temDemo={(data?.proximasDemos?.length ?? 0) > 0 || (data?.totalOpps ?? 0) > 2}
        whatsappOk={!!data?.whatsappConectado}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Leads hoje"
          value={data?.leadsHoje ?? 0}
          icon={TrendingUp}
          loading={isLoading}
          hint="Oportunidades criadas hoje"
          to="/oportunidades"
        />
        <StatCard
          title="Conversão"
          value={isLoading ? "—" : `${(data?.conversao ?? 0).toFixed(1)}%`}
          icon={Percent}
          loading={isLoading}
          hint="Ganhos / total do pipeline"
          to="/relatorios"
        />
        <StatCard
          title="Follow-ups atrasados"
          value={data?.followUpsAtrasados ?? 0}
          icon={AlertCircle}
          loading={isLoading}
          hint="Tarefas vencidas sem concluir"
          to="/tarefas"
          accent={(data?.followUpsAtrasados ?? 0) > 0 ? "warn" : "ok"}
        />
        <StatCard
          title="WhatsApp sem resposta"
          value={data?.whatsappPendentes ?? 0}
          icon={MessageCircle}
          loading={isLoading}
          hint={
            data?.whatsappConectado === false
              ? "WhatsApp desconectado — reconecte no Chat"
              : "Conversas com mensagens não lidas"
          }
          to="/chat"
          accent={
            data?.whatsappConectado === false || (data?.whatsappPendentes ?? 0) > 0
              ? "warn"
              : "ok"
          }
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Contatos"
          value={data?.totalContatos ?? 0}
          icon={Users}
          loading={isLoading}
          hint="Estabelecimentos na base"
          to="/contatos"
        />
        <StatCard
          title="Oportunidades"
          value={data?.totalOpps ?? 0}
          icon={Briefcase}
          loading={isLoading}
          hint="Pipeline ativo"
          to="/oportunidades"
        />
        <StatCard
          title="Novos (7 dias)"
          value={data?.novosSemana ?? 0}
          icon={TrendingUp}
          loading={isLoading}
          hint="Entrada de leads"
        />
        <StatCard
          title="Fechamentos"
          value={data?.fechamentosRealizados ?? 0}
          icon={Handshake}
          loading={isLoading}
          hint="Oportunidades em Ganho"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="surface-card p-6 lg:col-span-3">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="page-eyebrow">Funil</p>
              <h2 className="mt-1 font-display text-xl font-semibold">Distribuição por etapa</h2>
            </div>
            <Link to="/oportunidades?view=kanban" className="text-xs font-medium text-primary hover:underline">
              Ver kanban
            </Link>
          </div>
          <div className="space-y-4">
            {(data?.etapas ?? []).map((e) => {
              const count = data?.porEtapa[e.id] ?? 0;
              const pct = (count / maxPorEtapa) * 100;
              const cor = e.cor || "hsl(var(--primary))";
              return (
                <div key={e.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <span className="h-2 w-2 rounded-full" style={{ background: cor }} />
                      {e.nome}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {count}{" "}
                      <span className="text-muted-foreground/60">/ {data?.totalOpps ?? 0}</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${cor}, ${cor}cc)`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
            {!isLoading && (data?.etapas.length ?? 0) === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma etapa cadastrada.{" "}
                <Link to="/pipeline" className="font-medium text-primary hover:underline">
                  Configurar pipeline
                </Link>
              </p>
            )}
          </div>
        </div>

        <div className="surface-card space-y-6 p-6 lg:col-span-2">
          <div>
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="page-eyebrow">Agenda</p>
                <h2 className="mt-1 font-display text-lg font-semibold">Próximas demos</h2>
              </div>
              <Link to="/calendario" className="text-xs font-medium text-primary hover:underline">
                Calendário
              </Link>
            </div>
            <ol className="space-y-1">
              {(data?.proximasDemos ?? []).map((v) => (
                <li key={v.id} className="flex items-start gap-3 rounded-lg px-2 py-2 hover:bg-secondary/60">
                  <CalendarCheck className="mt-0.5 h-4 w-4 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{v.titulo}</div>
                    <div className="text-xs text-muted-foreground">{fmtDateTime(v.inicio)}</div>
                  </div>
                </li>
              ))}
              {(data?.proximasDemos ?? []).length === 0 && (
                <li className="px-2 py-3 text-sm text-muted-foreground">
                  Sem demos agendadas.{" "}
                  <Link to="/calendario" className="font-medium text-primary hover:underline">
                    Agendar
                  </Link>
                </li>
              )}
            </ol>
          </div>

          <div>
            <div className="mb-3 flex items-end justify-between">
              <p className="page-eyebrow">Tarefas pendentes</p>
              <Link to="/tarefas" className="text-xs font-medium text-primary hover:underline">
                Ver tudo
              </Link>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-3xl font-semibold">
                {data?.tarefasAbertas ?? 0}
              </span>
              <span className="text-xs text-muted-foreground">aguardando ação</span>
            </div>
          </div>
        </div>
      </div>

      <div className="surface-card p-6">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <p className="page-eyebrow">Pipeline</p>
            <h2 className="mt-1 font-display text-xl font-semibold">Últimos leads</h2>
          </div>
          <Link to="/oportunidades" className="text-xs font-medium text-primary hover:underline">
            Ver todas
          </Link>
        </div>
        <ol className="divide-y divide-border/60">
          {(data?.recentes ?? []).map((o: {
            id: string;
            criado_em: string;
            contato?: { nome?: string | null; email?: string | null } | null;
            etapa?: { nome?: string | null; cor?: string | null } | null;
          }) => (
            <li key={o.id}>
              <Link
                to={`/oportunidades/${o.id}`}
                className="flex items-center justify-between gap-3 px-2 py-3 hover:bg-secondary/40"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ background: o.etapa?.cor || "hsl(var(--primary))" }}
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{o.contato?.nome ?? "—"}</div>
                    <div className="truncate text-xs text-muted-foreground">{o.contato?.email}</div>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end leading-tight">
                  <span className="text-[11px] font-medium">{o.etapa?.nome ?? "—"}</span>
                  <span className="text-[10px] text-muted-foreground">{fmtDateTime(o.criado_em)}</span>
                </div>
              </Link>
            </li>
          ))}
          {!isLoading && (data?.recentes.length ?? 0) === 0 && (
            <li className="py-6 text-center text-sm text-muted-foreground">
              Sem leads recentes.{" "}
              <Link to="/oportunidades" className="font-medium text-primary hover:underline">
                Criar oportunidade
              </Link>
            </li>
          )}
        </ol>
      </div>
    </div>
  );
}
