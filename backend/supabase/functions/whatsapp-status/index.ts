// Status da sessão WhatsApp (WAHA) para o Sistema CRM.
// GET  → { status, me } da sessão; se desconectada (SCAN_QR_CODE), inclui o QR (data URL).
// POST ?action=restart → reinicia a sessão (para gerar novo QR quando FAILED/STOPPED).
//
// Requer usuário autenticado (JWT). A chave da WAHA fica só aqui.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // auth: qualquer usuário autenticado
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: u, error: uErr } = await userClient.auth.getUser(auth.replace("Bearer ", ""));
  if (uErr || !u?.user) return json({ error: "unauthorized" }, 401);

  const wahaUrl = (Deno.env.get("WAHA_URL") ?? "").replace(/\/$/, "");
  const wahaKey = Deno.env.get("WAHA_API_KEY") ?? "";
  const session = Deno.env.get("WAHA_SESSION") ?? "default";
  if (!wahaUrl || !wahaKey) return json({ error: "waha_not_configured" }, 500);
  const H = { "X-Api-Key": wahaKey };

  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const action = body?.action ?? new URL(req.url).searchParams.get("action");
      if (action === "restart") {
        const r = await fetch(`${wahaUrl}/api/sessions/${session}/restart`, { method: "POST", headers: H });
        return json({ ok: r.ok });
      }
      return json({ error: "unknown_action" }, 400);
    }

    const sRes = await fetch(`${wahaUrl}/api/sessions/${session}`, { headers: H });
    if (!sRes.ok) return json({ error: "waha_session", detail: await sRes.text() }, 502);
    const s = await sRes.json();
    const status: string = s.status ?? "UNKNOWN";

    let qr: string | null = null;
    if (status === "SCAN_QR_CODE") {
      const qRes = await fetch(`${wahaUrl}/api/${session}/auth/qr?format=image`, { headers: H });
      if (qRes.ok) {
        const buf = new Uint8Array(await qRes.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        qr = `data:image/png;base64,${btoa(bin)}`;
      }
    }

    return json({
      status,
      conectado: status === "WORKING",
      numero: s.me?.id ?? null,
      nome: s.me?.pushName ?? null,
      qr,
    });
  } catch (err) {
    console.error("whatsapp_status_error", err);
    return json({ error: "internal_error", message: String(err) }, 500);
  }
});
