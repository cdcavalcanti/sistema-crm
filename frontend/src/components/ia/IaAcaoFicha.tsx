import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmarProposta, recusarProposta, sugerirAcao, type IaProposta } from "@/lib/crm-ia";
import { fmtDateTime } from "@/lib/format";

export function IaAcaoFicha({ oportunidadeId }: { oportunidadeId: string }) {
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [proposta, setProposta] = useState<IaProposta | null>(null);
  const [confirmacao, setConfirmacao] = useState("");
  const [gravando, setGravando] = useState(false);

  const sugerir = async () => {
    setLoading(true);
    try {
      const p = await sugerirAcao(oportunidadeId);
      setProposta(p);
      setConfirmacao("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Não foi possível sugerir");
    } finally {
      setLoading(false);
    }
  };

  const confirmar = async () => {
    if (!proposta) return;
    setGravando(true);
    try {
      const r = await confirmarProposta(proposta.id, { confirmacaoExplicita: confirmacao });
      if (!r.ok) {
        toast.error(r.error === "confirmacao_explicita"
          ? "Digite CONFIRMAR para apagar ou disparo em massa."
          : r.error === "disparo_massa_fora_deste_corte"
            ? "Neste corte a IA não dispara mensagem. Nada foi enviado."
            : r.error ?? "Não gravou");
        return;
      }
      toast.success("Gravado neste negócio");
      setProposta(null);
      qc.invalidateQueries({ queryKey: ["oportunidade", oportunidadeId] });
      qc.invalidateQueries({ queryKey: ["comentarios", oportunidadeId] });
      qc.invalidateQueries({ queryKey: ["tarefas"] });
      qc.invalidateQueries({ queryKey: ["oportunidades"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao confirmar");
    } finally {
      setGravando(false);
    }
  };

  const recusar = async () => {
    if (!proposta) return;
    await recusarProposta(proposta.id);
    setProposta(null);
    toast.message("Sugestão recusada — nada foi gravado");
  };

  const perigo = proposta?.perigo === "apagar" || proposta?.perigo === "disparo_massa";

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="page-eyebrow !mt-0">Ação na ficha</h2>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void sugerir()}>
          {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Bot className="mr-2 h-3.5 w-3.5" />}
          Sugerir com IA
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Nada é gravado até você confirmar. Persona e o que ela pode prometer vêm da config do tenant.
      </p>
      {proposta && (
        <div className="space-y-3 text-sm">
          {proposta.payload.o_que_pode_prometer && (
            <p className="rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
              {proposta.payload.o_que_pode_prometer}
            </p>
          )}
          {(proposta.payload.campos ?? []).map((c) => (
            <div key={c.campo}>
              <span className="font-medium">{c.campo}</span>
              : atual {String(c.atual ?? "não está no CRM")} → sugerido{" "}
              {c.sugerido == null ? "preencher (sem palpite)" : String(c.sugerido)}
              <div className="text-xs text-muted-foreground">{c.motivo}</div>
            </div>
          ))}
          {proposta.payload.etapa && (
            <div>
              <span className="font-medium">Etapa sugerida:</span> {proposta.payload.etapa.nome}
              <div className="text-xs text-muted-foreground">{proposta.payload.etapa.motivo}</div>
            </div>
          )}
          {proposta.payload.tarefa && (
            <div>
              <span className="font-medium">Tarefa:</span> {proposta.payload.tarefa.titulo} · prazo{" "}
              {fmtDateTime(proposta.payload.tarefa.due_date)}
              <div className="text-xs text-muted-foreground">{proposta.payload.tarefa.motivo}</div>
            </div>
          )}
          {proposta.payload.handoff_humano && (
            <div>
              <span className="font-medium">Humano:</span>{" "}
              {proposta.payload.handoff_humano.sim ? "sim" : "não necessariamente"}
              <div className="text-xs text-muted-foreground">{proposta.payload.handoff_humano.motivo}</div>
            </div>
          )}
          {perigo && (
            <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-xs font-medium text-destructive">
                {proposta.perigo === "apagar" ? "Apagar negócio" : "Disparo em massa"} — confirmação explícita.
              </p>
              <ul className="max-h-32 overflow-auto text-xs">
                {(proposta.afetados ?? []).map((a) => (
                  <li key={a.id}>{a.tipo}: {a.label}</li>
                ))}
              </ul>
              <Input
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                placeholder='Digite CONFIRMAR'
              />
            </div>
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={gravando} onClick={() => void confirmar()}>
              Confirmar e gravar neste negócio
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => void recusar()}>
              Recusar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
