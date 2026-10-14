import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

function mmss(s: number) {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const seg = Math.floor(s % 60);
  return `${m}:${seg.toString().padStart(2, "0")}`;
}

// Player de áudio compacto e customizado (herda a cor do balão via currentColor).
export function PlayerAudio({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = useState(false);
  const [atual, setAtual] = useState(0);
  const [dur, setDur] = useState(0);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const onTime = () => setAtual(a.currentTime);
    const onMeta = () => setDur(a.duration);
    const onEnd = () => { setTocando(false); setAtual(0); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (tocando) { a.pause(); setTocando(false); }
    else { a.play(); setTocando(true); }
  };

  const pct = dur ? (atual / dur) * 100 : 0;
  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = ref.current;
    if (!a || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * dur;
  };

  return (
    <div className="flex w-[210px] max-w-full items-center gap-2 py-0.5">
      <audio ref={ref} src={src} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={toggle}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-current/15"
      >
        {tocando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="h-1.5 cursor-pointer overflow-hidden rounded-full bg-current/20" onClick={seek}>
          <div className="h-full rounded-full bg-current/70" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 text-[10px] tabular-nums opacity-70">{mmss(atual || 0)} / {mmss(dur)}</div>
      </div>
    </div>
  );
}
