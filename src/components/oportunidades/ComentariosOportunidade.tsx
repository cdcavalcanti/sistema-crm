import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fmtRelative } from "@/lib/format";
import { Send, Trash2 } from "lucide-react";

export function ComentariosOportunidade({ oportunidadeId }: { oportunidadeId: string }) {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");

  const { data: comentarios } = useQuery({
    queryKey: ["comentarios", oportunidadeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("oportunidade_comentarios")
        .select("*")
        .eq("oportunidade_id", oportunidadeId)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const enviar = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      const { error } = await supabase.from("oportunidade_comentarios").insert({
        oportunidade_id: oportunidadeId,
        user_id: user.id,
        autor_email: user.email,
        conteudo: texto.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTexto("");
      qc.invalidateQueries({ queryKey: ["comentarios", oportunidadeId] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro ao comentar"),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("oportunidade_comentarios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["comentarios", oportunidadeId] }),
    onError: (err: any) => toast.error(err?.message ?? "Erro"),
  });

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!texto.trim()) return;
          enviar.mutate();
        }}
        className="space-y-2"
      >
        <Textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escreva um comentário…"
          rows={3}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={!texto.trim() || enviar.isPending}>
            <Send className="mr-2 h-3.5 w-3.5" />
            Enviar
          </Button>
        </div>
      </form>

      <ol className="space-y-3">
        {(comentarios ?? []).map((c: any) => {
          const podeRemover = c.user_id === user?.id || isAdmin;
          return (
            <li key={c.id} className="rounded-md border border-border/60 bg-card p-3">
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.autor_email ?? "—"}</span>
                <div className="flex items-center gap-2">
                  <span>{fmtRelative(c.criado_em)}</span>
                  {podeRemover && (
                    <button
                      type="button"
                      className="text-destructive hover:underline"
                      onClick={() => remover.mutate(c.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <p className="whitespace-pre-wrap text-sm">{c.conteudo}</p>
            </li>
          );
        })}
        {(comentarios ?? []).length === 0 && (
          <li className="py-4 text-center text-xs text-muted-foreground">Nenhum comentário ainda.</li>
        )}
      </ol>
    </div>
  );
}
