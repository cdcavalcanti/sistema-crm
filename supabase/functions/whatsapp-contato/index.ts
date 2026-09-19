// Informações do contato no WhatsApp (WAHA) — para o chat do Sistema CRM.
// Body: { conversa_id } — Auth: Bearer (usuário logado).
// Retorna nome/pushname, número e foto. (O "recado/about" não é exposto pelo
// engine GOWS — retorna null nesse caso.)

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

  const { conversa_id } = await req.json().catch(() => ({}));
  if (!conversa_id) return json({ error: "conversa_id_obrigatorio" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: conv } = await admin
    .from("conversas").select("wa_chat_id, telefone, nome_whatsapp, foto_url").eq("id", conversa_id).maybeSingle();
  if (!conv) return json({ error: "conversa_nao_encontrada" }, 404);

  const wahaUrl = (Deno.env.get("WAHA_URL") ?? "").replace(/\/$/, "");
  const wahaKey = Deno.env.get("WAHA_API_KEY") ?? "";
  const session = Deno.env.get("WAHA_SESSION") ?? "default";
  const H = { "X-Api-Key": wahaKey };
  const cid = encodeURIComponent(conv.wa_chat_id);

  const pegar = async (path: string) => {
    try {
      const r = await fetch(`${wahaUrl}${path}`, { headers: H });
      return r.ok ? await r.json() : null;
      // eslint-disable-next-line no-empty
    } catch { return null; }
  };

  const contato = await pegar(`/api/contacts?session=${session}&contactId=${cid}`);
  const foto = await pegar(`/api/contacts/profile-picture?session=${session}&contactId=${cid}`);
  let about: string | null = null;
  const aboutResp = await pegar(`/api/contacts/about?session=${session}&contactId=${cid}`);
  if (aboutResp?.about) about = aboutResp.about; // indisponível no GOWS (fica null)

  const digits = (conv.telefone ?? conv.wa_chat_id ?? "").replace(/\D/g, "");
  return json({
    ok: true,
    nome: contato?.name ?? conv.nome_whatsapp ?? null,
    pushname: contato?.pushname ?? conv.nome_whatsapp ?? null,
    numero: digits,
    foto: foto?.profilePictureURL ?? conv.foto_url ?? null,
    about,
  });
});
