import { useState } from "react";
import { FileText, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { AbaTemplates } from "@/components/meta/AbaTemplates";
import { AbaDisparos } from "@/components/meta/AbaDisparos";

const ABAS = [
  { id: "templates" as const, label: "Templates", icone: FileText },
  { id: "disparos" as const, label: "Disparos", icone: Send },
];

/**
 * WhatsApp Business (Meta): templates aprovados + campanhas de disparo em massa.
 * Envio via API oficial WhatsApp (Meta), não pelo chat cotidiano.
 */
export default function Meta() {
  const [aba, setAba] = useState<(typeof ABAS)[number]["id"]>("disparos");

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          WhatsApp oficial
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Meta / Disparos</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Templates aprovados pela Meta e campanhas em massa (planilha → envio espaçado
          pela API oficial do WhatsApp).
        </p>
      </header>

      <div role="tablist" className="flex flex-wrap items-center gap-1 border-b border-border">
        {ABAS.map(({ id, label, icone: Icone }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={aba === id}
            onClick={() => setAba(id)}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors",
              aba === id
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icone className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {aba === "templates" ? <AbaTemplates /> : <AbaDisparos />}
    </div>
  );
}
