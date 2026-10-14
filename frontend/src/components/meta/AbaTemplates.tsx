import { AlertTriangle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CatalogTemplate, TemplateStatus } from "@/lib/meta-templates-store";
import { cn } from "@/lib/utils";

const COR: Record<TemplateStatus, string> = {
  APPROVED: "border-emerald-500/40 text-emerald-700 dark:text-emerald-400",
  PENDING: "border-amber-500/40 text-amber-700 dark:text-amber-300",
  REJECTED: "border-destructive/40 text-destructive",
};

const LABEL: Record<TemplateStatus, string> = {
  APPROVED: "Aprovado",
  PENDING: "Pendente",
  REJECTED: "Rejeitado",
};

export function AbaTemplates({
  templates,
  inboxId,
  isLoading,
  error,
  filtro,
  onFiltro,
  onRefresh,
  isFetching,
}: {
  templates: CatalogTemplate[];
  inboxId: number | null;
  isLoading: boolean;
  error: Error | null;
  filtro: "TODOS" | TemplateStatus;
  onFiltro: (f: "TODOS" | TemplateStatus) => void;
  onRefresh: () => void;
  isFetching: boolean;
}) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando templates…</p>;
  }

  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-sm border border-destructive/30 bg-destructive/5 p-4 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="space-y-2">
          <p>{error.message}</p>
          <p className="text-xs text-muted-foreground">
            Confira a conexão do WhatsApp Business (Meta) com o administrador.
          </p>
          <Button size="sm" variant="outline" onClick={onRefresh}>
            Tentar de novo
          </Button>
        </div>
      </div>
    );
  }

  const visiveis = filtro === "TODOS" ? templates : templates.filter((t) => t.status === filtro);
  const chips: Array<"TODOS" | TemplateStatus> = ["TODOS", "APPROVED", "PENDING", "REJECTED"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {inboxId != null ? `Conta Cloud #${inboxId} · ` : ""}
          {templates.length} modelo{templates.length === 1 ? "" : "s"}
        </p>
        <Button size="sm" variant="outline" disabled={isFetching} onClick={onRefresh}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Sincronizar
        </Button>
      </div>

      <div className="flex flex-wrap gap-1">
        {chips.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onFiltro(id)}
            className={cn(
              "rounded-sm border px-2.5 py-1 text-xs",
              filtro === id
                ? "border-primary bg-primary/10 font-medium text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {id === "TODOS" ? "Todos" : LABEL[id]}
          </button>
        ))}
      </div>

      {visiveis.length === 0 ? (
        <p className="rounded-sm border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum template neste filtro. Crie um novo ou sincronize com a Meta.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-sm border border-border">
          {visiveis.map((t) => (
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
                <Badge variant="outline" className={cn("text-[10px]", COR[t.status])}>
                  {LABEL[t.status]}
                </Badge>
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
              {t.header_text && (
                <p className="text-xs font-medium text-foreground/80">{t.header_text}</p>
              )}
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{t.body_text}</p>
              {t.footer_text && (
                <p className="text-[11px] text-muted-foreground/80">{t.footer_text}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
