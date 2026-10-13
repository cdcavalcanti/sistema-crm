import { useState } from "react";
import { Link } from "react-router-dom";
import { Bot, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { perguntarAoCrm, hrefCitacao, type Citacao } from "@/lib/crm-ia";

const ATALHOS_FUNIL = [
  "O que esfriou há mais de 7 dias?",
  "Quais negócios do Comercial não tiveram atividade desde 01/09/2026?",
  "Qual a soma em aberto por etapa, neste pipeline?",
];

const ATALHOS_FICHA = [
  "Qual foi a última mensagem ou nota deste contato?",
  "O que está parado há mais de 7 dias nesta etapa?",
];

function renderResposta(texto: string) {
  const parts = texto.split(/(\[\[[a-z]+:[0-9a-f-]+\]\])/gi);
  return parts.map((p, i) => {
    const m = p.match(/^\[\[([a-z]+):([0-9a-f-]+)\]\]$/i);
    if (!m) {
      return (
        <span key={i} className="whitespace-pre-wrap">
          {p}
        </span>
      );
    }
    const href = hrefCitacao({ tipo: m[1] as Citacao["tipo"], id: m[2], label: m[2] });
    if (!href) return <span key={i} className="font-mono text-xs text-muted-foreground">{p}</span>;
    return (
      <Link key={i} to={href} className="font-medium text-primary hover:underline">
        registro
      </Link>
    );
  });
}

export function PergunteAoCrm({
  oportunidadeId,
}: {
  oportunidadeId?: string;
}) {
  const [pergunta, setPergunta] = useState("");
  const [loading, setLoading] = useState(false);
  const [resposta, setResposta] = useState<string | null>(null);
  const [citacoes, setCitacoes] = useState<Citacao[]>([]);
  const [meta, setMeta] = useState<{ provider: string; modelo: string } | null>(null);
  const atalhos = oportunidadeId ? ATALHOS_FICHA : ATALHOS_FUNIL;

  const enviar = async (texto?: string) => {
    const q = (texto ?? pergunta).trim();
    if (!q || loading) return;
    setLoading(true);
    setResposta(null);
    setCitacoes([]);
    try {
      const r = await perguntarAoCrm(q, oportunidadeId);
      setResposta(r.resposta);
      setCitacoes(r.citacoes ?? []);
      setMeta({ provider: r.provider, modelo: r.modelo });
      if (!texto) setPergunta("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Não foi possível perguntar ao CRM");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="surface-card space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-primary" />
        <h2 className="page-eyebrow !mt-0">Pergunte ao CRM</h2>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">só leitura</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Responde só com registros que você pode ver neste tenant. Não cria, não move e não apaga.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {atalhos.map((a) => (
          <button
            key={a}
            type="button"
            className="rounded-sm border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
            onClick={() => {
              setPergunta(a);
              void enviar(a);
            }}
          >
            {a}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Textarea
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          rows={2}
          placeholder="Pergunte em português…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
        />
        <Button type="button" size="icon" disabled={loading || !pergunta.trim()} onClick={() => void enviar()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      {resposta && (
        <div className="space-y-2 rounded-lg border border-border/80 bg-muted/30 p-3 text-sm">
          <div>{renderResposta(resposta)}</div>
          {citacoes.length > 0 && (
            <ul className="flex flex-wrap gap-1.5 pt-1">
              {citacoes.slice(0, 12).map((c, i) => {
                const href = hrefCitacao(c);
                const label = `${c.tipo}${c.campo ? ` · ${c.campo}` : ""}`;
                return (
                  <li key={`${c.id}-${i}`}>
                    {href ? (
                      <Link to={href} className="rounded-md bg-background px-2 py-0.5 text-[11px] text-primary hover:underline">
                        {c.label} · {label}
                      </Link>
                    ) : (
                      <span className="rounded-md bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                        {c.label} · {label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {meta && (
            <p className="text-[10px] text-muted-foreground">
              Provider {meta.provider} · modelo {meta.modelo} · tenant sistema-crm
            </p>
          )}
        </div>
      )}
    </div>
  );
}
