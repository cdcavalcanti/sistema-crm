import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Check, CalendarDays, User, Briefcase, Search, Clock } from "lucide-react";
import { Link } from "react-router-dom";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { PRIORIDADE_TAREFA, RESPONSAVEIS_CRM, STATUS_TAREFA } from "@/lib/constants";
import { ContatoCombobox } from "@/components/contatos/ContatoCombobox";
import { OportunidadeCombobox } from "@/components/oportunidades/OportunidadeCombobox";

type Tarefa = {
  id: string;
  titulo: string;
  descricao: string | null;
  status: string;
  prioridade: string;
  due_date: string | null;
  criado_em: string;
  concluida_em: string | null;
  atribuido_para: string | null;
  contato: { id: string; nome: string } | null;
  oportunidade: { id: string; titulo: string | null; etapa: { nome: string; cor: string | null } | null } | null;
};

function NovaTarefaDialog() {
  const { user, responsavelCrm } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState("media");
  const [dueDate, setDueDate] = useState("");
  const [contatoId, setContatoId] = useState<string | null>(null);
  const [oportunidadeId, setOportunidadeId] = useState<string | null>(null);
  const [atribuido, setAtribuido] = useState(responsavelCrm || "Comercial");

  const reset = () => {
    setTitulo("");
    setDescricao("");
    setPrioridade("media");
    setDueDate("");
    setContatoId(null);
    setOportunidadeId(null);
    setAtribuido(responsavelCrm || "Comercial");
  };

  const criar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tarefas").insert({
        titulo,
        descricao: descricao || null,
        prioridade,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        contato_id: contatoId,
        oportunidade_id: oportunidadeId,
        atribuido_para: atribuido || null,
        criado_por: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa criada");
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      setOpen(false);
      reset();
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Nova tarefa
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova tarefa</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!titulo.trim()) return;
            if (!contatoId && !oportunidadeId) {
              toast.error("Vincule a tarefa a um contato e/ou oportunidade");
              return;
            }
            criar.mutate();
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            <Select value={atribuido} onValueChange={setAtribuido}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RESPONSAVEIS_CRM.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Contato {!oportunidadeId && <span className="text-destructive">*</span>}</Label>
            <ContatoCombobox
              value={contatoId}
              onChange={(id) => {
                setContatoId(id);
                // Se trocar de contato, limpa opp para evitar mismatch
                setOportunidadeId(null);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Oportunidade {!contatoId && <span className="text-destructive">*</span>}</Label>
            <OportunidadeCombobox
              value={oportunidadeId}
              contatoId={contatoId}
              onChange={(id, opp) => {
                setOportunidadeId(id);
                // Se selecionar opp sem ter contato, auto-preenche
                if (id && opp && !contatoId) setContatoId(opp.contato_id);
              }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Vincule a um contato, uma oportunidade, ou ambos.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={prioridade} onValueChange={setPrioridade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORIDADE_TAREFA.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Vencimento</Label>
              <Input type="datetime-local" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={criar.isPending}>
              {criar.isPending ? "Salvando…" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Tarefas() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState("abertas");
  const [busca, setBusca] = useState("");
  const [dono, setDono] = useState("todos");

  const { data, isLoading } = useQuery({
    queryKey: ["tarefas", filtro],
    queryFn: async () => {
      let query = supabase
        .from("tarefas")
        .select(
          "id, titulo, descricao, status, prioridade, due_date, criado_em, concluida_em, atribuido_para, contato:contatos(id, nome), oportunidade:oportunidades(id, titulo, etapa:etapas(nome, cor))",
        )
        .order("due_date", { ascending: true, nullsFirst: false })
        .order("criado_em", { ascending: false });
      if (filtro === "abertas") query = query.in("status", ["aberta", "em_andamento"]);
      if (filtro === "concluidas") query = query.eq("status", "concluida");
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as Tarefa[];
    },
  });

  const atualizar = useMutation({
    mutationFn: async ({ id, fields }: { id: string; fields: Partial<Tarefa> }) => {
      const { error } = await supabase.from("tarefas").update(fields).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tarefas"] }),
    onError: (err: any) => toast.error(err?.message ?? "Erro"),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("tarefas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa removida");
      qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro"),
  });

  const agora = Date.now();
  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);
  const fimHoje = new Date();
  fimHoje.setHours(23, 59, 59, 999);

  const lista = (data ?? []).filter((t) => {
    if (dono !== "todos" && t.atribuido_para !== dono) return false;
    const tq = busca.trim().toLowerCase();
    if (!tq) return true;
    return `${t.titulo} ${t.descricao ?? ""} ${t.contato?.nome ?? ""}`.toLowerCase().includes(tq);
  });
  const atrasadas = lista.filter((t) => t.status !== "concluida" && t.due_date && new Date(t.due_date).getTime() < agora);
  const hoje = lista.filter((t) => {
    if (t.status === "concluida" || !t.due_date) return false;
    const d = new Date(t.due_date).getTime();
    return d >= inicioHoje.getTime() && d <= fimHoje.getTime();
  });

  const adiar = (t: Tarefa) => {
    const base = t.due_date ? new Date(t.due_date) : new Date();
    base.setDate(base.getDate() + 1);
    atualizar.mutate({ id: t.id, fields: { due_date: base.toISOString() } as Partial<Tarefa> });
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="page-eyebrow">Secretária IA</p>
          <h1 className="page-title">Tarefas</h1>
          <p className="page-subtitle">Conclua, adie e vincule follow-up ao lead ou ao negócio.</p>
        </div>
        <NovaTarefaDialog />
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { l: "Abertas", v: (data ?? []).filter((t) => t.status !== "concluida").length },
          { l: "Atrasadas", v: (data ?? []).filter((t) => t.status !== "concluida" && t.due_date && new Date(t.due_date).getTime() < agora).length },
          { l: "Para hoje", v: (data ?? []).filter((t) => t.status !== "concluida" && t.due_date && new Date(t.due_date).getTime() >= inicioHoje.getTime() && new Date(t.due_date).getTime() <= fimHoje.getTime()).length },
        ].map((c) => (
          <div key={c.l} className="surface-card p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{c.l}</p>
            <p className="mt-1 text-2xl font-medium tabular-nums">{c.v}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Tabs value={filtro} onValueChange={setFiltro}>
          <TabsList>
            <TabsTrigger value="abertas">Abertas</TabsTrigger>
            <TabsTrigger value="concluidas">Concluídas</TabsTrigger>
            <TabsTrigger value="todas">Todas</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar tarefa, lead…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <Select value={dono} onValueChange={setDono}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Responsável" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {RESPONSAVEIS_CRM.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {isLoading && <Skeleton className="h-32 w-full" />}
        {!isLoading && lista.length === 0 && (
          <p className="surface-card p-8 text-center text-sm text-muted-foreground">
            Nenhuma tarefa neste recorte.
          </p>
        )}
        {atrasadas.length > 0 && filtro !== "concluidas" && (
          <p className="pt-2 text-[10px] uppercase tracking-[0.2em] text-destructive">Atrasadas · {atrasadas.length}</p>
        )}
        {hoje.length > 0 && filtro !== "concluidas" && atrasadas.length > 0 && (
          <span className="sr-only">hoje</span>
        )}
        {lista.map((t) => {
          const prioridade = PRIORIDADE_TAREFA.find((p) => p.value === t.prioridade);
          const status = STATUS_TAREFA.find((s) => s.value === t.status);
          const concluida = t.status === "concluida";
          const vencida =
            !concluida && t.due_date && new Date(t.due_date).getTime() < Date.now();
          return (
            <div
              key={t.id}
              className="surface-card flex items-start gap-3 p-4"
            >
              <Button
                variant="outline"
                size="icon"
                className={`mt-0.5 h-6 w-6 shrink-0 rounded-full ${
                  concluida ? "bg-primary text-primary-foreground border-primary" : ""
                }`}
                onClick={() =>
                  atualizar.mutate({
                    id: t.id,
                    fields: { status: concluida ? "aberta" : "concluida" },
                  })
                }
              >
                {concluida && <Check className="h-3 w-3" />}
              </Button>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${concluida ? "line-through text-muted-foreground" : ""}`}>
                  {t.titulo}
                </div>
                {t.descricao && (
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{t.descricao}</p>
                )}
                {(t.contato || t.oportunidade) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    {t.contato && (
                      <Link
                        to={`/contatos/${t.contato.id}`}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
                      >
                        <User className="h-3 w-3" />
                        {t.contato.nome}
                      </Link>
                    )}
                    {t.oportunidade && (
                      <Link
                        to={`/oportunidades/${t.oportunidade.id}`}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
                      >
                        <Briefcase className="h-3 w-3" />
                        {t.oportunidade.etapa && (
                          <span
                            className="h-1.5 w-1.5 rounded-full"
                            style={{ background: t.oportunidade.etapa.cor ?? "currentColor" }}
                          />
                        )}
                        {t.oportunidade.titulo ?? t.oportunidade.etapa?.nome ?? "Oportunidade"}
                      </Link>
                    )}
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <Badge
                    variant="secondary"
                    className="font-normal"
                    style={{ background: `${prioridade?.cor}22`, color: prioridade?.cor }}
                  >
                    {prioridade?.label}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="font-normal"
                    style={{ borderColor: `${status?.cor}55`, color: status?.cor }}
                  >
                    {status?.label}
                  </Badge>
                  {t.due_date && (
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] ${
                        vencida ? "text-destructive font-medium" : "text-muted-foreground"
                      }`}
                    >
                      <CalendarDays className="h-3 w-3" />
                      {fmtDateTime(t.due_date)}
                    </span>
                  )}
                  {t.atribuido_para && (
                    <span className="text-muted-foreground">{t.atribuido_para}</span>
                  )}
                  {concluida && t.concluida_em && (
                    <span className="text-muted-foreground">
                      Concluída {fmtRelative(t.concluida_em)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {!concluida && (
                  <Button variant="ghost" size="sm" title="Adiar 1 dia" onClick={() => adiar(t)}>
                    <Clock className="mr-1 h-3.5 w-3.5" />
                    +1 dia
                  </Button>
                )}
                {!concluida && t.status === "aberta" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => atualizar.mutate({ id: t.id, fields: { status: "em_andamento" } })}
                  >
                    Em curso
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => remover.mutate(t.id)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
