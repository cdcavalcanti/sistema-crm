import { useEffect, useRef, useState } from "react";
import { Send, Trash2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlayerAudio } from "./PlayerAudio";

function mmss(s: number) {
  const m = Math.floor(s / 60);
  const seg = s % 60;
  return `${m}:${seg.toString().padStart(2, "0")}`;
}

// Grava áudio com visualização de onda (níveis) e prévia antes de enviar.
export function GravadorAudio({
  onEnviar,
  onCancelar,
}: {
  onEnviar: (blob: Blob, mime: string) => void;
  onCancelar: () => void;
}) {
  const [fase, setFase] = useState<"gravando" | "previa">("gravando");
  const [segundos, setSegundos] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeRef = useRef("audio/webm");
  const blobRef = useRef<Blob | null>(null);
  const urlRef = useRef<string | null>(null);

  const pararStreams = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => {});
  };

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelado) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const mime = MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
          ? "audio/ogg;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : "audio/webm";
        mimeRef.current = mime;
        const rec = new MediaRecorder(stream, { mimeType: mime });
        recRef.current = rec;
        chunksRef.current = [];
        rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
        rec.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mime });
          blobRef.current = blob;
          const u = URL.createObjectURL(blob);
          urlRef.current = u;
          setBlobUrl(u);
          setFase("previa");
        };
        rec.start();
        timerRef.current = window.setInterval(() => setSegundos((s) => s + 1), 1000);

        const ctx = new AudioContext();
        ctxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const draw = () => {
          rafRef.current = requestAnimationFrame(draw);
          const cv = canvasRef.current;
          const c = cv?.getContext("2d");
          if (!cv || !c) return;
          analyser.getByteFrequencyData(data);
          c.clearRect(0, 0, cv.width, cv.height);
          const bars = 30;
          const step = Math.floor(data.length / bars) || 1;
          const bw = cv.width / bars;
          for (let i = 0; i < bars; i++) {
            const v = data[i * step] / 255;
            const h = Math.max(2, v * cv.height);
            c.fillStyle = "rgba(16,185,129,0.9)";
            c.fillRect(i * bw + 1, (cv.height - h) / 2, bw - 2, h);
          }
        };
        draw();
      } catch {
        onCancelar();
      }
    })();
    return () => {
      cancelado = true;
      pararStreams();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pararGravacao = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
  };

  return (
    <div className="flex flex-1 items-center gap-2">
      {fase === "gravando" ? (
        <>
          <span className="flex h-2.5 w-2.5 flex-shrink-0 animate-pulse rounded-full bg-red-500" />
          <span className="flex-shrink-0 text-xs tabular-nums text-muted-foreground">{mmss(segundos)}</span>
          <canvas ref={canvasRef} width={260} height={34} className="h-[34px] flex-1" />
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0" title="Cancelar" onClick={onCancelar}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button type="button" size="icon" className="h-9 w-9 flex-shrink-0" title="Parar" onClick={pararGravacao}>
            <Square className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <>
          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 flex-shrink-0" title="Descartar" onClick={onCancelar}>
            <Trash2 className="h-4 w-4" />
          </Button>
          <div className="flex-1 rounded-lg bg-muted px-2 py-1">{blobUrl && <PlayerAudio src={blobUrl} />}</div>
          <Button
            type="button" size="icon" className="h-9 w-9 flex-shrink-0" title="Enviar áudio"
            onClick={() => blobRef.current && onEnviar(blobRef.current, mimeRef.current.split(";")[0])}
          >
            <Send className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
}
