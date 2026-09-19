import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, fmtWhats, tituloConversa, type ConversaResumo } from "./ConversaList";

type Info = { nome?: string | null; pushname?: string | null; numero?: string | null; foto?: string | null; about?: string | null };

export function InfoContatoDialog({
  conversa,
  open,
  onOpenChange,
}: {
  conversa: ConversaResumo;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["contato-waha", conversa.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<{ ok?: boolean } & Info>("whatsapp-contato", {
        body: { conversa_id: conversa.id },
      });
      if (error) throw error;
      return data as Info;
    },
    staleTime: 60_000,
  });

  const nome = data?.nome || conversa.nome_whatsapp || tituloConversa(conversa);
  const linha = (rotulo: string, valor?: string | null) =>
    valor ? (
      <div>
        <div className="text-xs font-semibold text-muted-foreground">{rotulo}</div>
        <div className="text-sm">{valor}</div>
      </div>
    ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Informações do contato</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <Avatar url={data?.foto ?? conversa.foto_url} nome={nome} size={72} />
              <div className="text-base font-semibold">{nome}</div>
            </div>
            <div className="space-y-3">
              {linha("Nome no WhatsApp", data?.pushname)}
              {linha("Número", fmtWhats(data?.numero || conversa.telefone))}
              {linha("Recado", data?.about)}
            </div>
            {!data?.about && (
              <p className="text-center text-xs text-muted-foreground">
                O recado/status do WhatsApp não é disponibilizado nesta conexão.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
