import { supabase } from "@/integrations/supabase/client";

function digitos(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/**
 * Garante uma conversa WhatsApp 1:1 no CRM a partir da oportunidade.
 * Templates oficiais (Meta) precisam de conversa_id no whatsapp-send-template.
 */
export async function garantirConversaDaOportunidade(
  oportunidadeId: string,
): Promise<string | null> {
  const { data: opp, error } = await supabase
    .from("oportunidades")
    .select("id, contato_id, contato:contatos(id, nome, telefone)")
    .eq("id", oportunidadeId)
    .maybeSingle();
  if (error || !opp) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contato = (opp as any).contato as
    | { id?: string; nome?: string | null; telefone?: string | null }
    | null;
  const tel = digitos(contato?.telefone);
  if (tel.length < 10) return null;

  const { data: porTel } = await supabase
    .from("conversas")
    .select("id")
    .eq("canal", "whatsapp")
    .eq("eh_grupo", false)
    .eq("telefone", tel)
    .maybeSingle();
  if ((porTel as { id?: string } | null)?.id) return (porTel as { id: string }).id;

  // Fallback: últimos 8 dígitos (DDI/DDD variam)
  const suf = tel.slice(-8);
  const { data: lista } = await supabase
    .from("conversas")
    .select("id, telefone")
    .eq("canal", "whatsapp")
    .eq("eh_grupo", false)
    .ilike("telefone", `%${suf}`)
    .limit(10);
  const match = (lista ?? []).find((c) => digitos((c as { telefone?: string }).telefone).endsWith(suf));
  if ((match as { id?: string } | undefined)?.id) return (match as { id: string }).id;

  const waChatId = `${tel}@c.us`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: criada, error: errCreate } = await (supabase as any)
    .from("conversas")
    .insert({
      wa_chat_id: waChatId,
      telefone: tel,
      nome_whatsapp: contato?.nome ?? null,
      contato_id: (opp as { contato_id?: string }).contato_id ?? contato?.id ?? null,
      canal: "whatsapp",
      eh_grupo: false,
      ultimo_em: new Date().toISOString(),
      ultima_msg: null,
      nao_lidas: 0,
    })
    .select("id")
    .maybeSingle();

  // Corrida: wa_chat_id unique
  if (errCreate?.code === "23505") {
    const { data: again } = await supabase
      .from("conversas")
      .select("id")
      .eq("wa_chat_id", waChatId)
      .maybeSingle();
    return (again as { id?: string } | null)?.id ?? null;
  }
  if (errCreate) throw errCreate;
  return (criada as { id?: string } | null)?.id ?? null;
}
