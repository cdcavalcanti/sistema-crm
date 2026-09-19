import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, LayoutTemplate, Search, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { renderTemplate, type ParsedTemplate } from "@/lib/whatsappTemplates";

export type ChatTemplate = ParsedTemplate;

function mensagemErro(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "object" && e && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return fallback;
}

const UNSUPPORTED: Record<string, string> = {
  media_header: "Este template tem cabeçalho de mídia — ainda não dá para enviar pelo CRM.",
  header_variables: "Este template tem variáveis no cabeçalho — ainda não dá para enviar pelo CRM.",
  button_variables: "Este template tem botão com URL dinâmica — ainda não dá para enviar pelo CRM.",
  generic: "Este template não é suportado pelo envio do CRM.",
};

export function TemplatePicker({
  conversaId,
  disabled,
  onSent,
  rotulo,
  prefill,
}: {
  conversaId: string;
  disabled?: boolean;
  onSent?: () => void;
  /** Botão com texto (ex.: fila de remarketing). Sem isto, ícone no composer. */
  rotulo?: string;
  /** Prefill da campanha: seleciona o template e preenche variáveis. */
  prefill?: { name: string; language?: string; params?: Record<string, string> };
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ChatTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setValues(prefill?.params ?? {});
    setQ("");
  }, [open, prefill?.params]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["whatsapp-templates", conversaId, !!prefill],
    enabled: open,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    retryDelay: 800,
    queryFn: async () => {
      const { data: payload, error: err } = await supabase.functions.invoke<{
        templates?: ChatTemplate[];
        error?: string;
        message?: string;
      }>("whatsapp-templates", {
        body: {
          conversa_id: conversaId,
          // Campanha precisa ver todos os APPROVED, não só a allowlist do chat.
          ...(prefill ? { todos: true } : {}),
        },
      });
      if (err) throw new Error(err.message || "Falha ao carregar templates");
      if (payload?.error) {
        const map: Record<string, string> = {
          chatwoot_not_configured:
            "Templates oficiais indisponíveis. Peça ao administrador para configurar o WhatsApp Business.",
          inbox_not_found:
            "Canal oficial do WhatsApp não encontrado. Fale com o administrador.",
          templates_fetch_failed: "Não foi possível listar os templates agora. Tente de novo.",
        };
        throw new Error(map[payload.error] ?? payload.message ?? payload.error);
      }
      return payload?.templates ?? [];
    },
  });

  const templates = useMemo(() => data ?? [], [data]);

  // Prefill: assim que a lista chega, entra direto no preenchimento do template da campanha.
  useEffect(() => {
    if (!open || !prefill?.name || !templates.length || selected) return;
    const hit = templates.find(
      (t) =>
        t.name === prefill.name &&
        (!prefill.language ||
          t.language.toLowerCase() === prefill.language.toLowerCase()),
    ) ?? templates.find((t) => t.name === prefill.name);
    if (hit) {
      setSelected(hit);
      setValues(prefill.params ?? {});
    }
  }, [open, prefill, templates, selected]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return templates;
    return templates.filter(
      (tpl) =>
        tpl.name.toLowerCase().includes(term) ||
        tpl.body_text.toLowerCase().includes(term),
    );
  }, [templates, q]);

  const missing = useMemo(() => {
    if (!selected) return [];
    return selected.variables.filter((v) => !values[v]?.trim());
  }, [selected, values]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Escolha um template primeiro");
      const { data: payload, error: err } = await supabase.functions.invoke<{
        ok?: boolean;
        error?: string;
        reason?: string;
        variable?: string;
        message?: string;
      }>("whatsapp-send-template", {
        body: {
          conversa_id: conversaId,
          template: {
            name: selected.name,
            language: selected.language,
            params: values,
          },
        },
      });
      if (err) throw new Error(err.message || "Falha ao enviar template");
      if (payload?.error) {
        const map: Record<string, string> = {
          chatwoot_not_configured:
            "Templates oficiais indisponíveis. Peça ao administrador para configurar o WhatsApp Business.",
          inbox_not_found: "Canal oficial do WhatsApp não encontrado.",
          template_not_found: "Template não encontrado ou não aprovado.",
          template_unsupported: UNSUPPORTED[payload.reason ?? ""] ?? UNSUPPORTED.generic,
          template_missing_params: `Preencha a variável ${payload.variable ?? ""}.`,
          conversa_sem_telefone: "Conversa sem telefone — não dá para enviar template oficial.",
          grupo_nao_suportado: "Templates oficiais só funcionam em conversas 1:1.",
          send_failed: payload.message ?? "O WhatsApp oficial recusou o envio do template.",
        };
        throw new Error(map[payload.error] ?? payload.message ?? payload.error);
      }
      if (!payload?.ok) throw new Error("Falha ao enviar template");
      return payload;
    },
    onSuccess: () => {
      toast.success("Template enviado");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["mensagens", conversaId] });
      qc.invalidateQueries({ queryKey: ["conversas"] });
      onSent?.();
    },
    onError: (err: unknown) => toast.error(mensagemErro(err, "Erro ao enviar template")),
  });

  return (
    <>
      {rotulo ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          <LayoutTemplate className="h-3.5 w-3.5" />
          {rotulo}
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-[42px] w-[42px] flex-shrink-0"
          disabled={disabled}
          onClick={() => setOpen(true)}
          aria-label="Enviar template WhatsApp"
          title="Enviar template aprovado (Meta)"
        >
          <LayoutTemplate className="h-4 w-4" />
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {selected ? selected.name : "Templates WhatsApp"}
            </DialogTitle>
          </DialogHeader>

          {!selected && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Buscar por nome ou texto…"
                  className="pl-9"
                />
              </div>

              <div className="max-h-[380px] space-y-2 overflow-y-auto">
                {isLoading && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Carregando templates…
                  </p>
                )}
                {error && (
                  <p className="py-8 text-center text-sm text-destructive">
                    {(error as Error).message}
                  </p>
                )}
                {!isLoading && !error && filtered.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum template aprovado neste inbox. Confira a inbox Cloud API da Meta
                    e os secrets em Recursos → Dev.
                  </p>
                )}
                {filtered.map((tpl) => (
                  <button
                    key={`${tpl.name}-${tpl.language}`}
                    type="button"
                    onClick={() => {
                      setSelected(tpl);
                      setValues({});
                    }}
                    className="w-full rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-secondary/40"
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{tpl.name}</span>
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {tpl.language}
                      </Badge>
                      {tpl.category && (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {tpl.category}
                        </Badge>
                      )}
                      {tpl.variables.length > 0 && (
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {tpl.variables.length} var.
                        </Badge>
                      )}
                    </div>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{tpl.body_text}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selected && (
            <div className="space-y-4">
              {!selected.supported && (
                <div className="flex items-start gap-2 rounded-md border border-[hsl(36_90%_45%_/_0.4)] bg-[hsl(36_90%_45%_/_0.08)] p-3 text-xs">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[hsl(36_90%_45%)]" />
                  <span>
                    {UNSUPPORTED[selected.unsupported_reason ?? "generic"] ?? UNSUPPORTED.generic}
                  </span>
                </div>
              )}

              {selected.variables.length > 0 && selected.supported && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">Variáveis</p>
                  {selected.variables.map((v) => (
                    <div key={v} className="space-y-1.5">
                      <Label>{selected.named ? v : `Variável {{${v}}}`}</Label>
                      <Input
                        value={values[v] ?? ""}
                        onChange={(e) => setValues({ ...values, [v]: e.target.value })}
                        placeholder="Valor que o cliente vai ver"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Prévia</p>
                <div className="rounded-lg border border-primary/20 bg-primary px-3 py-2 text-sm text-primary-foreground">
                  <p className="whitespace-pre-wrap break-words">
                    {renderTemplate(selected, values)}
                  </p>
                </div>
                {selected.buttons.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selected.buttons.map((b, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] font-normal">
                        {b}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            {selected ? (
              <>
                <Button variant="ghost" onClick={() => setSelected(null)} className="gap-1.5">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Voltar
                </Button>
                <Button
                  onClick={() => sendMutation.mutate()}
                  disabled={
                    !selected.supported || missing.length > 0 || sendMutation.isPending
                  }
                  className="gap-2"
                >
                  <Send className="h-4 w-4" />
                  {sendMutation.isPending ? "Enviando…" : "Enviar template"}
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
