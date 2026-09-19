import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Paperclip, Mic, Loader2, X, BadgeCheck, Reply, Smile, Forward, PanelRight, Pencil, Trash2, Search, Plus, Image as ImageIcon, FileText, ArrowLeft, Check, ListChecks, Contact, Pause, Play } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EncaminharDialog } from "./EncaminharDialog";
import { EnviarContatoDialog } from "./EnviarContatoDialog";
import { InfoContatoDialog } from "./InfoContatoDialog";
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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate } from "@/lib/format";
import { Avatar, fmtWhats, tituloConversa, type ConversaResumo } from "./ConversaList";
import { MidiaMensagem } from "./MidiaMensagem";
import { GravadorAudio } from "./GravadorAudio";
import { autoPausarSdr, useSdrLead } from "@/hooks/useSdrLead";
import { TemplatePicker } from "./TemplatePicker";

type Mensagem = {
  id: string;
  wa_message_id: string | null;
  direcao: string;
  corpo: string | null;
  tipo: string;
  media_url: string | null;
  media_nome: string | null;
  status: string | null;
  criado_em: string;
  remetente_nome?: string | null;
  remetente_telefone?: string | null;
  responde_a?: string | null;
  encaminhada?: boolean | null;
  excluida?: boolean | null;
  editada?: boolean | null;
};

type Midia = { tipo: "imagem" | "audio" | "video" | "documento"; data: string; mimetype: string; filename?: string };

const horaDe = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function rotuloDia(iso: string) {
  const hoje = new Date();
  const d = new Date(iso);
  const igual = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  if (igual(d, hoje)) return "Hoje";
  if (igual(d, ontem)) return "Ontem";
  return fmtDate(iso);
}

const EMOJIS = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎", "🤔", "😅", "🙂", "😉",
  "👍", "👏", "🙏", "🤝", "💪", "🙌", "👋", "✅", "❤️", "🔥", "🎉", "✨",
  "⭐", "🚀", "📌", "💯", "😢", "😭", "😡", "😱", "🥰", "😴", "🤗", "🤩",
  "👀", "💬", "📅", "😬",
];

function tipoPorMime(mime: string): Midia["tipo"] {
  if (mime.startsWith("image/")) return "imagem";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "documento";
}

// Em grupos, as menções vêm como "@5548999990000" (número cru). Troca pelo
// nome de quem foi marcado; sem nome, mostra o número formatado (não o código).
function aplicarMencoes(texto: string, nomes: Map<string, string>): string {
  return texto.replace(/@(\d{8,15})/g, (_full, num: string) => {
    const nome = nomes.get(num) ?? nomes.get(num.slice(-8));
    return nome ? `@${nome}` : `@${fmtWhats(num)}`;
  });
}

function fileParaBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export function MensagemThread({ conversa, onTogglePainel, painelAberto, onVoltar }: {
  conversa: ConversaResumo;
  onTogglePainel?: () => void;
  painelAberto?: boolean;
  onVoltar?: () => void; // celular: volta para a lista de conversas
}) {
  const qc = useQueryClient();
  // Instagram entra pelo Chatwoot (outro gateway/função de envio) e não tem os
  // recursos exclusivos da WAHA (responder/editar/excluir/encaminhar/grupos).
  const ehInstagram = conversa.canal === "instagram";
  const fnEnvio = ehInstagram ? "instagram-send" : "whatsapp-send";
  const mostrarPausarSdr = !ehInstagram && !conversa.eh_grupo && !!conversa.telefone;
  const {
    pausada: sdrPausada,
    pausar: sdrPausar,
    retomar: sdrRetomar,
  } = useSdrLead(mostrarPausarSdr ? conversa.telefone : null);

  const toggleSdrPause = async () => {
    try {
      if (sdrPausada) {
        await sdrRetomar.mutateAsync();
        toast.success("SDR retomado — IA volta a responder");
      } else {
        await sdrPausar.mutateAsync();
        toast.success("SDR pausado — humano assumiu");
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao pausar/retomar IA");
    }
  };
  const [texto, setTexto] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // inputs separados por tipo — alimentam o menu "+" (estilo WhatsApp Web)
  const fotoRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  const [modoAudio, setModoAudio] = useState(false);
  const [anexos, setAnexos] = useState<{ file: File; url: string }[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [respondendo, setRespondendo] = useState<Mensagem | null>(null);
  const [encaminharIds, setEncaminharIds] = useState<string[] | null>(null);
  const [selecionando, setSelecionando] = useState(false);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [contatoAberto, setContatoAberto] = useState(false);
  const [editando, setEditando] = useState<Mensagem | null>(null);
  const [excluindo, setExcluindo] = useState<Mensagem | null>(null);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [busca, setBusca] = useState("");
  const [fotoAberta, setFotoAberta] = useState(false);
  const [infoAberta, setInfoAberta] = useState(false);

  const { data: mensagens, isLoading } = useQuery({
    queryKey: ["mensagens", conversa.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mensagens")
        .select("id, wa_message_id, direcao, corpo, tipo, media_url, media_nome, status, criado_em, remetente_nome, remetente_telefone, responde_a, encaminhada, excluida, editada")
        .eq("conversa_id", conversa.id)
        .order("criado_em", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Mensagem[];
    },
    // Realtime é a via instantânea; este polling é a rede de segurança para
    // quando o websocket não entrega (mensagem nova aparece em até ~5s sem F5).
    // refetchIntervalInBackground: o CRM costuma ficar aberto num segundo monitor
    // ou aba de fundo — sem isso o polling pausa e parece que "não atualiza".
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  // Participantes do grupo (para resolver menções e mostrar nomes). Reusa o cache do painel.
  const { data: grupoData } = useQuery({
    queryKey: ["grupo-participantes", conversa.id],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke<{ participantes?: { telefone: string; nome: string | null }[] }>(
        "whatsapp-grupo",
        { body: { conversa_id: conversa.id } },
      );
      return data;
    },
    enabled: !!conversa.eh_grupo,
    staleTime: 60_000,
  });

  const nomePorTelefone = useMemo(() => {
    const mapa = new Map<string, string>();
    const add = (tel?: string | null, nome?: string | null) => {
      const d = (tel ?? "").replace(/\D/g, "");
      if (!d || !nome) return;
      if (!mapa.has(d)) mapa.set(d, nome);
      if (!mapa.has(d.slice(-8))) mapa.set(d.slice(-8), nome);
    };
    for (const p of grupoData?.participantes ?? []) add(p.telefone, p.nome);
    for (const msg of mensagens ?? []) add(msg.remetente_telefone, msg.remetente_nome);
    return mapa;
  }, [grupoData, mensagens]);

  // Para citar/mostrar a mensagem respondida.
  const msgPorWaId = useMemo(() => {
    const m = new Map<string, Mensagem>();
    for (const x of mensagens ?? []) if (x.wa_message_id) m.set(x.wa_message_id, x);
    return m;
  }, [mensagens]);
  const autorDe = (m: Mensagem) =>
    m.direcao === "saida" ? "Você" : m.remetente_nome || tituloConversa(conversa);
  const previaDe = (m: Mensagem) => {
    const t = m.corpo ? m.corpo : m.tipo !== "texto" ? "📎 Mídia" : "";
    return t.length > 120 ? `${t.slice(0, 120)}…` : t;
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [mensagens, conversa.id]);

  const key = ["mensagens", conversa.id];
  const otimista = (parcial: Partial<Mensagem>) => {
    const anterior = qc.getQueryData<Mensagem[]>(key) ?? [];
    const temp: Mensagem = {
      id: `temp-${Date.now()}`, wa_message_id: null, direcao: "saida", corpo: null,
      tipo: "texto", media_url: null, media_nome: null, status: "pendente",
      criado_em: new Date().toISOString(), ...parcial,
    };
    qc.setQueryData<Mensagem[]>(key, [...anterior, temp]);
    return anterior;
  };

  const enviarTexto = useMutation({
    mutationFn: async ({ conteudo, replyTo }: { conteudo: string; replyTo: string | null }) => {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean }>(fnEnvio, {
        body: { conversa_id: conversa.id, texto: conteudo, reply_to: replyTo ?? undefined },
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error("Falha no envio");
      // Humano assumiu → SDR cala (idempotente)
      void autoPausarSdr(conversa.telefone, conversa.nome_whatsapp).catch(() => undefined);
    },
    onMutate: async ({ conteudo, replyTo }: { conteudo: string; replyTo: string | null }) => {
      await qc.cancelQueries({ queryKey: key });
      return { anterior: otimista({ corpo: conteudo, responde_a: replyTo }) };
    },
    onError: (err: any, _v, ctx) => {
      if (ctx?.anterior) qc.setQueryData(key, ctx.anterior);
      toast.error(err?.message ?? "Erro ao enviar");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["conversas"] });
    },
  });

  const enviarMidia = useMutation({
    mutationFn: async ({ midia, replyTo }: { midia: Midia; replyTo: string | null }) => {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean }>(fnEnvio, {
        body: { conversa_id: conversa.id, midia, reply_to: replyTo ?? undefined },
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error("Falha ao enviar mídia");
      void autoPausarSdr(conversa.telefone, conversa.nome_whatsapp).catch(() => undefined);
    },
    onMutate: async ({ midia, replyTo }: { midia: Midia; replyTo: string | null }) => {
      await qc.cancelQueries({ queryKey: key });
      return { anterior: otimista({ tipo: midia.tipo, media_nome: midia.filename ?? null, responde_a: replyTo }) };
    },
    onError: (err: any, _v, ctx) => {
      if (ctx?.anterior) qc.setQueryData(key, ctx.anterior);
      toast.error(err?.message ?? "Erro ao enviar mídia");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["conversas"] });
    },
  });

  const editarMsg = useMutation({
    mutationFn: async ({ id, texto }: { id: string; texto: string }) => {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>("whatsapp-msg", {
        body: { acao: "editar", mensagem_id: id, texto },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Falha ao editar");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["conversas"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao editar"),
  });

  const excluirMsg = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>("whatsapp-msg", {
        body: { acao: "excluir", mensagem_id: id },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Falha ao excluir");
    },
    onSuccess: () => { toast.success("Mensagem excluída"); qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["conversas"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao excluir"),
  });

  const handleEnviar = () => {
    const conteudo = texto.trim();
    if (!conteudo) return;
    if (editando) {
      editarMsg.mutate({ id: editando.id, texto: conteudo });
      setEditando(null);
      setTexto("");
      return;
    }
    const replyTo = respondendo?.wa_message_id ?? null;
    setTexto("");
    setRespondendo(null);
    enviarTexto.mutate({ conteudo, replyTo });
  };

  // Anexos ficam "em espera" (prévia) até o usuário confirmar o envio.
  const addArquivos = (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.some((f) => f.size > 15 * 1024 * 1024)) toast.error("Arquivos acima de 15MB foram ignorados.");
    const ok = arr.filter((f) => f.size <= 15 * 1024 * 1024).map((f) => ({ file: f, url: URL.createObjectURL(f) }));
    if (ok.length) setAnexos((a) => [...a, ...ok]);
  };
  const removerAnexo = (i: number) =>
    setAnexos((a) => { URL.revokeObjectURL(a[i]?.url); return a.filter((_, j) => j !== i); });
  const enviarAnexos = async () => {
    const lista = anexos;
    const replyTo = respondendo?.wa_message_id ?? null;
    setAnexos([]);
    setRespondendo(null);
    for (const { file, url } of lista) {
      const data = await fileParaBase64(file);
      enviarMidia.mutate({
        midia: {
          tipo: tipoPorMime(file.type), data,
          mimetype: file.type || "application/octet-stream", filename: file.name,
        },
        replyTo,
      });
      URL.revokeObjectURL(url);
    }
  };
  const handleArquivo = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) addArquivos(e.target.files);
    e.target.value = "";
  };

  const enviarAudio = async (blob: Blob, mime: string) => {
    setModoAudio(false);
    if (blob.size < 500) return;
    const replyTo = respondendo?.wa_message_id ?? null;
    setRespondendo(null);
    const data = await fileParaBase64(blob);
    enviarMidia.mutate({ midia: { tipo: "audio", data, mimetype: mime, filename: "audio.ogg" }, replyTo });
  };

  const titulo = tituloConversa(conversa);
  const noCrm = !!(conversa.contato_id || conversa.contato);

  const toggleSel = (id: string) =>
    setSelecionadas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  const sairSelecao = () => { setSelecionando(false); setSelecionadas(new Set()); };
  const encaminharSelecionadas = () => {
    // mantém a ordem cronológica das mensagens
    const ids = (mensagens ?? []).filter((m) => selecionadas.has(m.id)).map((m) => m.id);
    if (ids.length) setEncaminharIds(ids);
  };
  const termoBusca = busca.trim().toLowerCase();
  const mensagensExibidas = termoBusca
    ? (mensagens ?? []).filter((m) => (m.corpo ?? "").toLowerCase().includes(termoBusca))
    : (mensagens ?? []);
  let diaAtual = "";

  return (
    <div
      className="relative grid h-full min-h-0 grid-rows-[auto_1fr_auto]"
      onDragOver={(e) => { e.preventDefault(); if (!arrastando) setArrastando(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setArrastando(false); }}
      onDrop={(e) => {
        e.preventDefault();
        setArrastando(false);
        if (e.dataTransfer.files?.length) addArquivos(e.dataTransfer.files);
      }}
    >
      {arrastando && (
        <div className="pointer-events-none absolute inset-0 z-20 m-2 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10 text-sm font-medium text-primary">
          Solte os arquivos para anexar
        </div>
      )}
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-2.5">
        {onVoltar && (
          <button
            type="button"
            onClick={onVoltar}
            title="Voltar para as conversas"
            className="-ml-1 flex-shrink-0 rounded-full p-1 text-muted-foreground hover:bg-muted md:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => conversa.foto_url && setFotoAberta(true)}
          title={conversa.foto_url ? "Ver foto" : undefined}
          className={`flex-shrink-0 rounded-full ${conversa.foto_url ? "cursor-pointer" : "cursor-default"}`}
        >
          <Avatar url={conversa.foto_url} nome={titulo} size={40} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{titulo}</span>
            {noCrm && (
              <Badge
                variant="secondary"
                className="flex-shrink-0 gap-1 border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0 text-[10px] font-medium text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"
                title="Lead já cadastrado no CRM"
              >
                <BadgeCheck className="h-3 w-3" /> No CRM
              </Badge>
            )}
          </div>
          {conversa.eh_grupo ? (
            <div className="truncate text-xs text-muted-foreground">Grupo</div>
          ) : ehInstagram ? (
            <div className="truncate text-xs text-muted-foreground">
              {conversa.instagram_username ? `@${conversa.instagram_username}` : "Instagram"}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setInfoAberta(true)}
              className="truncate text-left text-xs text-muted-foreground hover:underline"
              title="Ver informações do contato"
            >
              {fmtWhats(conversa.telefone)}
            </button>
          )}
        </div>
        <div className="ml-auto flex flex-shrink-0 items-center gap-1">
          {mostrarPausarSdr && (
            <Button
              type="button"
              size="sm"
              variant={sdrPausada ? "default" : "outline"}
              className="mr-1 h-8 gap-1.5 px-2.5 text-xs"
              disabled={sdrPausar.isPending || sdrRetomar.isPending}
              onClick={() => void toggleSdrPause()}
              title={sdrPausada ? "Retomar respostas do SDR" : "Pausar o SDR e assumir o atendimento"}
            >
              {sdrPausada ? (
                <><Play className="h-3.5 w-3.5" /> Retomar IA</>
              ) : (
                <><Pause className="h-3.5 w-3.5" /> Pausar IA</>
              )}
            </Button>
          )}
          {!ehInstagram && (
            <button
              type="button"
              onClick={() => (selecionando ? sairSelecao() : setSelecionando(true))}
              title={selecionando ? "Cancelar seleção" : "Selecionar mensagens"}
              className={`flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted ${selecionando ? "text-primary" : "text-muted-foreground"}`}
            >
              <ListChecks className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => { setBuscaAberta((v) => !v); setBusca(""); }}
            title="Buscar na conversa"
            className={`flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted ${buscaAberta ? "text-primary" : "text-muted-foreground"}`}
          >
            <Search className="h-4 w-4" />
          </button>
          {onTogglePainel && (
            <button
              type="button"
              onClick={onTogglePainel}
              title={painelAberto ? "Ocultar painel" : "Abrir painel do contato"}
              className={`flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted ${painelAberto ? "text-primary" : "text-muted-foreground"}`}
            >
              <PanelRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 space-y-1 overflow-y-auto bg-muted/20 px-4 py-4">
        {buscaAberta && (
          <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-2 flex items-center gap-2 border-b border-border bg-card px-4 py-2">
            <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              autoFocus
              placeholder="Buscar nesta conversa…"
              className="flex-1 bg-transparent text-sm outline-none"
            />
            <button type="button" onClick={() => { setBuscaAberta(false); setBusca(""); }} className="flex-shrink-0 text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {isLoading && <Skeleton className="h-24 w-full" />}
        {!isLoading && (mensagens ?? []).length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma mensagem ainda.</p>
        )}
        {!isLoading && termoBusca && mensagensExibidas.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma mensagem encontrada.</p>
        )}
        {mensagensExibidas.map((m) => {
          const dia = rotuloDia(m.criado_em);
          const mostrarDia = dia !== diaAtual;
          diaAtual = dia;
          const saida = m.direcao === "saida";
          const mostrarRemetente = !!conversa.eh_grupo && !saida;
          const nomeRemetente = m.remetente_nome || fmtWhats(m.remetente_telefone) || "Desconhecido";
          const citada = m.responde_a ? msgPorWaId.get(m.responde_a) : null;
          return (
            <div key={m.id}>
              {mostrarDia && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-full bg-background px-2.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground shadow-sm">
                    {dia}
                  </span>
                </div>
              )}
              <div
                className={`flex items-center gap-2 ${selecionando ? "cursor-pointer rounded-lg px-1 py-0.5 hover:bg-muted/30" : ""} ${selecionando && selecionadas.has(m.id) ? "bg-primary/5" : ""}`}
                onClick={selecionando ? () => toggleSel(m.id) : undefined}
              >
                {selecionando && (
                  <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${selecionadas.has(m.id) ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}>
                    {selecionadas.has(m.id) && <Check className="h-3 w-3" />}
                  </span>
                )}
                <div className={`group/msg flex flex-1 items-end gap-1.5 ${saida ? "justify-end" : "justify-start"} ${selecionando ? "pointer-events-none" : ""}`}>
                {mostrarRemetente && <Avatar url={null} nome={nomeRemetente} size={28} />}
                {!ehInstagram && saida && m.wa_message_id && !m.excluida && (
                  <div className="mb-1 flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100">
                    <button type="button" onClick={() => { setSelecionando(true); setSelecionadas(new Set([m.id])); }} title="Encaminhar (marca esta e deixa selecionar outras)" className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
                      <Forward className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => setRespondendo(m)} title="Responder" className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
                      <Reply className="h-3.5 w-3.5" />
                    </button>
                    {m.tipo === "texto" && (
                      <button type="button" onClick={() => { setRespondendo(null); setEditando(m); setTexto(m.corpo ?? ""); }} title="Editar" className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button type="button" onClick={() => setExcluindo(m)} title="Excluir" className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                <div className={`max-w-[72%] rounded-2xl px-3 py-2 text-sm shadow-sm ${saida ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-card"}`}>
                  {mostrarRemetente && (
                    <p className="mb-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{nomeRemetente}</p>
                  )}
                  {m.encaminhada && (
                    <p className="mb-0.5 flex items-center gap-1 text-xs italic opacity-70">
                      <Forward className="h-3 w-3" /> Encaminhada
                    </p>
                  )}
                  {m.excluida ? (
                    <p className="text-sm italic opacity-70">🚫 Mensagem apagada</p>
                  ) : (
                    <>
                      {citada && (
                        <div className={`mb-1 rounded-md border-l-2 px-2 py-1 text-xs ${saida ? "border-primary-foreground/60 bg-black/10" : "border-emerald-500 bg-muted"}`}>
                          <div className="font-semibold">{autorDe(citada)}</div>
                          <div className="truncate opacity-80">{previaDe(citada)}</div>
                        </div>
                      )}
                      {m.tipo === "contato" ? (
                        <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-2.5 py-2">
                          <Contact className="h-8 w-8 flex-shrink-0 text-emerald-500" />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{m.corpo || "Contato"}</div>
                            <div className="truncate text-xs opacity-70">{fmtWhats(m.media_nome)}</div>
                          </div>
                        </div>
                      ) : m.tipo !== "texto" ? (
                        <MidiaMensagem conversaId={conversa.id} waMessageId={m.wa_message_id} tipo={m.tipo} nome={m.media_nome} />
                      ) : null}
                      {m.corpo && m.tipo !== "contato" && (
                        <p className="whitespace-pre-wrap break-words">
                          {conversa.eh_grupo ? aplicarMencoes(m.corpo, nomePorTelefone) : m.corpo}
                        </p>
                      )}
                    </>
                  )}
                  <div className={`mt-0.5 text-right text-[10px] ${saida ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {horaDe(m.criado_em)}
                    {m.editada && !m.excluida && " · editada"}
                    {saida && m.status === "pendente" && " · enviando"}
                    {saida && m.status === "falhou" && " · falhou"}
                    {saida && !m.excluida && m.status === "enviada" && " ✓"}
                    {saida && !m.excluida && m.status === "entregue" && " ✓✓"}
                    {saida && !m.excluida && m.status === "lida" && <span className="text-sky-300"> ✓✓</span>}
                  </div>
                </div>
                {!ehInstagram && !saida && m.wa_message_id && (
                  <div className="mb-1 flex flex-shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100">
                    <button type="button" onClick={() => setRespondendo(m)} title="Responder" className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
                      <Reply className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => { setSelecionando(true); setSelecionadas(new Set([m.id])); }} title="Encaminhar (marca esta e deixa selecionar outras)" className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">
                      <Forward className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selecionando && (
        <div className="flex items-center gap-3 border-t border-border bg-card px-4 py-3">
          <span className="text-sm text-muted-foreground">
            {selecionadas.size} selecionada{selecionadas.size === 1 ? "" : "s"}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={sairSelecao}>Cancelar</Button>
            <Button type="button" size="sm" disabled={selecionadas.size === 0} onClick={encaminharSelecionadas}>
              <Forward className="mr-1.5 h-4 w-4" /> Encaminhar{selecionadas.size > 0 ? ` (${selecionadas.size})` : ""}
            </Button>
          </div>
        </div>
      )}
      <div className={`border-t border-border bg-card ${selecionando ? "hidden" : ""}`}>
        <input ref={fileRef} type="file" multiple className="hidden" onChange={handleArquivo} />
        <input ref={fotoRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={handleArquivo} />
        <input
          ref={docRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={handleArquivo}
        />
        {editando && (
          <div className="flex items-center gap-2 border-b border-border/60 bg-amber-50 px-3 py-2 dark:bg-amber-950/20">
            <Pencil className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 flex-1 text-xs font-medium text-amber-700 dark:text-amber-400">Editando mensagem — envie para confirmar</div>
            <button type="button" onClick={() => { setEditando(null); setTexto(""); }} className="flex-shrink-0 text-muted-foreground hover:text-foreground" title="Cancelar edição">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {respondendo && (
          <div className="flex items-start gap-2 border-b border-border/60 bg-muted/40 px-3 py-2">
            <div className="w-1 self-stretch rounded bg-emerald-500" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Respondendo {autorDe(respondendo)}
              </div>
              <div className="truncate text-xs text-muted-foreground">{previaDe(respondendo)}</div>
            </div>
            <button
              type="button"
              onClick={() => setRespondendo(null)}
              className="flex-shrink-0 text-muted-foreground hover:text-foreground"
              title="Cancelar resposta"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        {modoAudio ? (
          <div className="flex min-h-[68px] items-center px-3 py-3">
            <GravadorAudio onEnviar={enviarAudio} onCancelar={() => setModoAudio(false)} />
          </div>
        ) : anexos.length > 0 ? (
          <div className="space-y-2 px-3 py-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {anexos.map((a, i) => (
                <div key={i} className="relative flex-shrink-0">
                  {a.file.type.startsWith("image/") ? (
                    <img src={a.url} alt="" className="h-16 w-16 rounded-lg border border-border object-cover" />
                  ) : (
                    <div className="flex h-16 w-28 flex-col justify-center gap-0.5 rounded-lg border border-border bg-muted/40 px-2">
                      <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="truncate text-[10px] text-muted-foreground">{a.file.name}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removerAnexo(i)}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
                <Paperclip className="mr-1.5 h-3.5 w-3.5" /> Adicionar
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => { anexos.forEach((x) => URL.revokeObjectURL(x.url)); setAnexos([]); }}>
                  Cancelar
                </Button>
                <Button type="button" size="sm" disabled={enviarMidia.isPending} onClick={enviarAnexos}>
                  <Send className="mr-1.5 h-3.5 w-3.5" /> Enviar {anexos.length} arquivo{anexos.length > 1 ? "s" : ""}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); handleEnviar(); }} className="flex min-h-[68px] w-full items-end gap-2 px-3 py-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" size="icon" variant="ghost" className="h-[42px] w-[42px] flex-shrink-0" title="Anexar">
                  <Plus className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-52">
                <DropdownMenuItem onClick={() => fotoRef.current?.click()}>
                  <ImageIcon className="mr-2 h-4 w-4 text-violet-500" /> Fotos e vídeos
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => docRef.current?.click()}>
                  <FileText className="mr-2 h-4 w-4 text-sky-500" /> Documento
                </DropdownMenuItem>
                {!ehInstagram && (
                  <DropdownMenuItem onClick={() => setContatoAberto(true)}>
                    <Contact className="mr-2 h-4 w-4 text-emerald-500" /> Contato
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => fileRef.current?.click()}>
                  <Paperclip className="mr-2 h-4 w-4 text-muted-foreground" /> Qualquer arquivo
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button type="button" size="icon" variant="ghost" className="h-[42px] w-[42px] flex-shrink-0" title="Gravar áudio" onClick={() => setModoAudio(true)}>
              <Mic className="h-4 w-4" />
            </Button>
            {!ehInstagram && !conversa.eh_grupo && (
              <TemplatePicker
                conversaId={conversa.id}
                disabled={enviarTexto.isPending || enviarMidia.isPending}
                onSent={() => {
                  void autoPausarSdr(conversa.telefone, conversa.nome_whatsapp).catch(() => undefined);
                }}
              />
            )}
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" size="icon" variant="ghost" className="h-[42px] w-[42px] flex-shrink-0" title="Emojis">
                  <Smile className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" className="w-[272px] p-2">
                <div className="grid grid-cols-8 gap-0.5">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setTexto((t) => t + e)}
                      className="rounded p-1 text-xl leading-none hover:bg-muted"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleEnviar(); } }}
              placeholder="Mensagem… (Enter envia)"
              rows={1}
              className="max-h-32 min-h-[42px] flex-1 resize-none"
            />
            <Button type="submit" size="icon" className="h-[42px] w-[42px] flex-shrink-0" disabled={!texto.trim() || enviarMidia.isPending}>
              {enviarMidia.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        )}
      </div>

      <EncaminharDialog
        mensagemIds={encaminharIds ?? []}
        open={!!encaminharIds}
        onOpenChange={(o) => { if (!o) { setEncaminharIds(null); sairSelecao(); } }}
      />
      <EnviarContatoDialog
        conversaId={conversa.id}
        open={contatoAberto}
        onOpenChange={setContatoAberto}
      />

      <AlertDialog open={!!excluindo} onOpenChange={(o) => { if (!o) setExcluindo(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir mensagem?</AlertDialogTitle>
            <AlertDialogDescription>
              A mensagem será apagada para todos no WhatsApp. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (excluindo) excluirMsg.mutate(excluindo.id); setExcluindo(null); }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <InfoContatoDialog conversa={conversa} open={infoAberta} onOpenChange={setInfoAberta} />

      {fotoAberta && conversa.foto_url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
          onClick={() => setFotoAberta(false)}
        >
          <img
            src={conversa.foto_url}
            alt={titulo}
            className="max-h-[80vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}
