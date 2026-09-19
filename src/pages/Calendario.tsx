import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Link2,
  MapPin,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  Calendar,
  dateFnsLocalizer,
  type View,
  type SlotInfo,
  type ToolbarProps,
} from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDateTime } from "@/lib/format";

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-sync`;

async function callSync(path: string, init?: RequestInit) {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;
  const res = await fetch(`${FUNCTIONS_BASE}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message ?? body?.error ?? `HTTP ${res.status}`);
  return body;
}

// =====================================================================
// Localizer pt-BR
// =====================================================================
const locales = { "pt-BR": ptBR };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { locale: ptBR }),
  getDay,
  locales,
});

const messagesPtBr = {
  date: "Data",
  time: "Hora",
  event: "Evento",
  allDay: "Dia inteiro",
  week: "Semana",
  work_week: "Dias úteis",
  day: "Dia",
  month: "Mês",
  previous: "Anterior",
  next: "Próximo",
  yesterday: "Ontem",
  tomorrow: "Amanhã",
  today: "Hoje",
  agenda: "Agenda",
  noEventsInRange: "Nenhum evento neste intervalo.",
  showMore: (n: number) => `+ ${n} mais`,
};

const VIEW_LABELS: Record<string, string> = {
  month: "Mês",
  week: "Semana",
  day: "Dia",
  agenda: "Lista",
};

type EventoRaw = {
  google_event_id?: string;
  titulo: string;
  descricao?: string | null;
  inicio: string;
  fim: string;
  local?: string | null;
};

type CalEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: EventoRaw;
};

// =====================================================================
// Toolbar customizado
// =====================================================================
function CalendarToolbar(props: ToolbarProps) {
  const { label, onNavigate, onView, view, views } = props;
  const viewList = Array.isArray(views) ? views : Object.keys(views ?? {});
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2"
          onClick={() => onNavigate("PREV")}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2"
          onClick={() => onNavigate("NEXT")}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="ml-1 h-8 px-3"
          onClick={() => onNavigate("TODAY")}
        >
          Hoje
        </Button>
        <h2 className="ml-3 font-display text-lg font-semibold capitalize tracking-tight text-foreground sm:text-xl">
          {label}
        </h2>
      </div>
      <div className="flex rounded-lg border border-border bg-card p-0.5">
        {viewList.map((v) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => onView(v as View)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              view === v
                ? "bg-primary text-primary-foreground shadow-card"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {VIEW_LABELS[String(v)] ?? String(v)}
          </button>
        ))}
      </div>
    </div>
  );
}

// =====================================================================
// Renderer de evento (visão mês — uma linha compacta)
// =====================================================================
function MonthEvent({ event }: { event: CalEvent }) {
  return (
    <div className="flex items-center gap-1.5 truncate">
      <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary-foreground/80" />
      <span className="truncate text-[11px] font-medium">
        {format(event.start, "HH:mm")} {event.title}
      </span>
    </div>
  );
}

// =====================================================================
// Renderer agenda (lista)
// =====================================================================
function AgendaEvent({ event }: { event: CalEvent }) {
  return (
    <span className="text-sm font-medium text-foreground">{event.title}</span>
  );
}

// =====================================================================
// Dialog de criar/editar/remover evento
// =====================================================================
function EventoDialog({
  open,
  onOpenChange,
  evento,
  defaultStart,
  defaultEnd,
  onRefetch,
  conectado,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  evento: EventoRaw | null;
  defaultStart?: Date | null;
  defaultEnd?: Date | null;
  onRefetch: () => void;
  conectado: boolean;
}) {
  const isEdit = !!evento?.google_event_id;
  const [titulo, setTitulo] = useState(evento?.titulo ?? "");
  const [descricao, setDescricao] = useState(evento?.descricao ?? "");
  const [local, setLocal] = useState(evento?.local ?? "");
  const [inicio, setInicio] = useState(
    evento?.inicio
      ? format(new Date(evento.inicio), "yyyy-MM-dd'T'HH:mm")
      : defaultStart
        ? format(defaultStart, "yyyy-MM-dd'T'HH:mm")
        : "",
  );
  const [fim, setFim] = useState(
    evento?.fim
      ? format(new Date(evento.fim), "yyyy-MM-dd'T'HH:mm")
      : defaultEnd
        ? format(defaultEnd, "yyyy-MM-dd'T'HH:mm")
        : defaultStart
          ? format(new Date(defaultStart.getTime() + 60 * 60_000), "yyyy-MM-dd'T'HH:mm")
          : "",
  );

  const [telefone, setTelefone] = useState("");
  const [nomeAluno, setNomeAluno] = useState("");
  const [idade, setIdade] = useState("");
  const [serie, setSerie] = useState("");

  const salvar = useMutation({
    mutationFn: async () => {
      if (!titulo || !inicio || !fim) throw new Error("Preencha título, início e fim");
      // Em novo evento, embute os dados da visita na descrição para o agenda-sync
      // criar a oportunidade em "Visita Agendada" (fonte única — sem duplicidade).
      let descricaoFinal = descricao ?? "";
      if (!isEdit && (telefone.trim() || nomeAluno.trim() || idade.trim() || serie.trim())) {
        const extra = [
          telefone.trim() && `Número de telefone: ${telefone.trim()}`,
          nomeAluno.trim() && `Estabelecimento: ${nomeAluno.trim()}`,
          idade.trim() && `Anos de operação: ${idade.trim()}`,
          serie.trim() && `Segmento: ${serie.trim()}`,
        ].filter(Boolean).join("\n");
        descricaoFinal = `${descricaoFinal}\n${extra}`.trim();
      }
      const payload = {
        titulo,
        descricao: descricaoFinal,
        local,
        inicio: new Date(inicio).toISOString(),
        fim: new Date(fim).toISOString(),
      };
      if (isEdit) {
        await callSync(`/events/${encodeURIComponent(evento!.google_event_id!)}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await callSync("/events", { method: "POST", body: JSON.stringify(payload) });
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Evento atualizado" : "Evento criado");
      onOpenChange(false);
      onRefetch();
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro"),
  });

  const remover = useMutation({
    mutationFn: async () => {
      if (!evento?.google_event_id) throw new Error("Sem ID do Google");
      await callSync(`/events/${encodeURIComponent(evento.google_event_id)}`, { method: "DELETE" });
    },
    onSuccess: () => {
      toast.success("Evento removido");
      onOpenChange(false);
      onRefetch();
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar evento" : "Novo evento"}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            salvar.mutate();
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label>Responsável *</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Nome do responsável" required disabled={!conectado} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Início *</Label>
              <Input
                type="datetime-local"
                value={inicio}
                onChange={(e) => setInicio(e.target.value)}
                required
                disabled={!conectado}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fim *</Label>
              <Input
                type="datetime-local"
                value={fim}
                onChange={(e) => setFim(e.target.value)}
                required
                disabled={!conectado}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Local</Label>
            <Input value={local ?? ""} onChange={(e) => setLocal(e.target.value)} disabled={!conectado} />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              value={descricao ?? ""}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
              disabled={!conectado}
            />
          </div>
          {!isEdit && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Demo (opcional) — cria uma oportunidade em “Demo agendada”
              </p>
              <div className="space-y-1"><Label>Telefone</Label><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} disabled={!conectado} /></div>
              <div className="grid grid-cols-[1fr,4.5rem,1fr] gap-3">
                <div className="space-y-1"><Label>Estabelecimento</Label><Input value={nomeAluno} onChange={(e) => setNomeAluno(e.target.value)} disabled={!conectado} /></div>
                <div className="space-y-1"><Label>Anos de operação</Label><Input type="number" min={0} max={100} value={idade} onChange={(e) => setIdade(e.target.value)} disabled={!conectado} /></div>
                <div className="space-y-1"><Label>Segmento</Label><Input value={serie} onChange={(e) => setSerie(e.target.value)} disabled={!conectado} /></div>
              </div>
            </div>
          )}
          {!conectado && (
            <p className="text-xs text-destructive">
              Calendário desconectado — somente visualização.
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            {isEdit && conectado && (
              <Button
                type="button"
                variant="outline"
                onClick={() => remover.mutate()}
                disabled={remover.isPending}
                className="mr-auto text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Remover
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {conectado ? "Cancelar" : "Fechar"}
            </Button>
            {conectado && (
              <Button type="submit" disabled={salvar.isPending}>
                {salvar.isPending ? "Salvando…" : isEdit ? "Salvar" : "Criar"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// Página principal
// =====================================================================
export default function Calendario() {
  const qc = useQueryClient();
  const { canConnectGoogle } = useAuth();
  const [view, setView] = useState<View>("month");
  const [date, setDate] = useState(new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogEvento, setDialogEvento] = useState<EventoRaw | null>(null);
  const [dialogStart, setDialogStart] = useState<Date | null>(null);
  const [dialogEnd, setDialogEnd] = useState<Date | null>(null);
  const [dialogKey, setDialogKey] = useState(0);

  const status = useQuery({
    queryKey: ["google-status"],
    queryFn: () => callSync("/status"),
    retry: false,
  });

  const eventos = useQuery({
    queryKey: ["calendario-eventos"],
    queryFn: async () => {
      try {
        const start = new Date();
        start.setMonth(start.getMonth() - 2);
        const end = new Date();
        end.setMonth(end.getMonth() + 6);
        const r = await callSync(`/events?start=${start.toISOString()}&end=${end.toISOString()}`);
        return r.items as EventoRaw[];
      } catch (err: any) {
        if (!String(err.message).includes("not_connected")) {
          toast.error(err.message);
        }
        const { data } = await supabase.from("calendario_eventos").select("*").order("inicio");
        return (data ?? []) as EventoRaw[];
      }
    },
  });

  const conectado = !!status.data?.connected;

  const calEvents: CalEvent[] = useMemo(() => {
    return (eventos.data ?? []).map((e, idx) => ({
      id: e.google_event_id ?? `${e.titulo}-${idx}`,
      title: e.titulo,
      start: new Date(e.inicio),
      end: new Date(e.fim),
      resource: e,
    }));
  }, [eventos.data]);

  const proximosEventos = useMemo(() => {
    const agora = Date.now();
    return [...calEvents]
      .filter((e) => e.start.getTime() >= agora)
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 5);
  }, [calEvents]);

  const conectar = async () => {
    try {
      const r = await callSync("/auth");
      window.open(r.url, "_blank", "width=520,height=640");
    } catch (err: any) {
      toast.error(err?.message ?? "Erro");
    }
  };

  const abrirNovo = (start: Date | null = null, end: Date | null = null) => {
    if (!conectado) {
      toast.error("Conecte o Google Calendar para criar eventos");
      return;
    }
    setDialogEvento(null);
    setDialogStart(start);
    setDialogEnd(end);
    setDialogKey((k) => k + 1);
    setDialogOpen(true);
  };

  const abrirEvento = (evt: CalEvent) => {
    setDialogEvento(evt.resource);
    setDialogStart(null);
    setDialogEnd(null);
    setDialogKey((k) => k + 1);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="page-eyebrow">Operações</p>
          <h1 className="page-title">Calendário</h1>
          <p className="page-subtitle">Demos, reuniões e eventos sincronizados com o Google.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["calendario-eventos"] })}
          >
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Atualizar
          </Button>
          {canConnectGoogle && !conectado && (
            <Button variant="outline" size="sm" onClick={conectar}>
              <Link2 className="mr-2 h-3.5 w-3.5" />
              Conectar Google
            </Button>
          )}
          {conectado && (
            <Button size="sm" onClick={() => abrirNovo(null)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo evento
            </Button>
          )}
        </div>
      </header>

      {!conectado && (
        <div className="surface-card flex items-start gap-4 p-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Calendário ainda não conectado</p>
            <p className="text-xs text-muted-foreground">
              {canConnectGoogle
                ? "Conecte sua conta Google para ler e gravar eventos do calendário institucional."
                : "Peça ao super admin para conectar. Eventos vindos via webhook seguem no cache local."}
            </p>
          </div>
          {canConnectGoogle && (
            <Button size="sm" onClick={conectar}>
              <Link2 className="mr-2 h-3.5 w-3.5" />
              Conectar
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Calendário */}
        <div className="surface-card p-4 sm:p-5">
          {eventos.isLoading ? (
            <Skeleton className="h-[600px] w-full" />
          ) : (
            <div className="rbc-crm h-[calc(100vh-300px)] min-h-[560px]">
              <Calendar
                localizer={localizer}
                events={calEvents}
                culture="pt-BR"
                messages={messagesPtBr}
                view={view}
                onView={(v) => setView(v)}
                date={date}
                onNavigate={(d) => setDate(d)}
                views={["month", "week", "day", "agenda"]}
                startAccessor="start"
                endAccessor="end"
                selectable={conectado}
                onSelectSlot={(slot: SlotInfo) => abrirNovo(slot.start as Date, slot.end as Date)}
                onSelectEvent={(evt: any) => abrirEvento(evt)}
                popup
                step={30}
                timeslots={2}
                dayLayoutAlgorithm="no-overlap"
                components={{
                  toolbar: CalendarToolbar,
                  event: MonthEvent as any,
                  agenda: { event: AgendaEvent as any },
                }}
                formats={{
                  dayFormat: (d, _c, l) => l!.format(d, "EEE dd", "pt-BR"),
                  weekdayFormat: (d, _c, l) => l!.format(d, "EEE", "pt-BR"),
                  dayHeaderFormat: (d, _c, l) =>
                    l!.format(d, "EEEE, dd 'de' MMMM", "pt-BR"),
                  dayRangeHeaderFormat: ({ start, end }, _c, l) =>
                    `${l!.format(start, "dd MMM", "pt-BR")} – ${l!.format(end, "dd MMM yyyy", "pt-BR")}`,
                  monthHeaderFormat: (d, _c, l) => l!.format(d, "MMMM yyyy", "pt-BR"),
                  agendaHeaderFormat: ({ start, end }, _c, l) =>
                    `${l!.format(start, "dd MMM", "pt-BR")} – ${l!.format(end, "dd MMM yyyy", "pt-BR")}`,
                  agendaDateFormat: (d, _c, l) => l!.format(d, "EEE dd/MM", "pt-BR"),
                  agendaTimeFormat: (d, _c, l) => l!.format(d, "HH:mm", "pt-BR"),
                  agendaTimeRangeFormat: ({ start, end }, _c, l) =>
                    `${l!.format(start, "HH:mm", "pt-BR")} – ${l!.format(end, "HH:mm", "pt-BR")}`,
                  timeGutterFormat: (d, _c, l) => l!.format(d, "HH:mm", "pt-BR"),
                }}
                eventPropGetter={() => ({
                  className: "crm-event",
                })}
              />
            </div>
          )}
        </div>

        {/* Sidebar de próximos eventos */}
        <aside className="space-y-4">
          <div className="surface-card p-5">
            <p className="page-eyebrow">Próximos</p>
            <h2 className="mt-1 font-display text-lg font-semibold">Eventos agendados</h2>
            <div className="mt-4 space-y-3">
              {proximosEventos.length === 0 && (
                <p className="text-xs text-muted-foreground">Nada agendado adiante.</p>
              )}
              {proximosEventos.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => abrirEvento(e)}
                  className="w-full rounded-lg border border-border/60 bg-card/60 px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-card"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{e.title}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {fmtDateTime(e.resource.inicio)}
                      </div>
                      {e.resource.local && (
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          {e.resource.local}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="surface-card p-5">
            <p className="page-eyebrow">Resumo</p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-center">
              <div>
                <div className="font-display text-2xl font-semibold">{calEvents.length}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">no intervalo</div>
              </div>
              <div>
                <div className="font-display text-2xl font-semibold">{proximosEventos.length}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">a partir de hoje</div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <EventoDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        evento={dialogEvento}
        defaultStart={dialogStart}
        defaultEnd={dialogEnd}
        onRefetch={() => eventos.refetch()}
        conectado={conectado}
      />
    </div>
  );
}
