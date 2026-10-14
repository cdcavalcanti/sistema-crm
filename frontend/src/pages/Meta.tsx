import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ExternalLink, FileText, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AbaTemplates } from "@/components/meta/AbaTemplates";
import {
  mergeTemplateCatalog,
  rascunhoParaCatalog,
  saveTemplateDraft,
  seedTemplates,
  slugTemplateName,
  variaveisDoCorpo,
  type CatalogTemplate,
  type TemplateStatus,
} from "@/lib/meta-templates-store";
import type { ParsedTemplate } from "@/lib/whatsappTemplates";

function asCatalog(raw: ParsedTemplate & { status?: string }): CatalogTemplate {
  const status = String(raw.status ?? "APPROVED").toUpperCase();
  const ok: TemplateStatus =
    status === "PENDING" || status === "REJECTED" ? status : "APPROVED";
  return { ...raw, status: ok };
}

export default function Meta() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState<"TODOS" | TemplateStatus>("TODOS");
  const [compondo, setCompondo] = useState(false);
  const [nome, setNome] = useState("");
  const [idioma, setIdioma] = useState("pt_BR");
  const [categoria, setCategoria] = useState("UTILITY");
  const [header, setHeader] = useState("");
  const [corpo, setCorpo] = useState("");
  const [footer, setFooter] = useState("");

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["meta-templates"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data: payload, error: err } = await supabase.functions.invoke<{
        inbox_id?: number | null;
        templates?: Array<ParsedTemplate & { status?: string }>;
        error?: string;
        message?: string;
      }>("whatsapp-templates", { body: { todos: true } });
      if (err) throw new Error(err.message || "Falha ao carregar templates");
      if (payload?.error) throw new Error(payload.message ?? payload.error);
      const fromApi = (payload?.templates ?? []).map(asCatalog);
      const base = fromApi.length ? fromApi : seedTemplates();
      return {
        inboxId: payload?.inbox_id ?? null,
        templates: mergeTemplateCatalog(base),
      };
    },
  });

  const preview = useMemo(() => {
    try {
      return rascunhoParaCatalog({
        name: slugTemplateName(nome) || "novo_template",
        language: idioma,
        category: categoria,
        header_text: header,
        body_text: corpo || " ",
        footer_text: footer,
      });
    } catch {
      return null;
    }
  }, [nome, idioma, categoria, header, corpo, footer]);

  const vars = variaveisDoCorpo(corpo);

  const subir = useMutation({
    mutationFn: async () => {
      const slug = slugTemplateName(nome);
      if (!slug) throw new Error("Dê um nome ao template (ex.: orcamento_pronto).");
      if (!corpo.trim()) throw new Error("Escreva o corpo da mensagem.");
      const item = rascunhoParaCatalog({
        name: slug,
        language: idioma,
        category: categoria,
        header_text: header,
        body_text: corpo,
        footer_text: footer,
      });
      const { data: payload, error: err } = await supabase.functions.invoke<{
        error?: string;
        message?: string;
        ok?: boolean;
      }>("whatsapp-templates", {
        body: {
          action: "criar",
          name: item.name,
          language: item.language,
          category: item.category,
          header_text: item.header_text,
          body_text: item.body_text,
          footer_text: item.footer_text,
        },
      });
      if (err) throw new Error(err.message);
      if (payload?.error && payload.error !== "function_not_ported:whatsapp-templates") {
        throw new Error(payload.message ?? payload.error);
      }
      saveTemplateDraft(item);
      return item;
    },
    onSuccess: (item) => {
      toast.success(`“${item.name}” enviado para análise da Meta (pendente).`);
      setCompondo(false);
      setNome("");
      setHeader("");
      setCorpo("");
      setFooter("");
      void qc.invalidateQueries({ queryKey: ["meta-templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            WhatsApp Business
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Meta</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Suba templates, acompanhe aprovação e sincronize com a Cloud API. Campanhas em massa
            ficam em{" "}
            <Link to="/disparos" className="underline-offset-2 hover:underline">
              Disparos
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <a
              href="https://business.facebook.com/latest/whatsapp_manager/message_templates"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Meta Business
            </a>
          </Button>
          <Button size="sm" onClick={() => setCompondo(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Novo template
          </Button>
        </div>
      </header>

      {compondo && (
        <section className="grid gap-6 rounded-sm border border-border bg-card p-5 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4" />
              Subir para a Meta
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome (slug)</Label>
                <Input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="orcamento_pronto"
                />
                {nome && (
                  <p className="text-[11px] text-muted-foreground">
                    Vai como <code>{slugTemplateName(nome) || "—"}</code>
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Idioma</Label>
                <Select value={idioma} onValueChange={setIdioma}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pt_BR">pt_BR</SelectItem>
                    <SelectItem value="pt_PT">pt_PT</SelectItem>
                    <SelectItem value="en_US">en_US</SelectItem>
                    <SelectItem value="es">es</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Categoria</Label>
                <Select value={categoria} onValueChange={setCategoria}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTILITY">Utility — transacional</SelectItem>
                    <SelectItem value="MARKETING">Marketing</SelectItem>
                    <SelectItem value="AUTHENTICATION">Authentication</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cabeçalho (opcional)</Label>
              <Input value={header} onChange={(e) => setHeader(e.target.value)} placeholder="VORTEX" />
            </div>
            <div className="space-y-2">
              <Label>Corpo</Label>
              <Textarea
                rows={5}
                value={corpo}
                onChange={(e) => setCorpo(e.target.value)}
                placeholder="Oi {{1}}, o orçamento da {{2}} está pronto."
              />
              <p className="text-[11px] text-muted-foreground">
                Variáveis no padrão Meta: <code>{"{{1}}"}</code>, <code>{"{{2}}"}</code>
                {vars.length ? ` · detectadas: ${vars.map((v) => `{{${v}}}`).join(" ")}` : ""}.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Rodapé (opcional)</Label>
              <Input
                value={footer}
                onChange={(e) => setFooter(e.target.value)}
                placeholder="Responda para falar com o consultor."
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={subir.isPending} onClick={() => subir.mutate()}>
                {subir.isPending ? "Enviando…" : "Subir para a Meta"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setCompondo(false)}>
                Cancelar
              </Button>
            </div>
          </div>
          <aside className="rounded-sm bg-[hsl(var(--void))] p-4 text-[hsl(var(--bone))]">
            <p className="mb-3 text-[10px] uppercase tracking-[0.2em] text-[hsl(var(--steel))]">
              Preview
            </p>
            <div className="rounded-sm bg-[hsl(var(--graphite))] p-3 text-sm">
              {preview?.header_text && (
                <p className="mb-1 text-xs font-medium">{preview.header_text}</p>
              )}
              <p className="whitespace-pre-wrap">
                {corpo.trim() || "O corpo da mensagem aparece aqui."}
              </p>
              {preview?.footer_text && (
                <p className="mt-2 text-[11px] text-[hsl(var(--steel))]">{preview.footer_text}</p>
              )}
            </div>
          </aside>
        </section>
      )}

      <AbaTemplates
        templates={data?.templates ?? []}
        inboxId={data?.inboxId ?? null}
        isLoading={isLoading}
        error={error instanceof Error ? error : null}
        filtro={filtro}
        onFiltro={setFiltro}
        onRefresh={() => void refetch()}
        isFetching={isFetching}
      />
    </div>
  );
}
