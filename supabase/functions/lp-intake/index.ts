// Captação de leads do site / landing pages do Sistema CRM (em código).
// Grava só no Supabase do CRM (sem boas-vindas
// por enquanto) e registra a submissão bruta em entradas_log.
//
// POST público (deploy --no-verify-jwt). Aceita 3 formatos de corpo, então
// dá pra apontar TODOS os webhooks do site direto pra cá:
//   1. JSON limpo: { nome, telefone, email, nome_estabelecimento, anos_operacao, turma_aluno, form_name, url }
//   2. Elementor Pro (form-data/multipart): fields[nome][value], fields[telefone][value],
//      fields[email][value], fields[nomedoaluno][value], fields[idadedoaluno][value],
//      fields[<id>][value] (turma), form[name], meta[page_url][value]
//      (aliases Elementor mantidos por compatibilidade dos formulários)
//   3. application/x-www-form-urlencoded com as mesmas chaves.
//
// Campos não mapeados são preservados em metadados (e o payload bruto em entradas_log).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { criarLead, type LeadInput } from "../_shared/criarLead.ts";
import { avisarSecretaria } from "../_shared/avisarSecretaria.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function parseIdade(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/\D/g, ""));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

function pick(c: Record<string, string>, ...keys: string[]): string | null {
  for (const k of keys) {
    if (c[k] != null && c[k] !== "") return c[k];
  }
  return null;
}

// Lê o corpo em qualquer formato (JSON / form-data / urlencoded) e devolve:
//  - raw: objeto bruto (pro log)
//  - campos: dict normalizado (chaves minúsculas); achata Elementor fields[x][value]
//  - formName, url
async function lerCorpo(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  const raw: Record<string, unknown> = {};
  if (ct.includes("application/json")) {
    const j = await req.json().catch(() => ({}));
    Object.assign(raw, j ?? {});
  } else {
    // multipart/form-data ou application/x-www-form-urlencoded
    const fd = await req.formData().catch(() => null);
    if (fd) for (const [k, v] of fd.entries()) raw[k] = typeof v === "string" ? v : "[arquivo]";
  }

  const campos: Record<string, string> = {};
  let formName: string | null = null;
  let url: string | null = null;
  let remoteIp: string | null = null;
  for (const [k, v] of Object.entries(raw)) {
    const val = v == null ? "" : String(v);
    // Elementor: fields[nome][value]  /  form_fields[nome]
    const m = /^fields\[([^\]]+)\]\[value\]$/.exec(k) ?? /^form_fields\[([^\]]+)\]$/.exec(k);
    if (m) {
      campos[m[1].toLowerCase()] = val;
    } else if (k === "form[name]" || k === "form_name") {
      formName = val;
    } else if (k === "meta[page_url][value]" || k === "url" || k === "page_url") {
      url = val;
    } else if (k === "meta[remote_ip][value]") {
      remoteIp = val;
    } else if (/^(fields|form|meta)\[/.test(k)) {
      // ignora chaves estruturais do Elementor (id/type/title/required/raw_value/meta diversos);
      // o payload completo já fica salvo em entradas_log.
      continue;
    } else {
      // chaves "limpas" (JSON direto) entram no mesmo dict
      campos[k.toLowerCase()] = val;
    }
  }
  return { raw, campos, formName, url, remoteIp };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { raw, campos, formName, url, remoteIp } = await lerCorpo(req);
  const ip = remoteIp ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const origem = (formName ?? "site").trim() || "site";

  const nome = (pick(campos, "nome", "nomecliente", "name", "nome_completo") ?? "").trim();
  if (!nome) {
    await supabase.from("entradas_log").insert({ canal: "site", origem, payload: raw, erro: "nome_ausente", ip });
    return new Response(JSON.stringify({ error: "nome_obrigatorio" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Campos já mapeados (não repetir em metadados)
  const MAPEADOS = new Set([
    "nome", "nomecliente", "name", "nome_completo",
    "telefone", "whatsapp", "celular", "phone", "phone_number",
    "email", "e-mail",
    "nomedoaluno", "nome_estabelecimento", "nome_aluno", "nomealuno", "aluno",
    "idadedoaluno", "anos_operacao", "idade_aluno", "idade",
    "turma", "serie", "segmento", "serie_interesse", "turma_aluno", "turmadoaluno", "field_5614f8b",
    "form_name",
  ]);
  const metadados: Record<string, unknown> = { url };
  for (const [k, v] of Object.entries(campos)) {
    if (!MAPEADOS.has(k) && v !== "") metadados[k] = v;
  }

  const input: LeadInput = {
    origem,
    nome,
    email: pick(campos, "email", "e-mail"),
    telefone: pick(campos, "telefone", "whatsapp", "celular", "phone", "phone_number"),
    nome_estabelecimento: pick(
      campos, "nomedoaluno", "nome_estabelecimento", "nome_aluno", "nomealuno", "aluno",
    ),
    anos_operacao: parseIdade(
      pick(campos, "idadedoaluno", "anos_operacao", "idade_aluno", "idade"),
    ),
    segmento: pick(
      campos, "turma", "serie", "segmento", "serie_interesse", "turma_aluno", "turmadoaluno", "field_5614f8b",
    ),
    metadados,
  };

  try {
    const res = await criarLead(supabase, input);
    // Cliente já ativo / já contratou CRM: não cadastra nem avisa o comercial.
    if (res.ignorado) {
      return new Response(JSON.stringify({ ok: true, ignorado: true }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    await supabase.from("entradas_log").insert({
      canal: "site", origem, payload: raw,
      contato_id: res.contato_id, oportunidade_id: res.oportunidade_id, ip,
    });
    await avisarSecretaria({
      tipo: "lead", nome: input.nome, telefone: input.telefone, email: input.email,
      nome_estabelecimento: input.nome_estabelecimento, anos_operacao: input.anos_operacao,
      segmento: input.segmento, origem: input.origem,
    });
    return new Response(JSON.stringify({ ok: true, ...res }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("lp_intake_error", err);
    await supabase.from("entradas_log").insert({ canal: "site", origem, payload: raw, erro: String(err), ip });
    return new Response(JSON.stringify({ error: "internal_error", message: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
