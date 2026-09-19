import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot, Plus, Send, Paperclip, X, Trash2, Pencil, MoreVertical, Loader2, User as UserIcon, Image as ImageIcon, FileText, Globe,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fmtRelative } from "@/lib/format";
import { MarkdownMsg } from "@/components/assistente/MarkdownMsg";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const MODELOS = [
  { id: "gpt-4o", nome: "GPT-4o" },
  { id: "gpt-4o-mini", nome: "GPT-4o mini" },
];

type Anexo = { tipo: "imagem" | "arquivo"; nome: string; mime: string; url?: string; texto?: string };

// Remove imagens em markdown (![](...)) do texto — as imagens geradas já são
// exibidas pelos anexos, então evitamos duplicar.
const semImagemMd = (t: string) => t.replace(/!\[[^\]]*\]\([^)]*\)/g, "").trim();
type Conversa = { id: string; titulo: string; modelo: string; atualizado_em: string };
type Mensagem = { id: string; papel: string; conteudo: string; anexos: Anexo[] };

function lerArquivo(file: File): Promise<Anexo | null> {
  return new Promise((resolve) => {
    const isImg = file.type.startsWith("image/");
    const isTxt = file.type.startsWith("text/") || /\.(txt|md|csv|json|log|ts|tsx|js|py|html|css|sql|yml|yaml)$/i.test(file.name);
    if (!isImg && !isTxt) {
      toast.error(`"${file.name}": por enquanto suporto imagens e arquivos de texto.`);
      return resolve(null);
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error(`"${file.name}" é grande demais (máx 8MB).`);
      return resolve(null);
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (isImg) resolve({ tipo: "imagem", nome: file.name, mime: file.type, url: String(reader.result) });
      else resolve({ tipo: "arquivo", nome: file.name, mime: file.type || "text/plain", texto: String(reader.result).slice(0, 50000) });
    };
    reader.onerror = () => resolve(null);
    if (isImg) reader.readAsDataURL(file); else reader.readAsText(file);
  });
}

export default function Assistente() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [modelo, setModelo] = useState("gpt-4o");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [pending, setPending] = useState<{ conteudo: string; anexos: Anexo[] } | null>(null);
  const [streamingImages, setStreamingImages] = useState<Anexo[]>([]);
  const [statusMsg, setStatusMsg] = useState("");
  const [usouWeb, setUsouWeb] = useState(false);
  const [renomeando, setRenomeando] = useState<Conversa | null>(null);
  const [excluindo, setExcluindo] = useState<Conversa | null>(null);
  const baseSnapshot = useRef<Mensagem[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  const { data: conversas } = useQuery({
    queryKey: ["gpt-conversas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gpt_conversas")
        .select("id, titulo, modelo, atualizado_em")
        .order("atualizado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Conversa[];
    },
  });

  const { data: mensagens } = useQuery({
    queryKey: ["gpt-mensagens", selectedId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gpt_mensagens")
        .select("id, papel, conteudo, anexos")
        .eq("conversa_id", selectedId)
        .order("criado_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Mensagem[];
    },
    enabled: !!selectedId,
  });

  const exibidas: Mensagem[] = isStreaming
    ? [
        ...baseSnapshot.current,
        ...(pending ? [{ id: "pending", papel: "user", conteudo: pending.conteudo, anexos: pending.anexos }] : []),
        { id: "streaming", papel: "assistant", conteudo: streamingText, anexos: streamingImages },
      ]
    : (mensagens ?? []);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [exibidas.length, streamingText]);

  const resetStream = () => {
    setStreamingText("");
    setStreamingImages([]);
    setStatusMsg("");
    setUsouWeb(false);
    setPending(null);
  };

  const novaConversa = () => {
    setSelectedId(null);
    resetStream();
    setAnexos([]);
  };

  const escolher = (id: string) => {
    if (isStreaming) return;
    setSelectedId(id);
    resetStream();
  };

  const adicionarArquivos = async (files: FileList | null) => {
    if (!files) return;
    const lidos = await Promise.all(Array.from(files).map(lerArquivo));
    setAnexos((a) => [...a, ...lidos.filter(Boolean) as Anexo[]]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const enviar = async () => {
    const texto = input.trim();
    if ((!texto && anexos.length === 0) || isStreaming) return;

    baseSnapshot.current = mensagens ?? [];
    const anexosEnviar = anexos;
    setInput("");
    setAnexos([]);
    setStreamingImages([]);
    setStatusMsg("");
    setUsouWeb(false);
    setPending({ conteudo: texto, anexos: anexosEnviar });
    setStreamingText("");
    setIsStreaming(true);

    let conversaAtual = selectedId;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/gpt-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: ANON },
        body: JSON.stringify({ conversa_id: selectedId, content: texto, anexos: anexosEnviar, modelo }),
      });
      if (!resp.ok || !resp.body) {
        const t = await resp.text().catch(() => "");
        throw new Error(t || `HTTP ${resp.status}`);
      }
      const reader = resp.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const linhas = buf.split("\n");
        buf = linhas.pop() ?? "";
        for (const l of linhas) {
          const t = l.trim();
          if (!t.startsWith("data:")) continue;
          const dado = t.slice(5).trim();
          if (!dado) continue;
          let j: Record<string, unknown>;
          try { j = JSON.parse(dado); } catch { continue; }
          if (j.meta) {
            conversaAtual = (j.meta as { conversa_id: string }).conversa_id;
            if (!selectedId) {
              setSelectedId(conversaAtual);
              qc.invalidateQueries({ queryKey: ["gpt-conversas"] });
            }
          } else if (j.delta) {
            acc += j.delta as string;
            setStreamingText(acc);
            setStatusMsg("");
          } else if (j.image) {
            const url = (j.image as { url: string }).url;
            setStreamingImages((x) => [...x, { tipo: "imagem", nome: "imagem.png", mime: "image/png", url }]);
            setStatusMsg("");
          } else if (j.tool === "web_search") {
            setUsouWeb(true);
            setStatusMsg("🌐 Pesquisando na web…");
          } else if (j.status) {
            setStatusMsg(j.status as string);
          } else if (j.error) {
            toast.error(`Erro do assistente: ${String(j.error).slice(0, 160)}`);
          }
        }
      }
      await qc.invalidateQueries({ queryKey: ["gpt-mensagens", conversaAtual] });
      await qc.invalidateQueries({ queryKey: ["gpt-conversas"] });
    } catch (e) {
      toast.error(`Falha ao falar com o assistente: ${(e as Error).message.slice(0, 160)}`);
    } finally {
      setIsStreaming(false);
      setStreamingText("");
      setStreamingImages([]);
      setStatusMsg("");
      setUsouWeb(false);
      setPending(null);
    }
  };

  const renomear = async (c: Conversa, novo: string) => {
    const t = novo.trim();
    if (!t) return;
    await supabase.from("gpt_conversas").update({ titulo: t }).eq("id", c.id);
    qc.invalidateQueries({ queryKey: ["gpt-conversas"] });
    setRenomeando(null);
  };

  const excluir = async (c: Conversa) => {
    await supabase.from("gpt_conversas").delete().eq("id", c.id);
    if (selectedId === c.id) novaConversa();
    qc.invalidateQueries({ queryKey: ["gpt-conversas"] });
    setExcluindo(null);
  };

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-0 overflow-hidden">
      {/* Lista de conversas */}
      <aside className="flex w-[280px] flex-shrink-0 flex-col border-r border-border bg-card">
        <div className="p-3">
          <Button onClick={novaConversa} className="w-full justify-start gap-2" variant="outline">
            <Plus className="h-4 w-4" /> Nova conversa
          </Button>
        </div>
        <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          {(conversas ?? []).length === 0 && (
            <li className="px-2 py-4 text-center text-xs text-muted-foreground">Nenhuma conversa ainda.</li>
          )}
          {(conversas ?? []).map((c) => (
            <li key={c.id} className="group relative">
              <button
                type="button"
                onClick={() => escolher(c.id)}
                className={`flex w-full flex-col items-start gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                  selectedId === c.id ? "bg-sidebar-accent" : "hover:bg-muted/60"
                }`}
              >
                <span className="line-clamp-1 w-full pr-6 text-sm font-medium">{c.titulo}</span>
                <span className="text-[10px] text-muted-foreground">{fmtRelative(c.atualizado_em)}</span>
              </button>
              <div className="absolute right-1 top-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => setRenomeando(c)}>
                      <Pencil className="mr-2 h-4 w-4" /> Renomear
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setExcluindo(c)} className="text-destructive focus:text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" /> Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      {/* Thread */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
        <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <Bot className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Assistente IA</span>
          <select
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
            className="ml-auto rounded-md border border-border bg-transparent px-2 py-1 text-xs"
            title="Modelo"
          >
            {MODELOS.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {exibidas.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <Bot className="h-12 w-12 opacity-30" />
              <div>
                <p className="text-sm font-medium">Como posso ajudar?</p>
                <p className="text-xs">Pergunte qualquer coisa, peça para <strong>gerar uma imagem</strong>,</p>
                <p className="text-xs">ou pergunte algo atual que eu <strong>pesquiso na web</strong>. Também leio imagens e arquivos.</p>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-4">
              {exibidas.map((m) => (
                <div key={m.id} className={`flex gap-3 ${m.papel === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
                    m.papel === "user" ? "bg-primary/10 text-primary" : "bg-emerald-100 text-emerald-700"
                  }`}>
                    {m.papel === "user" ? <UserIcon className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                  </div>
                  <div className={`min-w-0 max-w-[85%] rounded-2xl px-3.5 py-2 ${
                    m.papel === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}>
                    {(m.anexos ?? []).length > 0 && (
                      <div className="mb-1.5 flex flex-wrap gap-1.5">
                        {(m.anexos ?? []).map((a, i) =>
                          a.tipo === "imagem" && a.url ? (
                            <img key={i} src={a.url} alt={a.nome} className="max-h-40 rounded-lg object-cover" />
                          ) : (
                            <span key={i} className="flex items-center gap-1 rounded bg-black/10 px-1.5 py-0.5 text-[11px]">
                              <FileText className="h-3 w-3" /> {a.nome}
                            </span>
                          ),
                        )}
                      </div>
                    )}
                    {m.papel === "assistant" ? (
                      <>
                        {m.id === "streaming" && usouWeb && (
                          <div className="mb-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Globe className="h-3 w-3" /> Pesquisou na web
                          </div>
                        )}
                        {m.conteudo ? (
                          <MarkdownMsg
                            texto={(m.anexos ?? []).some((a) => a.tipo === "imagem") ? semImagemMd(m.conteudo) : m.conteudo}
                          />
                        ) : m.id === "streaming" && statusMsg ? (
                          <span className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {statusMsg}
                          </span>
                        ) : (m.anexos ?? []).length === 0 ? (
                          <span className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" /> pensando…
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.conteudo}</p>
                    )}
                  </div>
                </div>
              ))}
              <div ref={fimRef} />
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-border bg-card px-4 py-3">
          <div className="mx-auto max-w-3xl">
            {anexos.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {anexos.map((a, i) => (
                  <span key={i} className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 px-2 py-1 text-xs">
                    {a.tipo === "imagem" ? <ImageIcon className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                    <span className="max-w-[140px] truncate">{a.nome}</span>
                    <button type="button" onClick={() => setAnexos((x) => x.filter((_, j) => j !== i))}>
                      <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-background p-2">
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,text/*,.txt,.md,.csv,.json,.log,.ts,.tsx,.js,.py,.html,.css,.sql,.yml,.yaml"
                className="hidden"
                onChange={(e) => adicionarArquivos(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                title="Anexar imagem ou arquivo"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); }
                }}
                rows={1}
                placeholder="Envie uma mensagem…  (Enter envia, Shift+Enter quebra linha)"
                className="max-h-40 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none"
              />
              <Button
                onClick={enviar}
                disabled={isStreaming || (!input.trim() && anexos.length === 0)}
                size="icon"
                className="h-9 w-9 flex-shrink-0 rounded-full"
              >
                {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
              O assistente pode cometer erros. Confira informações importantes.
            </p>
          </div>
        </div>
      </section>

      {/* Renomear */}
      <AlertDialog open={!!renomeando} onOpenChange={(o) => !o && setRenomeando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Renomear conversa</AlertDialogTitle>
          </AlertDialogHeader>
          <input
            autoFocus
            defaultValue={renomeando?.titulo}
            id="novo-titulo"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && renomeando) renomear(renomeando, (e.target as HTMLInputElement).value);
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const el = document.getElementById("novo-titulo") as HTMLInputElement | null;
                if (renomeando && el) renomear(renomeando, el.value);
              }}
            >
              Salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Excluir */}
      <AlertDialog open={!!excluindo} onOpenChange={(o) => !o && setExcluindo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              "{excluindo?.titulo}" e todas as mensagens serão apagadas. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => excluindo && excluir(excluindo)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
