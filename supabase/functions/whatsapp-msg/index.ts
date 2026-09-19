// Editar / excluir mensagem do WhatsApp (WAHA) — Sistema CRM.
// Body: { acao: "excluir" | "editar", mensagem_id, texto? } — Auth: Bearer.
// Só mensagens NOSSAS (direcao=saida) podem ser editadas/excluídas.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: u, error: uErr } = await uc.auth.getUser(auth.replace("Bearer ", ""));
  if (uErr || !u?.user) return json({ error: "unauthorized" }, 401);

  const { acao, mensagem_id, texto } = await req.json().catch(() => ({}));
  if (!mensagem_id || !["excluir", "editar"].includes(acao)) return json({ error: "parametros_invalidos" }, 400);
  if (acao === "editar" && !String(texto ?? "").trim()) return json({ error: "texto_obrigatorio" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: msg } = await admin
    .from("mensagens").select("wa_message_id, conversa_id, direcao").eq("id", mensagem_id).maybeSingle();
  if (!msg) return json({ error: "mensagem_nao_encontrada" }, 404);
  if (msg.direcao !== "saida") return json({ error: "so_mensagens_enviadas" }, 400);
  if (!msg.wa_message_id) return json({ error: "sem_id_whatsapp" }, 400);

  const { data: conv } = await admin.from("conversas").select("wa_chat_id").eq("id", msg.conversa_id).maybeSingle();
  if (!conv) return json({ error: "conversa_nao_encontrada" }, 404);

  const wahaUrl = (Deno.env.get("WAHA_URL") ?? "").replace(/\/$/, "");
  const wahaKey = Deno.env.get("WAHA_API_KEY") ?? "";
  const session = Deno.env.get("WAHA_SESSION") ?? "default";
  if (!wahaUrl || !wahaKey) return json({ error: "waha_not_configured" }, 500);
  const base = `${wahaUrl}/api/${session}/chats/${encodeURIComponent(conv.wa_chat_id)}/messages/${encodeURIComponent(msg.wa_message_id)}`;

  try {
    if (acao === "excluir") {
      const r = await fetch(base, { method: "DELETE", headers: { "X-Api-Key": wahaKey } });
      if (!r.ok) return json({ ok: false, error: "waha_delete_falhou", detalhe: (await r.text()).slice(0, 200) }, 502);
      await admin.from("mensagens").update({ excluida: true, corpo: null }).eq("id", mensagem_id);
      return json({ ok: true });
    }
    // editar
    const r = await fetch(base, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Api-Key": wahaKey },
      body: JSON.stringify({ text: String(texto).trim() }),
    });
    if (!r.ok) return json({ ok: false, error: "waha_edit_falhou", detalhe: (await r.text()).slice(0, 200) }, 502);
    await admin.from("mensagens").update({ corpo: String(texto).trim(), editada: true }).eq("id", mensagem_id);
    return json({ ok: true });
  } catch (err) {
    console.error("whatsapp_msg_error", err);
    return json({ error: "internal_error", message: String(err) }, 500);
  }
});
