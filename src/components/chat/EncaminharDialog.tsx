import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, fmtWhats, tituloConversa, type ConversaResumo } from "./ConversaList";

export function EncaminharDialog({
  mensagemIds,
  open,
  onOpenChange,
}: {
  mensagemIds: string[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");

  const { data: conversas } = useQuery({
    queryKey: ["conversas-encaminhar"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversas")
        .select("id, wa_chat_id, telefone, nome_whatsapp, foto_url, eh_grupo, contato_id, canal, contato:contatos(id, nome)")
        // Encaminhar usa a WAHA (whatsapp-encaminhar); só faz sentido para WhatsApp.
        .or("canal.eq.whatsapp,canal.is.null")
        .order("ultimo_em", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as ConversaResumo[];
    },
  });

  const enviar = useMutation({
    mutationFn: async (destinoId: string) => {
      // reenvia uma a uma, na ordem original, para preservar a sequência
      for (const id of mensagemIds) {
        const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>(
          "whatsapp-encaminhar",
          { body: { mensagem_id: id, destino_conversa_id: destinoId } },
        );
        if (error) throw error;
        if (!data?.ok) throw new Error(data?.error ?? "Falha ao encaminhar");
      }
      return mensagemIds.length;
    },
    onSuccess: (n) => {
      toast.success(n > 1 ? `${n} mensagens encaminhadas` : "Mensagem encaminhada");
      qc.invalidateQueries({ queryKey: ["conversas"] });
      setBusca("");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao encaminhar"),
  });

  const termo = busca.trim().toLowerCase();
  const filtradas = (conversas ?? []).filter(
    (c) => !termo || `${tituloConversa(c)} ${c.telefone ?? ""}`.toLowerCase().includes(termo),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-0 p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="text-base">
            {mensagemIds.length > 1 ? `Encaminhar ${mensagemIds.length} mensagens para…` : "Encaminhar para…"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar conversa…"
            className="h-8 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
          />
        </div>
        <ul className="max-h-[60vh] overflow-y-auto">
          {filtradas.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={enviar.isPending}
                onClick={() => enviar.mutate(c.id)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 disabled:opacity-50"
              >
                <Avatar url={c.foto_url} nome={tituloConversa(c)} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{tituloConversa(c)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {c.eh_grupo ? "Grupo" : fmtWhats(c.telefone)}
                  </div>
                </div>
                {enviar.isPending && enviar.variables === c.id && <Loader2 className="h-4 w-4 animate-spin" />}
              </button>
            </li>
          ))}
          {filtradas.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhuma conversa.</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
