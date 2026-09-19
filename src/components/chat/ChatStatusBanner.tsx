import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { rotuloSessaoWhatsapp } from "@/lib/canalWhatsapp";

type Status = {
  status: string;
  conectado: boolean;
  numero: string | null;
  qr: string | null;
};

// Banner que avisa quando o WhatsApp está desconectado e abre o QR pra reconectar.
export function ChatStatusBanner() {
  const [qrOpen, setQrOpen] = useState(false);

  const { data, refetch } = useQuery({
    queryKey: ["whatsapp-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<Status>("whatsapp-status", {
        method: "GET",
      });
      if (error) throw error;
      return data!;
    },
    refetchInterval: 20_000,
    staleTime: 10_000,
  });

  const restart = useMutation({
    mutationFn: async () => {
      await supabase.functions.invoke("whatsapp-status", { method: "POST", body: { action: "restart" } });
    },
    onSuccess: () => {
      toast.success("Reiniciando o WhatsApp… aguarde o QR aparecer.");
      setTimeout(() => refetch(), 4000);
    },
    onError: () => toast.error("Não foi possível reconectar o WhatsApp. Tente de novo em instantes."),
  });

  if (!data || data.conectado) return null;

  const situacao = rotuloSessaoWhatsapp(data.status);

  return (
    <>
      <div className="flex items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <span className="flex-1">
          WhatsApp comercial <strong>fora do ar</strong> ({situacao}). Mensagens não entram nem saem
          até reconectar.
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 border-amber-400 bg-white"
          onClick={() => {
            refetch();
            setQrOpen(true);
          }}
        >
          <QrCode className="h-3.5 w-3.5" /> Ler QR Code
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 text-amber-900"
          disabled={restart.isPending}
          onClick={() => restart.mutate()}
        >
          <RefreshCw className="h-3.5 w-3.5" /> Reconectar
        </Button>
      </div>

      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
            <DialogDescription>
              No celular: WhatsApp → Aparelhos conectados → Conectar aparelho, e aponte para o QR.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            {data.qr ? (
              <img src={data.qr} alt="QR Code" className="h-64 w-64 rounded-lg border border-border" />
            ) : (
              <div className="flex h-64 w-64 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-center text-sm text-muted-foreground">
                <RefreshCw className="h-5 w-5" />
                QR ainda não disponível ({situacao}).
                <br />
                Clique em &quot;Reconectar&quot; e aguarde.
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Atualizar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
