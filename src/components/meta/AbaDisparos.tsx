import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  Plus,
  Send,
  Trash2,
  Upload,
  Download,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ParsedTemplate } from "@/lib/whatsappTemplates";
import {
  autoMapearColuna,
  baixarModeloDisparo,
  lerPlanilha,
  prepararDestinatarios,
  type LinhaPlanilha,
  type Origem,
} from "@/lib/disparoPlanilha";
import { cn } from "@/lib/utils";

type Contagem = {
  pendente: number;
  enviando: number;
  enviado: number;
  falhou: number;
  pulado: number;
  total: number;
};

type Disparo = {
  id: string;
  nome: string;
  inbox_id: number;
  template: string;
  idioma: string;
  status: string;
  arquivo: string | null;
  autor: string | null;
  criado_em: string;
  intervalo_min_s: number;
  intervalo_max_s: number;
  contagem?: Contagem;
  destinatarios?: Array<{
    id: string;
    nome: string;
    telefone: string;
    status: string;
    erro: string | null;
  }>;
};

const COR_STATUS: Record<string, string> = {
  rascunho: "border-border text-muted-foreground",
  enviando: "border-sky-500/40 text-sky-600",
  concluido: "border-emerald-500/40 text-emerald-600",
  cancelado: "border-destructive/40 text-destructive",
};

async function invokeDisparos<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string; message?: string }>(
    "disparos",
    { body },
  );
  if (error) throw new Error(error.message || "Falha na API de disparos");
  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(data.message ?? String(data.error));
  }
  return data as T;
}

export function AbaDisparos() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  const { data: lista = [], isLoading } = useQuery({
    queryKey: ["disparos"],
    queryFn: async () => {
      const r = await invokeDisparos<{ disparos: Disparo[] }>({ action: "list" });
      return r.disparos ?? [];
    },
  });

  if (criando) {
    return (
      <NovoDisparo
        onCancel={() => setCriando(false)}
        onCreated={(id) => {
          setCriando(false);
          setDetalheId(id);
          void qc.invalidateQueries({ queryKey: ["disparos"] });
        }}
      />
    );
  }

  if (detalheId) {
    return (
      <DetalheDisparo
        id={detalheId}
        isAdmin={!!isAdmin}
        onBack={() => {
          setDetalheId(null);
          void qc.invalidateQueries({ queryKey: ["disparos"] });
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Campanhas de template WhatsApp a partir de planilha. Intervalo padrão 5–7s entre envios.
        </p>
        {isAdmin && (
          <Button size="sm" onClick={() => setCriando(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nova campanha
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhuma campanha ainda.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {lista.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-muted/40"
                onClick={() => setDetalheId(d.id)}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{d.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {d.template} · {d.idioma}
                    {d.arquivo ? ` · ${d.arquivo}` : ""}
                  </p>
                </div>
                <Badge variant="outline" className={cn("shrink-0", COR_STATUS[d.status])}>
                  {d.status}
                </Badge>
                {d.contagem && (
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {d.contagem.enviado}/{d.contagem.total}
                    {d.contagem.falhou > 0 ? ` · ${d.contagem.falhou} falha` : ""}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {format(new Date(d.criado_em), "dd/MM HH:mm")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NovoDisparo({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [templateKey, setTemplateKey] = useState("");
  const [arquivoNome, setArquivoNome] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<LinhaPlanilha[]>([]);
  const [cabecalhos, setCabecalhos] = useState<string[]>([]);
  const [colunaNome, setColunaNome] = useState("");
  const [colunaTel, setColunaTel] = useState("");
  const [origens, setOrigens] = useState<Origem[]>([]);
  const [salvando, setSalvando] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ["meta-templates"],
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const { data: payload, error } = await supabase.functions.invoke<{
        templates?: ParsedTemplate[];
        error?: string;
        message?: string;
      }>("whatsapp-templates", { body: { todos: true } });
      if (error) throw new Error(error.message);
      if (payload?.error) throw new Error(payload.message ?? payload.error);
      return (payload?.templates ?? []).filter((t) => t.supported);
    },
  });

  const selecionado = useMemo(() => {
    const [name, language] = templateKey.split("::");
    return templates.find((t) => t.name === name && t.language === language) ?? null;
  }, [templateKey, templates]);

  useEffect(() => {
    if (!selecionado) {
      setOrigens([]);
      return;
    }
    setOrigens(
      selecionado.variables.map(() => ({ coluna: "", fixo: null })),
    );
  }, [selecionado]);

  const preparacao = useMemo(() => {
    if (!linhas.length || !colunaNome || !colunaTel || !selecionado) return null;
    return prepararDestinatarios({
      linhas,
      colunaNome,
      colunaTelefone: colunaTel,
      origensVariaveis: origens,
      totalVariaveis: selecionado.variables.length,
      pais: "BR",
    });
  }, [linhas, colunaNome, colunaTel, origens, selecionado]);

  const onFile = async (file: File | null) => {
    if (!file) return;
    try {
      const { cabecalhos: caps, linhas: rows } = await lerPlanilha(file);
      setArquivoNome(file.name);
      setCabecalhos(caps);
      setLinhas(rows);
      setColunaNome(autoMapearColuna(caps, ["nome", "name", "contato", "cliente"]));
      setColunaTel(autoMapearColuna(caps, ["telefone", "phone", "celular", "whatsapp", "fone"]));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ler planilha");
    }
  };

  const criar = async () => {
    if (!selecionado || !preparacao) return;
    if (!nome.trim()) {
      toast.error("Dê um nome à campanha");
      return;
    }
    if (preparacao.destinatarios.length === 0) {
      toast.error("Nenhum destinatário válido na planilha");
      return;
    }
    setSalvando(true);
    try {
      const criado = await invokeDisparos<Disparo>({
        action: "criar",
        nome: nome.trim(),
        template: selecionado.name,
        idioma: selecionado.language,
        arquivo: arquivoNome,
        destinatarios: preparacao.destinatarios.map((d) => ({
          nome: d.nome,
          telefone: d.telefone,
          variaveis: d.variaveis,
        })),
      });
      toast.success(`Campanha criada: ${criado.contagem?.total ?? preparacao.destinatarios.length} destinatários`);
      onCreated(criado.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-6">
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        <ArrowLeft className="mr-1.5 h-4 w-4" />
        Voltar
      </Button>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Nome da campanha</Label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Promo março" />
        </div>
        <div className="space-y-2">
          <Label>Template</Label>
          <Select value={templateKey} onValueChange={setTemplateKey}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha um APPROVED" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={`${t.name}::${t.language}`} value={`${t.name}::${t.language}`}>
                  {t.name} ({t.language})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selecionado && (
        <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
          {selecionado.body_text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Label
          htmlFor="planilha-disparo"
          className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-muted/50"
        >
          <Upload className="h-4 w-4" />
          {arquivoNome ?? "Subir planilha (.xlsx)"}
        </Label>
        <input
          id="planilha-disparo"
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => baixarModeloDisparo()}>
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Modelo
        </Button>
      </div>

      {cabecalhos.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Coluna nome</Label>
            <Select value={colunaNome} onValueChange={setColunaNome}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {cabecalhos.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Coluna telefone</Label>
            <Select value={colunaTel} onValueChange={setColunaTel}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {cabecalhos.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selecionado?.variables.map((v, i) => (
            <div key={v} className="space-y-2 sm:col-span-2">
              <Label>
                Variável {`{{${v}}}`} — coluna ou texto fixo
              </Label>
              <div className="flex flex-wrap gap-2">
                <Select
                  value={
                    origens[i]?.coluna
                      ? origens[i]!.coluna!
                      : origens[i]?.fixo != null
                        ? "__fixo__"
                        : ""
                  }
                  onValueChange={(val) => {
                    setOrigens((prev) => {
                      const next = [...prev];
                      next[i] =
                        val === "__fixo__"
                          ? { coluna: null, fixo: next[i]?.fixo ?? "" }
                          : { coluna: val, fixo: null };
                      return next;
                    });
                  }}
                >
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Coluna" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__fixo__">Texto fixo…</SelectItem>
                    {cabecalhos.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {origens[i]?.coluna == null && (
                  <Input
                    className="max-w-xs"
                    placeholder="Valor fixo"
                    value={origens[i]?.fixo ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      setOrigens((prev) => {
                        const next = [...prev];
                        next[i] = { coluna: null, fixo: val };
                        return next;
                      });
                    }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {preparacao && (
        <div className="rounded-lg border border-border p-3 text-sm">
          <p>
            <strong>{preparacao.destinatarios.length}</strong> prontos
            {preparacao.erros.length > 0 && (
              <> · <span className="text-destructive">{preparacao.erros.length} erros</span></>
            )}
            {preparacao.duplicados > 0 && <> · {preparacao.duplicados} duplicados ignorados</>}
            {preparacao.excedentes > 0 && <> · {preparacao.excedentes} acima do limite</>}
          </p>
          {preparacao.erros.slice(0, 5).map((e) => (
            <p key={`${e.linha}-${e.motivo}`} className="text-xs text-muted-foreground">
              Linha {e.linha}: {e.motivo}
              {e.detalhe ? ` (${e.detalhe})` : ""}
            </p>
          ))}
        </div>
      )}

      <Button
        disabled={salvando || !preparacao?.destinatarios.length}
        onClick={() => void criar()}
      >
        {salvando ? "Criando…" : "Criar rascunho"}
      </Button>
    </div>
  );
}

function DetalheDisparo({
  id,
  isAdmin,
  onBack,
}: {
  id: string;
  isAdmin: boolean;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data, refetch, isFetching } = useQuery({
    queryKey: ["disparo", id],
    queryFn: () => invokeDisparos<Disparo>({ action: "get", id }),
    refetchInterval: (q) => (q.state.data?.status === "enviando" ? 4000 : false),
  });

  // Poll tick enquanto enviando (além do cron)
  useEffect(() => {
    if (!data || data.status !== "enviando" || !isAdmin) return;
    let cancelled = false;
    const loop = async () => {
      while (!cancelled) {
        try {
          await invokeDisparos<{ disparo?: Disparo }>({ action: "tick", id });
          await qc.invalidateQueries({ queryKey: ["disparo", id] });
          await qc.invalidateQueries({ queryKey: ["disparos"] });
        } catch {
          /* tick falhou — tenta de novo */
        }
        await new Promise((r) => setTimeout(r, 6500));
        const fresh = qc.getQueryData<Disparo>(["disparo", id]);
        if (!fresh || fresh.status !== "enviando") break;
      }
    };
    void loop();
    return () => {
      cancelled = true;
    };
  }, [data?.status, id, isAdmin, qc]);

  const iniciar = async () => {
    setBusy(true);
    try {
      await invokeDisparos({ action: "iniciar", id });
      toast.success("Envio iniciado");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar");
    } finally {
      setBusy(false);
    }
  };

  const cancelar = async () => {
    setBusy(true);
    try {
      await invokeDisparos({ action: "cancelar", id });
      toast.message("Campanha cancelada");
      setConfirmCancel(false);
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    } finally {
      setBusy(false);
    }
  };

  const excluir = async () => {
    setBusy(true);
    try {
      await invokeDisparos({ action: "excluir", id });
      toast.message("Campanha excluída");
      onBack();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return <p className="text-sm text-muted-foreground">Carregando campanha…</p>;
  }

  const c = data.contagem;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Lista
        </Button>
        <Badge variant="outline" className={cn(COR_STATUS[data.status])}>
          {data.status}
        </Badge>
        {isFetching && (
          <span className="text-xs text-muted-foreground">atualizando…</span>
        )}
      </div>

      <div>
        <h2 className="font-display text-xl font-semibold">{data.nome}</h2>
        <p className="text-sm text-muted-foreground">
          {data.template} · {data.idioma}
          {data.arquivo ? ` · ${data.arquivo}` : ""}
        </p>
      </div>

      {c && (
        <div className="flex flex-wrap gap-4 text-sm tabular-nums">
          <span>Total {c.total}</span>
          <span className="text-emerald-600">Enviados {c.enviado}</span>
          <span>Pendentes {c.pendente}</span>
          {c.falhou > 0 && <span className="text-destructive">Falhas {c.falhou}</span>}
          {c.pulado > 0 && <span>Pulados {c.pulado}</span>}
        </div>
      )}

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          {(data.status === "rascunho" || data.status === "cancelado") &&
            (c?.pendente ?? 0) > 0 && (
              <Button disabled={busy} onClick={() => void iniciar()}>
                <Send className="mr-1.5 h-4 w-4" />
                Iniciar envio
              </Button>
            )}
          {data.status === "enviando" && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmCancel(true)}
            >
              <Ban className="mr-1.5 h-4 w-4" />
              Cancelar
            </Button>
          )}
          {data.status !== "enviando" && (
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={busy}
              onClick={() => setConfirmDel(true)}
            >
              <Trash2 className="mr-1.5 h-4 w-4" />
              Excluir
            </Button>
          )}
        </div>
      )}

      {data.destinatarios && data.destinatarios.length > 0 && (
        <div className="max-h-[420px] overflow-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-background text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="px-3 py-2 font-medium">Telefone</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Erro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.destinatarios.map((d) => (
                <tr key={d.id}>
                  <td className="px-3 py-2">{d.nome}</td>
                  <td className="px-3 py-2 font-mono text-xs">{d.telefone}</td>
                  <td className="px-3 py-2">{d.status}</td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-xs text-destructive">
                    {d.erro}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar envio?</AlertDialogTitle>
            <AlertDialogDescription>
              Pendentes serão marcados como pulados. Quem já recebeu permanece enviado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void cancelar()}>Cancelar campanha</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>Remove o rascunho e o histórico desta lista.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void excluir()}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
