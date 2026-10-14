import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Escuta Realtime em dados_conversa (tabela do SDR).
 * NÃO escuta conversas/mensagens do WhatsApp direto (WAHA) —
 * só vira contato/oportunidade quem passou pela IA.
 */
export function useSdrHandoffWatcher(enabled = true) {
  const qc = useQueryClient();
  const pending = useRef(new Set<string>());
  const lastEtapa = useRef(new Map<string, string>());

  useEffect(() => {
    if (!enabled) return;

    const sync = async (row: {
      conversation_id?: string;
      etapa?: string;
      telefone?: string;
    }) => {
      if (!row?.conversation_id) return;
      const key = `${row.conversation_id}:${row.etapa ?? ""}`;
      if (pending.current.has(key)) return;
      // evita spam se o mesmo snapshot repetir
      if (lastEtapa.current.get(row.conversation_id) === row.etapa && pending.current.has(row.conversation_id)) {
        return;
      }
      pending.current.add(key);
      pending.current.add(row.conversation_id);
      lastEtapa.current.set(row.conversation_id, row.etapa ?? "");
      try {
        const { data, error } = await supabase.functions.invoke("sdr-handoff", {
          body: { conversation_id: row.conversation_id, telefone: row.telefone },
        });
        if (error) throw error;
        if (data?.ignorado) return;
        if (data?.ok) {
          const msg =
            data.acao === "atualizado"
              ? `SDR → CRM atualizado (${data.etapa_crm ?? data.sdr_etapa})`
              : `SDR → lead no CRM (${data.etapa_crm ?? "Qualificação"})`;
          toast.success(msg);
          qc.invalidateQueries({ queryKey: ["oportunidades"] });
          qc.invalidateQueries({ queryKey: ["contatos"] });
          qc.invalidateQueries({ queryKey: ["conversas"] });
          qc.invalidateQueries({ queryKey: ["sdr"] });
        }
      } catch (e) {
        console.error("sdr_sync_watcher", e);
        toast.error("Falha ao espelhar lead do SDR no CRM");
      } finally {
        setTimeout(() => {
          pending.current.delete(key);
          pending.current.delete(row.conversation_id!);
        }, 8_000);
      }
    };

    const channel = supabase
      .channel("sdr-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dados_conversa" },
        (payload) => {
          const row = (payload.new ?? null) as {
            conversation_id?: string;
            etapa?: string;
            telefone?: string;
          } | null;
          if (!row?.conversation_id) return;
          void sync(row);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, qc]);
}
