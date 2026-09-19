import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { renderTemplate, type ParsedTemplate } from "@/lib/whatsappTemplates";

export type CampanhaRemarketing = {
  ativo: boolean;
  template_nome: string | null;
  template_idioma: string | null;
  template_params: Record<string, string>;
};

export function useCampanhaRemarketing() {
  return useQuery({
    queryKey: ["remarketing-campanha"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("remarketing_campanha")
        .select("ativo, template_nome, template_idioma, template_params")
        .eq("id", true)
        .maybeSingle();
      if (error?.code === "42P01" || error?.code === "PGRST205") return null;
      if (error) throw error;
      return (data as CampanhaRemarketing | null) ?? null;
    },
  });
}

/**
 * Modelo aprovado da campanha de recuperação.
 * Fora das 24h só template Meta funciona — sem modelo aqui a fila IA não tem o que mandar.
 */
export function CampanhaConfig({ conversaExemplo }: { conversaExemplo?: string }) {
  const qc = useQueryClient();
  const { data: campanha } = useCampanhaRemarketing();

  const [ativo, setAtivo] = useState(false);
  const [nome, setNome] = useState("");
  const [params, setParams] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!campanha) return;
    setAtivo(campanha.ativo);
    setNome(campanha.template_nome ?? "");
    setParams((campanha.template_params as Record<string, string>) ?? {});
  }, [campanha]);

  const { data: conversaQualquer } = useQuery({
    queryKey: ["remarketing-conversa-exemplo"],
    enabled: !conversaExemplo,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("conversas")
        .select("id")
        .eq("canal", "whatsapp")
        .eq("eh_grupo", false)
        .limit(1)
        .maybeSingle();
      return ((data as { id?: string } | null)?.id as string | undefined) ?? null;
    },
  });
  const conversaParaTemplates = conversaExemplo ?? conversaQualquer ?? undefined;

  const { data: templates = [], isLoading, error } = useQuery({
    queryKey: ["whatsapp-templates-todos", conversaParaTemplates],
    enabled: true,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      const { data: payload, error: err } = await supabase.functions.invoke<{
        templates?: ParsedTemplate[];
        error?: string;
        message?: string;
      }>("whatsapp-templates", {
        body: {
          todos: true,
          ...(conversaParaTemplates ? { conversa_id: conversaParaTemplates } : {}),
        },
      });
      if (err) throw new Error(err.message || "Falha ao carregar templates");
      if (payload?.error) {
        throw new Error(payload.message ?? payload.error);
      }
      return payload?.templates ?? [];
    },
  });

  const selecionado = templates.find((tpl) => tpl.name === nome) ?? null;

  const salvar = async () => {
    if (ativo && !nome) {
      toast.error("Escolha um template antes de ativar a campanha");
      return;
    }
    setSalvando(true);
    const { data: sessao } = await supabase.auth.getUser();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: erro } = await (supabase as any)
      .from("remarketing_campanha")
      .update({
        ativo,
        template_nome: nome || null,
        template_idioma: selecionado?.language ?? campanha?.template_idioma ?? null,
        template_params: params,
        atualizado_por: sessao.user?.id ?? null,
      })
      .eq("id", true);
    setSalvando(false);
    if (erro) {
      toast.error(erro.message || "Erro ao salvar campanha");
      return;
    }
    toast.success("Campanha salva");
    qc.invalidateQueries({ queryKey: ["remarketing-campanha"] });
  };

  return (
    <div className="surface-card space-y-5 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2">
          <MessageSquareText className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Campanha
            </p>
            <h2 className="mt-0.5 font-display text-lg font-semibold">
              Mensagem de recuperação
            </h2>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={ativo} onCheckedChange={setAtivo} />
          {ativo ? (
            <Badge variant="outline" className="border-primary/40 bg-primary/5 text-[10px] text-primary">
              Ligada
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-secondary text-[10px] text-muted-foreground">
              Desligada
            </Badge>
          )}
        </label>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-[hsl(36_90%_45%_/_0.4)] bg-[hsl(36_90%_45%_/_0.08)] p-3 text-xs text-foreground">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[hsl(36_90%_45%)]" />
        <span>
          Lead de remarketing está fora da janela de 24h — a Meta só aceita template
          aprovado. A mensagem não sai sozinha: alguém aprova na fila.
        </span>
      </div>

      <div className="space-y-1.5">
        <Label>Template WhatsApp</Label>
        {error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : (
          <Select
            value={nome}
            onValueChange={(v) => {
              setNome(v);
              setParams({});
            }}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={isLoading ? "Carregando…" : "Escolha um template aprovado"}
              />
            </SelectTrigger>
            <SelectContent>
              {templates.map((tpl) => (
                <SelectItem key={`${tpl.name}-${tpl.language}`} value={tpl.name}>
                  {tpl.name} · {tpl.language}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {!isLoading && !error && templates.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhum template aprovado. Peça ao administrador para liberar os modelos oficiais do WhatsApp.
          </p>
        )}
      </div>

      {selecionado && !selecionado.supported && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-destructive" />
          <span>Este template não é suportado pelo envio do CRM (mídia/variáveis no cabeçalho).</span>
        </div>
      )}

      {selecionado && selecionado.variables.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground">Variáveis fixas da campanha</p>
          {selecionado.variables.map((v) => (
            <div key={v} className="space-y-1.5">
              <Label>{selecionado.named ? v : `Variável {{${v}}}`}</Label>
              <Input
                value={params[v] ?? ""}
                onChange={(e) => setParams({ ...params, [v]: e.target.value })}
                placeholder="Valor que o cliente vai ver"
              />
            </div>
          ))}
        </div>
      )}

      {selecionado && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Prévia</p>
          <div className="rounded-lg border border-primary/20 bg-primary px-3 py-2 text-sm text-primary-foreground">
            <p className="whitespace-pre-wrap break-words">{renderTemplate(selecionado, params)}</p>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={() => void salvar()} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar campanha"}
        </Button>
      </div>
    </div>
  );
}
