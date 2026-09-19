// Envia um CONTATO (vcard) por WhatsApp (WAHA / engine GOWS — suporta 201) e
// registra a mensagem na conversa (direcao=saida, tipo='contato').
// Body: { conversa_id, nome, telefone }  — Auth: Bearer (usuário logado).
// ⚠️ Usa a sessão WAHA exclusiva do Sistema CRM (WAHA_SESSION).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// normaliza para dígitos com DDI 55 (padrão do projeto)
function normalizarTelefone(tel: string): string {
  let d = (tel ?? "").replace(/\D/g, "");
  if (!d.startsWith("55") && (d.length === 10 || d.length === 11)) d = "55" + d;
  return d;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: userData } = await createClient(supabaseUrl, anon).auth.getUser(token);
  const user = userData?.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  const { conversa_id, nome, telefone } = await req.json().catch(() => ({}));
  if (!conversa_id || !nome || !telefone) return json({ error: "parametros_invalidos" }, 400);

  const admin = createClient(supabaseUrl, service);
  const { data: conv } = await admin
    .from("conversas").select("wa_chat_id").eq("id", conversa_id).maybeSingle();
  if (!conv?.wa_chat_id) return json({ error: "conversa_nao_encontrada" }, 404);

  const wahaUrl = Deno.env.get("WAHA_URL");
  const wahaKey = Deno.env.get("WAHA_API_KEY");
  const wahaSession = Deno.env.get("WAHA_SESSION") ?? "default";
  if (!wahaUrl || !wahaKey) return json({ error: "waha_nao_configurada" }, 500);

  const digitos = normalizarTelefone(String(telefone));
  const exibicao = `+${digitos}`;
  const vcard =
    `BEGIN:VCARD\nVERSION:3.0\nFN:${String(nome).replace(/\n/g, " ")}\n` +
    `TEL;type=CELL;type=VOICE;waid=${digitos}:${exibicao}\nEND:VCARD`;

  const resp = await fetch(`${wahaUrl.replace(/\/$/, "")}/api/sendContactVcard`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": wahaKey },
    body: JSON.stringify({ session: wahaSession, chatId: conv.wa_chat_id, contacts: [{ vcard }] }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) return json({ error: "waha_falhou", detalhes: body }, 502);

  const waMessageId: string | null = body?.id ?? body?.key?.id ?? null;
  const { data: msg } = await admin
    .from("mensagens")
    .insert({
      conversa_id,
      wa_message_id: waMessageId,
      direcao: "saida",
      corpo: String(nome),        // nome do contato
      tipo: "contato",
      media_nome: digitos,        // telefone (dígitos) para o card
      status: "enviada",
      autor_id: user.id,
      autor_email: user.email,
    })
    .select("id")
    .single();

  return json({ ok: true, mensagem_id: msg?.id ?? null });
});
