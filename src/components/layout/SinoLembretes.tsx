import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fmtRelative } from "@/lib/format";

type Notif = { id: string; taskId: string; titulo: string; msg: string; em: number; lida: boolean };

// Lembretes de tarefas dentro da ferramenta: avisa ~30, ~10 e ~5 min antes de vencer
// (e quando vence) com um popup (toast) + acumula no sino do topo.
export function SinoLembretes() {
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const alertados = useRef<Set<string>>(new Set());

  const { data: tarefas } = useQuery({
    queryKey: ["lembretes-tarefas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefas")
        .select("id, titulo, due_date, concluida_em")
        .not("due_date", "is", null)
        .is("concluida_em", null)
        .gte("due_date", new Date(Date.now() - 2 * 3600 * 1000).toISOString())
        .lte("due_date", new Date(Date.now() + 6 * 3600 * 1000).toISOString())
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const checar = () => {
      const agora = Date.now();
      for (const t of tarefas ?? []) {
        if (!t.due_date) continue;
        const diffMin = (new Date(t.due_date).getTime() - agora) / 60000;
        let banda: string | null = null;
        let msg = "";
        if (diffMin <= 0 && diffMin > -60) { banda = "venc"; msg = "venceu"; }
        else if (diffMin > 0 && diffMin <= 5) { banda = "5"; msg = "vence em ~5 min"; }
        else if (diffMin > 5 && diffMin <= 10) { banda = "10"; msg = "vence em ~10 min"; }
        else if (diffMin > 10 && diffMin <= 30) { banda = "30"; msg = "vence em ~30 min"; }
        if (!banda) continue;
        const chave = `${t.id}:${banda}`;
        if (alertados.current.has(chave)) continue;
        alertados.current.add(chave);
        toast(`⏰ Tarefa "${t.titulo}" ${msg}`, { description: "Clique no sino para ver os lembretes." });
        setNotifs((n) => [{ id: chave, taskId: t.id, titulo: t.titulo, msg, em: agora, lida: false }, ...n].slice(0, 50));
      }
    };
    checar();
    const iv = setInterval(checar, 60_000);
    return () => clearInterval(iv);
  }, [tarefas]);

  const naoLidas = notifs.filter((n) => !n.lida).length;
  const abrir = (v: boolean) => {
    setAberto(v);
    if (v && naoLidas) setNotifs((n) => n.map((x) => ({ ...x, lida: true })));
  };

  return (
    <Popover open={aberto} onOpenChange={abrir}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Lembretes de tarefas"
        >
          <Bell className="h-4.5 w-4.5" />
          {naoLidas > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
              {naoLidas}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">Lembretes de tarefas</div>
        <div className="max-h-96 overflow-y-auto">
          {notifs.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum lembrete no momento.</p>
          ) : (
            notifs.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => { setAberto(false); navigate("/tarefas"); }}
                className="flex w-full items-start gap-2 border-b border-border/50 px-4 py-2.5 text-left hover:bg-muted/50"
              >
                <span className="mt-0.5 text-base">⏰</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{n.titulo}</div>
                  <div className="text-xs text-muted-foreground">{n.msg} · {fmtRelative(new Date(n.em).toISOString())}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
