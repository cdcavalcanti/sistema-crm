import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, Bot, Phone, PhoneCall, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { TemplatePicker } from "@/components/chat/TemplatePicker";
import { CampanhaConfig, useCampanhaRemarketing } from "@/components/remarketing/CampanhaConfig";
import { useAuth } from "@/hooks/useAuth";
import { garantirConversaDaOportunidade } from "@/lib/remarketingConversa";

type Acao = {
  id: string;
  oportunidade_id: string;
  tipo: "ligacao" | "ia";
  status: string;
  responsavel: string | null;
  etapa_origem: string | null;
  dias_parado: number | null;
  criado_em: string;
  oportunidade: {
    id: string;
    interesse: string | null;
    observacoes: string | null;
    contato: { id: string; nome: string | null; telefone: string | null } | null;
  } | null;
};

export default function Remarketing() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const { data: campanha } = useCampanhaRemarketing();
  const [tipoFiltro, setTipoFiltro] = useState("todos");
  const [faixaFiltro, setFaixaFiltro] = useState<"todas" | "esfriando" | "frio" | "muito_frio">("todas");
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(25);
  const [registrando, setRegistrando] = useState<Acao | null>(null);
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [conversaPorOpp, setConversaPorOpp] = useState<Record<string, string>>({});

  const { data: resultado, isLoading } = useQuery({
    queryKey: ["remarketing-acoes", tipoFiltro],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = (supabase as any)
        .from("remarketing_acoes")
        .select(
          "id, oportunidade_id, tipo, status, responsavel, etapa_origem, dias_parado, criado_em, oportunidade:oportunidades(id, interesse, observacoes, contato:contatos(id, nome, telefone))",
        )
        .eq("status", "pendente")
        .order("criado_em", { ascending: true })
        .limit(300);
      if (tipoFiltro !== "todos") q = q.eq("tipo", tipoFiltro);
      const { data, error } = await q;
      if (error?.code === "42P01" || error?.code === "PGRST205") return "pendente" as const;
      if (error) throw error;
      return (data ?? []) as Acao[];
    },
  });

  const estruturaPendente = resultado === "pendente";
  const acoes: Acao[] = estruturaPendente ? [] : ((resultado as Acao[]) ?? []);

  const recarregar = () => qc.invalidateQueries({ queryKey: ["remarketing-acoes"] });

  useEffect(() => {
    setPagina(1);
  }, [tipoFiltro, faixaFiltro, porPagina]);

  // Resolve conversa WhatsApp para cards de IA (necessário pro TemplatePicker).
  useEffect(() => {
    const ias = acoes.filter((a) => a.tipo === "ia");
    if (!ias.length) return;
    let cancelled = false;
    void (async () => {
      const next: Record<string, string> = {};
      for (const a of ias) {
        if (conversaPorOpp[a.oportunidade_id]) {
          next[a.oportunidade_id] = conversaPorOpp[a.oportunidade_id];
          continue;
        }
        try {
          const id = await garantirConversaDaOportunidade(a.oportunidade_id);
          if (id) next[a.oportunidade_id] = id;
        } catch {
          /* segue sem conversa — botão fica desabilitado */
        }
      }
      if (!cancelled && Object.keys(next).length) {
        setConversaPorOpp((prev) => ({ ...prev, ...next }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acoes.map((a) => a.id).join(",")]);

  const concluir = async (acao: Acao, obs: string | null) => {
    const { data: sessao } = await supabase.auth.getUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("remarketing_acoes")
      .update({
        status: "concluida",
        observacao: obs?.trim() || null,
        concluida_em: new Date().toISOString(),
        concluida_por: sessao.user?.id ?? null,
      })
      .eq("id", acao.id);
    if (error) {
      toast.error(error.message || "Erro ao concluir");
      return false;
    }
    recarregar();
    return true;
  };

  const cancelar = async (acao: Acao) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from("remarketing_acoes")
      .update({ status: "cancelada" })
      .eq("id", acao.id);
    if (error) {
      toast.error(error.message || "Erro ao dispensar");
      return;
    }
    toast.success("Ação dispensada");
    recarregar();
  };

  const salvarLigacao = async () => {
    if (!registrando) return;
    setSalvando(true);
    const ok = await concluir(registrando, observacao);
    setSalvando(false);
    if (!ok) return;
    toast.success("Ligação registrada");
    setRegistrando(null);
    setObservacao("");
  };

  const ligacoes = acoes.filter((a) => a.tipo === "ligacao").length;
  const daIa = acoes.filter((a) => a.tipo === "ia").length;

  const FAIXAS = [
    { key: "esfriando" as const, max: 7, cor: "hsl(36 90% 45%)", label: "Esfriando", hint: "Até 7 dias parado" },
    { key: "frio" as const, max: 15, cor: "hsl(24 88% 50%)", label: "Frio", hint: "8 a 15 dias parado" },
    { key: "muito_frio" as const, max: Infinity, cor: "hsl(0 84% 55%)", label: "Muito frio", hint: "Mais de 15 dias parado" },
  ];

  const faixaDe = (a: Acao) => {
    const d = a.dias_parado ?? 0;
    return (FAIXAS.find((f) => d <= f.max) ?? FAIXAS[FAIXAS.length - 1]).key;
  };

  const contagemPorFaixa = FAIXAS.map((f) => ({
    ...f,
    total: acoes.filter((a) => faixaDe(a) === f.key).length,
  }));

  const ordenadas = [...acoes]
    .filter((a) => faixaFiltro === "todas" || faixaDe(a) === faixaFiltro)
    .sort((x, y) => (y.dias_parado ?? 0) - (x.dias_parado ?? 0));

  const total = ordenadas.length;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const de = total === 0 ? 0 : (paginaAtual - 1) * porPagina + 1;
  const ate = Math.min(paginaAtual * porPagina, total);
  const visiveis = ordenadas.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Recuperação
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Remarketing</h1>
          <p className="text-sm text-muted-foreground">
            {ligacoes} ligação{ligacoes === 1 ? "" : "ões"} · {daIa} mensagem{daIa === 1 ? "" : "ns"} da IA
          </p>
        </div>
        <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
          <SelectTrigger className="h-10 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="ligacao">Ligação</SelectItem>
            <SelectItem value="ia">Mensagem IA</SelectItem>
          </SelectContent>
        </Select>
      </header>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setFaixaFiltro("todas")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            faixaFiltro === "todas"
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          Todas
          {acoes.length ? (
            <span className="ml-1.5 rounded-full bg-background/70 px-1.5 py-px text-[10px] font-semibold tabular-nums text-foreground">
              {acoes.length}
            </span>
          ) : null}
        </button>
        {contagemPorFaixa.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFaixaFiltro(f.key)}
            title={f.hint}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              faixaFiltro === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: f.cor }} />
            {f.label}
            {f.total ? (
              <span className="rounded-full bg-background/70 px-1.5 py-px text-[10px] font-semibold tabular-nums text-foreground">
                {f.total}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {isAdmin && !estruturaPendente && (
        <CampanhaConfig conversaExemplo={Object.values(conversaPorOpp)[0]} />
      )}

      {estruturaPendente && (
        <div className="surface-card border-[hsl(36_90%_45%_/_0.4)] p-6 text-sm text-foreground">
          Área sendo liberada — rode a migration de remarketing no Supabase.
        </div>
      )}

      <div className="space-y-2">
        {isLoading && (
          <div className="surface-card p-8 text-center text-sm text-muted-foreground">
            Carregando…
          </div>
        )}
        {!isLoading && !estruturaPendente && total === 0 && (
          <div className="surface-card p-12 text-center text-sm text-muted-foreground">
            Nenhuma ação pendente. A cron move leads parados 7 dias para Follow-up / Remarketing.
          </div>
        )}

        {visiveis.map((a) => {
          const nome = a.oportunidade?.contato?.nome ?? "—";
          const telefone = a.oportunidade?.contato?.telefone ?? null;
          const conversaId = conversaPorOpp[a.oportunidade_id];
          return (
            <div
              key={a.id}
              className="surface-card flex flex-col gap-4 p-4 lg:flex-row lg:items-start"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to={`/oportunidades/${a.oportunidade_id}`}
                    className="text-sm font-medium text-foreground hover:text-primary"
                  >
                    {nome}
                  </Link>
                  {a.tipo === "ligacao" ? (
                    <Badge variant="outline" className="gap-1 text-[10px] font-normal">
                      <Phone className="h-3 w-3" />
                      Ligação
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="gap-1 border-primary/40 bg-primary/5 text-[10px] font-normal text-primary"
                    >
                      <Bot className="h-3 w-3" />
                      Mensagem IA
                    </Badge>
                  )}
                  {a.responsavel && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {a.responsavel}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Veio de {a.etapa_origem ?? "—"} · {a.dias_parado ?? 0} dia
                  {(a.dias_parado ?? 0) === 1 ? "" : "s"} parado
                  {telefone ? ` · ${telefone}` : ""}
                </p>
                {(a.oportunidade?.interesse || a.oportunidade?.observacoes) && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">
                    {a.oportunidade?.interesse || a.oportunidade?.observacoes}
                  </p>
                )}
              </div>

              <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                {a.tipo === "ligacao" ? (
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      setRegistrando(a);
                      setObservacao("");
                    }}
                  >
                    <PhoneCall className="h-3.5 w-3.5" />
                    Liguei
                  </Button>
                ) : conversaId ? (
                  <TemplatePicker
                    conversaId={conversaId}
                    rotulo={
                      campanha?.ativo && campanha.template_nome
                        ? "Enviar mensagem da campanha"
                        : "Mandar mensagem"
                    }
                    prefill={
                      campanha?.ativo && campanha.template_nome
                        ? {
                            name: campanha.template_nome,
                            language: campanha.template_idioma ?? "pt_BR",
                            params: campanha.template_params ?? {},
                          }
                        : undefined
                    }
                    onSent={() => {
                      void concluir(a, "Mensagem de recuperação enviada");
                    }}
                  />
                ) : (
                  <Button size="sm" variant="outline" disabled>
                    Sem telefone / conversa
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-1.5">
                      <X className="h-3.5 w-3.5" />
                      Dispensar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Dispensar ação?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Remove esta pendência da fila sem registrar contato.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void cancelar(a)}>
                        Dispensar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          );
        })}

        {total > porPagina && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-5 py-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Por página</span>
              <Select value={String(porPagina)} onValueChange={(v) => setPorPagina(Number(v))}>
                <SelectTrigger className="h-7 w-[72px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[25, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <span className="tabular-nums">
                {de}–{ate} de {total}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2"
                onClick={() => setPagina((n) => Math.max(1, n - 1))}
                disabled={paginaAtual <= 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="tabular-nums">
                {paginaAtual} / {totalPaginas}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2"
                onClick={() => setPagina((n) => Math.min(totalPaginas, n + 1))}
                disabled={paginaAtual >= totalPaginas}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!registrando} onOpenChange={(o) => !o && setRegistrando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Registrar ligação</DialogTitle>
            <DialogDescription>
              Confirme que ligou para o lead. A pendência sai da fila.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Observação (opcional)</Label>
            <Textarea
              rows={4}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: sem resposta / reagendou demo…"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRegistrando(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={() => void salvarLigacao()} disabled={salvando}>
              {salvando ? "Salvando…" : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
