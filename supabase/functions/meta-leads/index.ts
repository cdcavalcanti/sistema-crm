// Captação de Meta Lead Ads (em código) — Sistema CRM.
// Faz a verificação do webhook do Meta (GET), recebe o leadgen (POST), busca
// o lead no Graph API e grava no Supabase do CRM.
// Registra em entradas_log.
//
// Deploy --no-verify-jwt (o Meta chama sem JWT). Segurança:
//   - GET: confere hub.verify_token == META_VERIFY_TOKEN.
//   - POST: valida X-Hub-Signature-256 com META_APP_SECRET (se configurado).
//
// Secrets: META_VERIFY_TOKEN, META_PAGE_ACCESS_TOKEN, [META_APP_SECRET],
//          [META_GRAPH_VERSION] (default v21.0).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { criarLead, type LeadInput } from "../_shared/criarLead.ts";
import { avisarSecretaria } from "../_shared/avisarSecretaria.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const GRAPH = `https://graph.facebook.com/${Deno.env.get("META_GRAPH_VERSION") ?? "v21.0"}`;

function parseIdade(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v.replace(/\D/g, ""));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

async function assinaturaValida(appSecret: string, body: string, header: string | null): Promise<boolean> {
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return header.slice(7) === hex;
}

// Mapeia o lead do Graph (field_data) → LeadInput. Usado pelo webhook (POST) e
// pela recuperação, pra os leads recuperados ficarem idênticos aos do webhook.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function montarInput(lead: any, lg: { leadgen_id: string; form_id?: string; ad_id?: string; campaign_id?: string }): LeadInput {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
  const map: Record<string, string> = {};
  for (const f of lead.field_data ?? []) {
    if (f?.name) map[norm(String(f.name))] = (f.values?.[0] ?? "").toString();
  }
  const chaves = Object.keys(map);
  const achar = (pred: (k: string) => boolean): string | null => {
    for (const k of chaves) if (pred(k) && map[k] !== "") return map[k];
    return null;
  };
  return {
    origem: "meta_ads",
    nome:
      achar((k) => ["nome_completo", "full_name", "name", "nome", "seu_nome"].includes(k)) ??
      achar((k) => k.includes("nome") && !k.includes("aluno")) ??
      "Lead Meta",
    email: achar((k) => k.includes("email") || k.includes("mail")),
    telefone: achar(
      (k) => k.includes("telefone") || k.includes("phone") || k.includes("whatsapp") || k.includes("celular"),
    ),
    nome_estabelecimento: achar((k) => k.includes("aluno") && k.includes("nome")),
    anos_operacao: parseIdade(achar((k) => k.includes("idade"))),
    segmento: achar((k) => k.includes("serie") || k.includes("turma")),
    metadados: {
      leadgen_id: lg.leadgen_id, form_id: lg.form_id, ad_id: lg.ad_id, campaign_id: lg.campaign_id,
      field_data: lead.field_data ?? null,
    },
  };
}

// Recuperação: varre a central de leads do Meta (últimas N horas) e cria no CRM
// os que ainda não entraram (mesma checagem da auditoria: payload->lead->>id).
async function recuperar(u: URL): Promise<Response> {
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  const token = Deno.env.get("META_PAGE_ACCESS_TOKEN");
  const pageId = Deno.env.get("META_PAGE_ID") ?? "393102414069269";
  const horas = Number(u.searchParams.get("horas") ?? "48");
  if (!token) return json({ error: "meta_nao_configurado" }, 500);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const fr = await fetch(`${GRAPH}/${pageId}/leadgen_forms?fields=id,name,status,leads_count&limit=100&access_token=${encodeURIComponent(token)}`);
  const fj = await fr.json();
  if (!fr.ok || !Array.isArray(fj.data)) return json({ error: "meta_forms_erro", detalhe: fj?.error?.message }, 502);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const forms = fj.data.filter((f: any) => f.status === "ACTIVE" && (f.leads_count ?? 0) > 0);
  const desdeMs = Date.now() - horas * 3600 * 1000;
  const recuperados: unknown[] = [];

  for (const f of forms) {
    try {
      const lr = await fetch(`${GRAPH}/${f.id}/leads?fields=id,created_time,field_data&limit=50&access_token=${encodeURIComponent(token)}`);
      const lj = await lr.json();
      if (!lr.ok || !Array.isArray(lj.data)) continue;
      for (const lead of lj.data) {
        const ct = lead.created_time ? new Date(lead.created_time).getTime() : 0;
        if (ct < desdeMs) break;
        const { count } = await supabase
          .from("entradas_log").select("id", { count: "exact", head: true })
          .eq("canal", "meta").filter("payload->lead->>id", "eq", String(lead.id));
        if (count) continue;
        const lg = { leadgen_id: String(lead.id), form_id: String(f.id) };
        const input = montarInput(lead, lg);
        const res = await criarLead(supabase, input);
        if (res.ignorado) { recuperados.push({ id: lead.id, nome: input.nome, form: f.name, ignorado: true }); continue; }
        await supabase.from("entradas_log").insert({
          canal: "meta", origem: String(f.id), payload: { leadgen: lg, lead },
          contato_id: res.contato_id, oportunidade_id: res.oportunidade_id,
        });
        recuperados.push({ id: lead.id, nome: input.nome, form: f.name, oportunidade_id: res.oportunidade_id });
      }
    } catch (e) { console.error("recuperar_erro", f.id, e); }
  }
  return json({ ok: true, recuperados });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // -------- Verificação do webhook (GET) --------
  if (req.method === "GET") {
    const u = new URL(req.url);
    // Recuperação manual (protegida por secret): cria no CRM os leads do Meta que faltaram.
    if (u.searchParams.get("recuperar")) {
      if (u.searchParams.get("secret") !== Deno.env.get("AGENDA_SYNC_SECRET")) {
        return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return await recuperar(u);
    }
    const mode = u.searchParams.get("hub.mode");
    const token = u.searchParams.get("hub.verify_token");
    const challenge = u.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && token === Deno.env.get("META_VERIFY_TOKEN")) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const bodyText = await req.text();

  // -------- Validação de assinatura (se META_APP_SECRET estiver setado) --------
  const appSecret = Deno.env.get("META_APP_SECRET");
  if (appSecret) {
    const ok = await assinaturaValida(appSecret, bodyText, req.headers.get("x-hub-signature-256"));
    if (!ok) {
      return new Response(JSON.stringify({ error: "invalid_signature" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const pageToken = Deno.env.get("META_PAGE_ACCESS_TOKEN");
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  let payload: any;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Coleta todos os leadgen do payload (entry[].changes[].value)
  const leadgens: Array<{ leadgen_id: string; form_id?: string; ad_id?: string; campaign_id?: string }> = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value ?? {};
      if (v.leadgen_id) {
        leadgens.push({
          leadgen_id: String(v.leadgen_id),
          form_id: v.form_id ? String(v.form_id) : undefined,
          ad_id: v.ad_id ? String(v.ad_id) : undefined,
          campaign_id: v.campaign_id ? String(v.campaign_id) : undefined,
        });
      }
    }
  }

  const resultados: unknown[] = [];
  for (const lg of leadgens) {
    try {
      if (!pageToken) throw new Error("META_PAGE_ACCESS_TOKEN ausente");
      // Busca o lead no Graph
      const resp = await fetch(`${GRAPH}/${lg.leadgen_id}?access_token=${encodeURIComponent(pageToken)}`);
      const lead = await resp.json();
      if (!resp.ok) throw new Error(`graph_error: ${JSON.stringify(lead)}`);

      const input = montarInput(lead, lg);

      const res = await criarLead(supabase, input);
      // Cliente já ativo / já contratou CRM: não cadastra nem avisa o comercial.
      if (res.ignorado) {
        resultados.push({ leadgen_id: lg.leadgen_id, ok: true, ignorado: true });
        continue;
      }
      await supabase.from("entradas_log").insert({
        canal: "meta",
        origem: lg.form_id ?? "meta_lead_ads",
        payload: { leadgen: lg, lead },
        contato_id: res.contato_id,
        oportunidade_id: res.oportunidade_id,
        ip,
      });
      await avisarSecretaria({
        tipo: "lead", nome: input.nome, telefone: input.telefone, email: input.email,
        nome_estabelecimento: input.nome_estabelecimento, anos_operacao: input.anos_operacao,
        segmento: input.segmento, origem: "Meta Lead Ads",
      });
      resultados.push({ leadgen_id: lg.leadgen_id, ok: true, oportunidade_id: res.oportunidade_id });
    } catch (err) {
      console.error("meta_leads_error", lg.leadgen_id, err);
      await supabase.from("entradas_log").insert({
        canal: "meta", origem: lg.form_id ?? "meta_lead_ads", payload: lg, erro: String(err), ip,
      });
      resultados.push({ leadgen_id: lg.leadgen_id, ok: false });
    }
  }

  // Sempre 200 para o Meta não reenviar indefinidamente.
  return new Response(JSON.stringify({ ok: true, processados: resultados.length, resultados }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
