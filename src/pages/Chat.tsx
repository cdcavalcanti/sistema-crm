import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Instagram } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ConversaList, type Canal, type ConversaResumo } from "@/components/chat/ConversaList";
import { MensagemThread } from "@/components/chat/MensagemThread";
import { ChatCrmPanel } from "@/components/chat/ChatCrmPanel";
import { ChatGrupoPanel } from "@/components/chat/ChatGrupoPanel";
import { ChatStatusBanner } from "@/components/chat/ChatStatusBanner";
import { useSdrHandoffWatcher } from "@/hooks/useSdrHandoffWatcher";

export default function Chat() {
  const qc = useQueryClient();
  const [selecionada, setSelecionada] = useState<ConversaResumo | null>(null);
  const [painelAberto, setPainelAberto] = useState(false);
  const [canal, setCanal] = useState<Canal>("whatsapp");
  useSdrHandoffWatcher(true);

  const { data: conversas, isLoading } = useQuery({
    queryKey: ["conversas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversas")
        .select(
          "id, wa_chat_id, telefone, nome_whatsapp, foto_url, nao_lidas, ultimo_em, ultima_msg, contato_id, eh_grupo, fixada, nao_lida_manual, canal, chatwoot_conversation_id, instagram_username, contato:contatos(id, nome, contato_etiquetas(etiqueta:etiquetas(id, nome, cor)))",
        )
        .order("fixada", { ascending: false })
        .order("ultimo_em", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as ConversaResumo[];
    },
    // Rede de segurança caso o realtime não entregue: a lista se atualiza
    // sozinha (novas conversas / não-lidas / última msg) em até ~10s sem F5.
    // Continua rodando com a aba em segundo plano (CRM fica aberto o dia todo).
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  // Realtime: novas mensagens / mudanças nas conversas recarregam.
  useEffect(() => {
    const canal = supabase
      .channel("chat-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "mensagens" }, (payload) => {
        const convId = (payload.new as { conversa_id: string }).conversa_id;
        qc.invalidateQueries({ queryKey: ["mensagens", convId] });
        qc.invalidateQueries({ queryKey: ["conversas"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversas" }, () =>
        qc.invalidateQueries({ queryKey: ["conversas"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [qc]);

  const canalDe = (c: ConversaResumo): Canal => c.canal ?? "whatsapp";
  const conversasCanal = useMemo(
    () => (conversas ?? []).filter((c) => canalDe(c) === canal),
    [conversas, canal],
  );
  const naoLidasPorCanal = (alvo: Canal) =>
    (conversas ?? []).filter((c) => canalDe(c) === alvo && (c.nao_lidas > 0 || c.nao_lida_manual)).length;
  const trocarCanal = (c: Canal) => {
    setCanal(c);
    setSelecionada(null);
    setPainelAberto(false);
  };

  const selecionadaAtual = (conversas ?? []).find((c) => c.id === selecionada?.id) ?? selecionada;

  const abrirConversa = async (c: ConversaResumo) => {
    setSelecionada(c);
    if (c.nao_lidas > 0 || c.nao_lida_manual) {
      await supabase.from("conversas").update({ nao_lidas: 0, nao_lida_manual: false }).eq("id", c.id);
      qc.invalidateQueries({ queryKey: ["conversas"] });
    }
  };

  const toggleFixar = async (c: ConversaResumo) => {
    await supabase.from("conversas").update({ fixada: !c.fixada }).eq("id", c.id);
    qc.invalidateQueries({ queryKey: ["conversas"] });
  };

  const marcarNaoLido = async (c: ConversaResumo) => {
    await supabase.from("conversas").update({ nao_lida_manual: true }).eq("id", c.id);
    qc.invalidateQueries({ queryKey: ["conversas"] });
  };

  return (
    <div className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col overflow-hidden">
      <ChatStatusBanner />
      <div className="flex min-h-0 flex-1">
      {/* Lista de conversas */}
      {/* No celular mostramos a lista OU a conversa; no desktop, as duas lado a lado. */}
      <aside
        className={`w-full flex-shrink-0 flex-col border-r border-border bg-card md:flex md:w-[330px] ${
          selecionadaAtual ? "hidden" : "flex"
        }`}
      >
        {/* Abas de canal: WhatsApp (WAHA) | Instagram (Chatwoot) */}
        <div className="flex border-b border-border">
          {([
            { key: "whatsapp", label: "WhatsApp", Icon: MessageCircle },
            { key: "instagram", label: "Instagram", Icon: Instagram },
          ] as const).map(({ key, label, Icon }) => {
            const ativo = canal === key;
            const naoLidas = naoLidasPorCanal(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => trocarCanal(key)}
                className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                  ativo
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
                {naoLidas > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-semibold text-white">
                    {naoLidas}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : (
          <ConversaList
            conversas={conversasCanal}
            selecionadaId={selecionadaAtual?.id ?? null}
            onSelecionar={abrirConversa}
            onToggleFixar={toggleFixar}
            onMarcarNaoLido={marcarNaoLido}
            mostrarGrupos={canal === "whatsapp"}
          />
        )}
      </aside>

      {/* Thread */}
      <section
        className={`min-h-0 min-w-0 flex-1 flex-col bg-background md:flex ${
          selecionadaAtual && !painelAberto ? "flex" : "hidden"
        }`}
      >
        {selecionadaAtual ? (
          <MensagemThread
            conversa={selecionadaAtual}
            onTogglePainel={() => setPainelAberto((v) => !v)}
            painelAberto={painelAberto}
            onVoltar={() => setSelecionada(null)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <MessageCircle className="h-10 w-10 opacity-30" />
            <p className="text-sm">Selecione uma conversa para começar.</p>
          </div>
        )}
      </section>

      {/* Painel CRM — escondido por padrão; abre pelo botão no cabeçalho */}
      {painelAberto && selecionadaAtual && (
        <aside className="w-full flex-shrink-0 overflow-y-auto border-l border-border bg-card md:w-[320px]">
          {selecionadaAtual.eh_grupo ? (
            <ChatGrupoPanel conversa={selecionadaAtual} />
          ) : (
            <ChatCrmPanel conversa={selecionadaAtual} />
          )}
        </aside>
      )}
      </div>
    </div>
  );
}
