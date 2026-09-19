import { useEffect, useRef, useState } from "react";
import { Download, FileText, Image as ImageIcon, Loader2, Mic, Play, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PlayerAudio } from "./PlayerAudio";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

// Baixa a mídia pelo proxy (whatsapp-media) autenticado e devolve um blob URL.
async function carregarMidia(conversaId: string, waMessageId: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-media`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON,
      Authorization: `Bearer ${session?.access_token ?? ""}`,
    },
    body: JSON.stringify({ conversa_id: conversaId, wa_message_id: waMessageId }),
  });
  if (!res.ok) throw new Error("Falha ao carregar mídia");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

function IconeTipo({ tipo, className = "h-4 w-4" }: { tipo: string; className?: string }) {
  if (tipo === "imagem" || tipo === "figurinha") return <ImageIcon className={className} />;
  if (tipo === "audio") return <Mic className={className} />;
  if (tipo === "video") return <Video className={className} />;
  return <FileText className={className} />;
}

export function MidiaMensagem({
  conversaId,
  waMessageId,
  tipo,
  nome,
}: {
  conversaId: string;
  waMessageId: string | null;
  tipo: string;
  nome: string | null;
}) {
  const autoLoad = tipo === "imagem" || tipo === "figurinha" || tipo === "audio" || tipo === "video";
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(false);
  const urlRef = useRef<string | null>(null);

  const buscar = async () => {
    if (!waMessageId || loading || url) return;
    setLoading(true);
    setErro(false);
    try {
      const u = await carregarMidia(conversaId, waMessageId);
      urlRef.current = u;
      setUrl(u);
    } catch {
      setErro(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoLoad) buscar();
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waMessageId]);

  if (!waMessageId) {
    return (
      <div className="mb-1 flex items-center gap-1.5 text-xs opacity-80">
        <IconeTipo tipo={tipo} className="h-3.5 w-3.5" /> {nome ?? tipo}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mb-1 flex items-center gap-1.5 text-xs opacity-80">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> carregando…
      </div>
    );
  }

  if (erro) {
    return (
      <button onClick={buscar} className="mb-1 flex items-center gap-1.5 text-xs underline opacity-80">
        <IconeTipo tipo={tipo} className="h-3.5 w-3.5" /> tentar novamente
      </button>
    );
  }

  if (url) {
    if (tipo === "figurinha") {
      return <img src={url} alt="figurinha" className="mb-1 h-28 w-28 object-contain" />;
    }
    if (tipo === "imagem") {
      return (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt="" className="mb-1 max-h-64 rounded-lg object-cover" />
        </a>
      );
    }
    if (tipo === "audio") return <div className="mb-1"><PlayerAudio src={url} /></div>;
    if (tipo === "video") return <video controls src={url} className="mb-1 max-h-64 rounded-lg" />;
    return (
      <a href={url} download={nome ?? "arquivo"} className="mb-1 flex items-center gap-1.5 text-xs underline">
        <Download className="h-3.5 w-3.5" /> {nome ?? "Baixar arquivo"}
      </a>
    );
  }

  // documento / não-auto: botão pra carregar/baixar
  return (
    <button onClick={buscar} className="mb-1 flex items-center gap-1.5 text-xs underline opacity-90">
      {tipo === "documento" ? <Download className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      {nome ?? "Abrir mídia"}
    </button>
  );
}
