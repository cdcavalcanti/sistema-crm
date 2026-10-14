import { useState } from "react";
import { Link } from "react-router-dom";
import { Bot, History, Pause, Play, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSdrLead } from "@/hooks/useSdrLead";
import { qualificacaoDe, statusSdrUi, type StatusSdrUi } from "@/lib/sdr";
import { fmtDateTime } from "@/lib/format";

const STATUS_LABEL: Record<StatusSdrUi, string> = {
  ativa: "Ativa",
  pausada: "Pausada",
  transferida: "Transferida",
  descartada: "Descartada",
  ausente: "Sem registro SDR",
};

const STATUS_VARIANT: Record<StatusSdrUi, "default" | "secondary" | "destructive" | "outline"> = {
  ativa: "default",
  pausada: "secondary",
  transferida: "outline",
  descartada: "destructive",
  ausente: "outline",
};

function Campo({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

type Props = {
  telefone: string | null | undefined;
  compact?: boolean;
  contatoId?: string | null;
  oportunidadeId?: string | null;
};

export function SdrQualificacaoCard({ telefone, compact, contatoId, oportunidadeId }: Props) {
  const { lead, isLoading, pausada, historico, historicoLoading, refetchHistorico, pausar, retomar } =
    useSdrLead(telefone);
  const [histOpen, setHistOpen] = useState(false);
  const status = statusSdrUi({ lead, pausada });
  const q = qualificacaoDe(lead);

  const toggle = async () => {
    try {
      if (pausada) {
        await retomar.mutateAsync();
        toast.success("SDR retomado");
      } else {
        await pausar.mutateAsync();
        toast.success("SDR pausado");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao alterar pause");
    }
  };

  if (!telefone) return null;
  if (isLoading) return <Skeleton className="h-28 w-full" />;

  // Sem lead ainda: mostra só o botão de pausa (humano pode calar a IA preventivamente).
  if (!lead) {
    return (
      <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <Bot className="h-4 w-4 text-muted-foreground" />
              SDR (WhatsApp)
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Nenhum lead do SDR para este telefone. Você ainda pode pausar a IA.
            </p>
          </div>
          <Badge variant={pausada ? "secondary" : "outline"}>{pausada ? "Pausada" : "Sem registro"}</Badge>
        </div>
        <div className="mt-3">
          <Button
            type="button"
            size="sm"
            variant={pausada ? "default" : "outline"}
            disabled={pausar.isPending || retomar.isPending}
            onClick={toggle}
          >
            {pausada ? (
              <><Play className="mr-1.5 h-3.5 w-3.5" /> Retomar IA</>
            ) : (
              <><Pause className="mr-1.5 h-3.5 w-3.5" /> Pausar IA</>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/80 bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Bot className="h-4 w-4 text-primary" />
            SDR (WhatsApp)
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Histórico da IA ≠ inbox do CRM. Este bloco lê <code className="text-[10px]">dados_conversa</code>.
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Campo label="Nome (SDR)" value={lead.nome ?? q.nome} />
        <Campo label="Etapa IA" value={String(lead.etapa)} />
        {!compact && (
          <>
            <Campo label="Segmento" value={q.segmento} />
            <Campo label="Faturamento" value={q.faturamento_mensal} />
            <Campo label="Dor principal" value={q.dor_principal} />
            <Campo label="Dep. marketplace" value={q.dependencia_dono} />
            <Campo label="Equipe" value={q.tamanho_equipe} />
            <Campo label="Tempo de negócio" value={q.tempo_negocio} />
            <Campo label="Oferta sugerida" value={q.oferta_sugerida} />
            <Campo label="Motivo handoff" value={q.motivo_handoff} />
          </>
        )}
      </div>

      {(q.resumo_handoff || lead.etapa === "transferido") && (
        <div className="rounded-md bg-muted/40 p-2 text-sm">
          <div className="text-[11px] uppercase text-muted-foreground">Resumo handoff</div>
          <p className="mt-1 whitespace-pre-wrap">{q.resumo_handoff || "—"}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {status !== "transferida" && status !== "descartada" && (
          <Button
            type="button"
            size="sm"
            variant={pausada ? "default" : "outline"}
            disabled={pausar.isPending || retomar.isPending}
            onClick={toggle}
          >
            {pausada ? (
              <><Play className="mr-1.5 h-3.5 w-3.5" /> Retomar IA</>
            ) : (
              <><Pause className="mr-1.5 h-3.5 w-3.5" /> Pausar IA</>
            )}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setHistOpen(true);
            void refetchHistorico();
          }}
        >
          <History className="mr-1.5 h-3.5 w-3.5" /> Histórico SDR
        </Button>
        {contatoId && (
          <Button type="button" size="sm" variant="ghost" asChild>
            <Link to={`/contatos/${contatoId}`}>
              Contato <ExternalLink className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        )}
        {oportunidadeId && (
          <Button type="button" size="sm" variant="ghost" asChild>
            <Link to={`/oportunidades/${oportunidadeId}`}>
              Oportunidade <ExternalLink className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        )}
      </div>

      <Dialog open={histOpen} onOpenChange={setHistOpen}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Histórico SDR</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Mensagens da tabela <code>historico_mensagens</code> — não são as bolhas do /chat.
          </p>
          <div className="mt-2 flex-1 space-y-2 overflow-y-auto pr-1">
            {historicoLoading && <Skeleton className="h-20 w-full" />}
            {!historicoLoading && historico.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem mensagens gravadas.</p>
            )}
            {historico.map((m) => (
              <div key={m.id} className="rounded-md border border-border/60 px-2.5 py-2 text-sm">
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span className="font-medium uppercase">{m.role}</span>
                  <span>{fmtDateTime(m.created_at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap">{m.content}</p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
