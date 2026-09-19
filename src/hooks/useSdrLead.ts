import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  digitosTelefone,
  sufixoTelefone,
  type DadosConversaSdr,
} from "@/lib/sdr";

async function buscarLeadPorTelefone(telefone: string | null | undefined): Promise<DadosConversaSdr | null> {
  const digits = digitosTelefone(telefone);
  if (digits.length < 8) return null;

  // 1) match exato
  const { data: exact } = await supabase
    .from("dados_conversa")
    .select("*")
    .eq("telefone", digits)
    .maybeSingle();
  if (exact) return exact as unknown as DadosConversaSdr;

  // 2) com +55 / variação de comprimento — ilike últimos 8
  const suf = sufixoTelefone(digits, 8);
  if (!suf) return null;
  const { data: lista } = await supabase
    .from("dados_conversa")
    .select("*")
    .ilike("telefone", `%${suf}`)
    .order("updated_at", { ascending: false })
    .limit(5);
  const rows = (lista ?? []) as unknown as DadosConversaSdr[];
  return rows.find((r) => digitosTelefone(r.telefone).endsWith(suf)) ?? rows[0] ?? null;
}

export function useSdrLead(telefone: string | null | undefined) {
  const qc = useQueryClient();
  const digits = digitosTelefone(telefone);
  const enabled = digits.length >= 8;

  const leadQ = useQuery({
    queryKey: ["sdr", "lead", digits.slice(-8)],
    enabled,
    queryFn: () => buscarLeadPorTelefone(telefone),
  });

  const telLead = leadQ.data?.telefone ?? (enabled ? digits : null);
  const telPause = telLead ?? (enabled ? digits : null);

  const pauseQ = useQuery({
    queryKey: ["sdr", "pausar", telPause],
    enabled: !!telPause,
    queryFn: async () => {
      const tel = telPause!;
      const { data: exact } = await supabase
        .from("pausar_ia")
        .select("id, telefone, nome, created_at")
        .eq("telefone", tel)
        .maybeSingle();
      if (exact) return exact;
      // match por sufixo (Chatwoot vs WAHA às vezes diferem no 55/9)
      const suf = sufixoTelefone(tel, 8);
      if (!suf) return null;
      const { data: lista } = await supabase
        .from("pausar_ia")
        .select("id, telefone, nome, created_at")
        .ilike("telefone", `%${suf}`)
        .limit(5);
      return (lista ?? []).find((r) => digitosTelefone(r.telefone).endsWith(suf)) ?? null;
    },
  });

  const historicoQ = useQuery({
    queryKey: ["sdr", "historico", leadQ.data?.conversation_id],
    enabled: !!leadQ.data?.conversation_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("historico_mensagens")
        .select("id, role, content, created_at, telefone")
        .eq("conversation_id", leadQ.data!.conversation_id)
        .order("created_at", { ascending: true })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const pausar = useMutation({
    mutationFn: async () => {
      const tel = telPause ?? digits;
      if (!tel) throw new Error("Sem telefone");
      const { data: ja } = await supabase.from("pausar_ia").select("id").eq("telefone", tel).maybeSingle();
      if (ja) return;
      const { error } = await supabase
        .from("pausar_ia")
        .insert({ telefone: tel, nome: leadQ.data?.nome ?? null });
      if (error && !String(error.message).includes("duplicate")) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sdr", "pausar"] });
    },
  });

  const retomar = useMutation({
    mutationFn: async () => {
      const tel = pauseQ.data?.telefone ?? telPause ?? digits;
      if (!tel) throw new Error("Sem telefone");
      const { error } = await supabase.from("pausar_ia").delete().eq("telefone", tel);
      if (error) throw error;
      // limpa variação do mesmo número se existir
      const suf = sufixoTelefone(tel, 8);
      if (suf) {
        await supabase.from("pausar_ia").delete().ilike("telefone", `%${suf}`);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sdr", "pausar"] });
    },
  });

  return {
    lead: leadQ.data ?? null,
    isLoading: leadQ.isLoading,
    pausada: !!pauseQ.data,
    historico: historicoQ.data ?? [],
    historicoLoading: historicoQ.isLoading,
    refetchHistorico: historicoQ.refetch,
    pausar,
    retomar,
    telefoneCanonico: telPause,
  };
}

/** Insere pausar_ia só se o telefone já for lead do SDR (dados_conversa).
 *  Mensagens diretas no WhatsApp do CRM NÃO pausam/criam nada no SDR. */
export async function autoPausarSdr(telefone: string | null | undefined, nome?: string | null) {
  const digits = digitosTelefone(telefone);
  if (digits.length < 8) return;
  const lead = await buscarLeadPorTelefone(digits);
  if (!lead?.telefone) return; // não é atendimento SDR — ignora
  const tel = lead.telefone;
  const { data: ja } = await supabase.from("pausar_ia").select("id").eq("telefone", tel).maybeSingle();
  if (ja) return;
  const { error } = await supabase
    .from("pausar_ia")
    .insert({ telefone: tel, nome: nome ?? lead.nome ?? null });
  if (error && !String(error.message).includes("duplicate")) throw error;
}
