import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtRelative } from "@/lib/format";

const STATUS_INFO: Record<string, { label: string; cls: string }> = {
  solicitada: { label: "Em análise", cls: "bg-blue-100 text-blue-700" },
  preparando: { label: "Preparando ajuste", cls: "bg-blue-100 text-blue-700" },
  aguardando_aprovacao: { label: "Aguardando aprovação", cls: "bg-amber-100 text-amber-800" },
  aprovada: { label: "Aprovada · subindo", cls: "bg-violet-100 text-violet-700" },
  concluida: { label: "Concluída", cls: "bg-emerald-100 text-emerald-700" },
  backlog: { label: "Backlog", cls: "bg-slate-200 text-slate-700" },
  falhou: { label: "Falhou", cls: "bg-rose-100 text-rose-700" },
};

export default function PedirMelhoria() {
  const qc = useQueryClient();
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [reportadas, setReportadas] = useState<Record<string, boolean>>({});
  const [detalhe, setDetalhe] = useState<any | null>(null);

  const { data: melhorias } = useQuery({
    queryKey: ["melhorias"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("melhorias")
        .select("id, titulo, status, criado_em, solicitante_email, descricao, resumo_ajuste")
        .order("criado_em", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const enviar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; url?: string; numero?: number; error?: string }>(
        "pedir-melhoria",
        { body: { titulo, descricao } },
      );
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Falha ao enviar");
      return data;
    },
    onSuccess: () => {
      setEnviado(true);
      setTitulo("");
      setDescricao("");
      qc.invalidateQueries({ queryKey: ["melhorias"] });
      toast.success("Pedido registrado. O time técnico analisa e avisa no grupo para aprovação.");
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro ao enviar pedido"),
  });

  const reportarProblema = useMutation({
    mutationFn: async (melhoriaId: string) => {
      // 1) Grava o report direto no banco (RPC). É resiliente: não depende de a
      //    Edge Function estar publicada, então nunca cai no erro genérico
      //    "Failed to send a request to the Edge Function".
      const { error } = await supabase.rpc("reportar_problema_melhoria", { _melhoria_id: melhoriaId });
      if (error) throw error;
      // 2) Best-effort: tenta avisar o grupo na hora. Se a função não estiver
      //    disponível, o cron (melhorias-monitor) garante a notificação — então
      //    ignoramos qualquer falha aqui de propósito.
      try {
        await supabase.functions.invoke("melhoria-problema", { body: { melhoria_id: melhoriaId } });
      } catch {
        /* noop — a notificação é garantida pelo melhorias-monitor */
      }
      return melhoriaId;
    },
    onSuccess: (melhoriaId) => {
      setReportadas((prev) => ({ ...prev, [melhoriaId]: true }));
      toast.success("Problema reportado. O time foi avisado e vai verificar o ajuste.");
    },
    onError: (err: any) => toast.error(err?.message ?? "Não foi possível reportar o problema"),
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="page-eyebrow">Interno · engenharia</p>
        <h1 className="page-title flex items-center gap-2">
          <Sparkles className="h-6 w-6" /> Melhorias internas
        </h1>
        <p className="page-subtitle">
          Canal do time técnico para pedir ajustes no CRM. Não aparece para o time comercial.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="surface-card space-y-4 p-6 lg:col-span-2">
          <div className="space-y-1.5">
            <Label htmlFor="titulo">O que você precisa? *</Label>
            <Input
              id="titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Adicionar um campo de 'origem da indicação' no cadastro de lead"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="descricao">Detalhes (quanto mais claro, melhor)</Label>
            <Textarea
              id="descricao"
              rows={6}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder={"Explique o objetivo, onde fica na tela, como deve funcionar, exemplos…"}
            />
          </div>
          <Button disabled={!titulo.trim() || enviar.isPending} onClick={() => enviar.mutate()}>
            <Sparkles className="mr-2 h-4 w-4" />
            {enviar.isPending ? "Enviando…" : "Enviar pedido"}
          </Button>

          {enviado && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              <CheckCircle2 className="h-4 w-4" />
              Pedido registrado! Acompanhe o status abaixo em <strong>Chamadas recentes</strong>.
            </div>
          )}
        </div>

        <aside className="surface-card space-y-3 p-6 text-sm text-muted-foreground">
          <h2 className="page-eyebrow text-foreground">Como funciona 🚀</h2>
          <ol className="list-decimal space-y-2 pl-4">
            <li>Você descreve a melhoria aqui.</li>
            <li>O <strong>Assistente IA (GPT)</strong> analisa o sistema e prepara a mudança.</li>
            <li>Um responsável <strong>revisa e aprova</strong>.</li>
            <li>A mudança vai pro ar automaticamente. 🚀</li>
          </ol>
          <p className="text-xs">
            Dica: peça uma coisa por vez e seja específico (tela, comportamento, exemplo). Pedidos
            grandes podem virar várias etapas.
          </p>
        </aside>
      </div>

      {/* Chamadas recentes */}
      <div className="surface-card divide-y divide-border/60">
        <div className="px-5 py-3 text-sm font-semibold">Chamadas recentes</div>
        {(melhorias ?? []).length === 0 && (
          <p className="px-5 py-6 text-center text-sm text-muted-foreground">Nenhuma chamada ainda.</p>
        )}
        {(melhorias ?? []).map((m: any) => {
          const st = STATUS_INFO[m.status] ?? { label: m.status, cls: "bg-muted text-muted-foreground" };
          const reportada = reportadas[m.id];
          const reportando = reportarProblema.isPending && reportarProblema.variables === m.id;
          return (
            <div key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <button type="button" onClick={() => setDetalhe(m)} className="min-w-0 flex-1 text-left hover:opacity-80" title="Ver detalhes">
                <div className="truncate text-sm font-medium">{m.titulo}</div>
                <div className="text-xs text-muted-foreground">
                  {fmtRelative(m.criado_em)}
                  {m.solicitante_email ? ` · ${m.solicitante_email}` : ""}
                </div>
              </button>
              <div className="flex flex-shrink-0 items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                  disabled={reportando || reportada}
                  title="Avisar o grupo que não foi possível confirmar que o ajuste foi realizado"
                  onClick={() => reportarProblema.mutate(m.id)}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {reportada ? "Reportado" : reportando ? "Reportando…" : "Reportar problema"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!detalhe} onOpenChange={(o) => !o && setDetalhe(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detalhe?.titulo}</DialogTitle>
          </DialogHeader>
          {detalhe && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${(STATUS_INFO[detalhe.status] ?? { cls: "bg-muted text-muted-foreground" }).cls}`}>
                  {(STATUS_INFO[detalhe.status] ?? { label: detalhe.status }).label}
                </span>
                <span className="text-xs text-muted-foreground">{fmtRelative(detalhe.criado_em)}</span>
              </div>
              <div>
                <div className="mb-0.5 text-xs font-semibold text-muted-foreground">Solicitante</div>
                <div>{detalhe.solicitante_email ?? "—"}</div>
              </div>
              <div>
                <div className="mb-0.5 text-xs font-semibold text-muted-foreground">O que foi solicitado</div>
                <p className="whitespace-pre-wrap">{detalhe.descricao || "—"}</p>
              </div>
              {detalhe.resumo_ajuste && (
                <div>
                  <div className="mb-0.5 text-xs font-semibold text-muted-foreground">O que foi feito</div>
                  <p className="whitespace-pre-wrap text-muted-foreground">{detalhe.resumo_ajuste}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
