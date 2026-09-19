import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ParsedTemplate } from "@/lib/whatsappTemplates";

/**
 * Lista templates APPROVED do inbox WhatsApp Cloud (Chatwoot).
 * Criação/aprovação continua no Meta Business Manager nesta v1.
 */
export function AbaTemplates() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["meta-templates"],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data: payload, error: err } = await supabase.functions.invoke<{
        inbox_id?: number | null;
        templates?: ParsedTemplate[];
        error?: string;
        message?: string;
      }>("whatsapp-templates", { body: { todos: true } });
      if (err) throw new Error(err.message || "Falha ao carregar templates");
      if (payload?.error) throw new Error(payload.message ?? payload.error);
      return {
        inboxId: payload?.inbox_id ?? null,
        templates: payload?.templates ?? [],
      };
    },
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando templates…</p>;
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="space-y-2">
          <p>{error instanceof Error ? error.message : "Erro ao listar templates"}</p>
          <p className="text-xs text-muted-foreground">
            Templates oficiais indisponíveis no momento. Peça ao administrador para conferir a
            conexão do WhatsApp Business (Meta).
          </p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Tentar de novo
          </Button>
        </div>
      </div>
    );
  }

  const templates = data?.templates ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Inbox Cloud{data?.inboxId != null ? ` #${data.inboxId}` : ""} · {templates.length}{" "}
          aprovado{templates.length === 1 ? "" : "s"}. Novos templates: Meta Business Manager →
          WhatsApp → Message templates.
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={isFetching}
          onClick={() => refetch()}
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {templates.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum template APPROVED neste inbox.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {templates.map((t) => (
            <li key={`${t.name}:${t.language}`} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{t.name}</span>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {t.language}
                </Badge>
                {t.category && (
                  <Badge variant="secondary" className="text-[10px]">
                    {t.category}
                  </Badge>
                )}
                {!t.supported && (
                  <Badge variant="destructive" className="text-[10px]">
                    não suportado no CRM
                    {t.unsupported_reason ? ` (${t.unsupported_reason})` : ""}
                  </Badge>
                )}
                {t.variables.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {t.variables.map((v) => `{{${v}}}`).join(" ")}
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{t.body_text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
