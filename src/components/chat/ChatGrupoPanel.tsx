import { useQuery } from "@tanstack/react-query";
import { Users, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, fmtWhats, tituloConversa, type ConversaResumo } from "./ConversaList";

type Participante = { telefone: string; nome: string | null; admin: boolean };

export function ChatGrupoPanel({ conversa }: { conversa: ConversaResumo }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["grupo-participantes", conversa.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean; total?: number; participantes?: Participante[];
      }>("whatsapp-grupo", { body: { conversa_id: conversa.id } });
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });

  const participantes = data?.participantes ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <div className="flex items-center gap-3">
          <Avatar url={conversa.foto_url} nome={tituloConversa(conversa)} size={48} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{tituloConversa(conversa)}</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3 w-3" /> Grupo
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-2.5 text-xs font-medium text-muted-foreground">
        <span>Participantes</span>
        {data?.total != null && <span>{data.total}</span>}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {isError && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Não foi possível carregar os participantes.
          </p>
        )}
        {!isLoading && !isError && participantes.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Nenhum participante encontrado ainda.
          </p>
        )}
        <ul className="divide-y divide-border/50">
          {participantes.map((p) => {
            const nome = p.nome || fmtWhats(p.telefone) || p.telefone;
            return (
              <li key={p.telefone} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar url={null} nome={nome} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{nome}</div>
                  {p.nome && (
                    <div className="truncate text-xs text-muted-foreground">{fmtWhats(p.telefone)}</div>
                  )}
                </div>
                {p.admin && (
                  <span className="flex-shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                    admin
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
