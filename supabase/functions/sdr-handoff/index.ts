// Sync SDR → CRM: cria/atualiza contato + oportunidade SOMENTE a partir de
// `dados_conversa` (atendimento da IA SDR).
//
// NÃO usar para mensagens diretas do WhatsApp via WAHA/webhook do CRM —
// essas só alimentam conversas/mensagens no /chat, sem virar lead de pipeline.
//
// Auth:
//   - Usuário autenticado (CRM Realtime watcher), OU
//   - ?secret=SDR_HANDOFF_SECRET (chamada do SDR)
//
// Body: { "conversation_id": "uuid" } e/ou { "telefone": "5583..." }
//
// Mapeamento etapa SDR → pipeline CRM:
//   novo | qualificando | qualificado → "Qualificação"
//   transferido                       → "Atendimento humano" (qualificado)
//   descartado                        → "Perdido"
//
// Origem: whatsapp (= WhatsApp)
// Idempotência: metadados.sdr_conversation_id

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { criarLead } from "../_shared/criarLead.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ORIGEM = "whatsapp";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeEtapaName(s: string) {
  return s.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

/** Etapa da IA SDR → nome da etapa no pipeline do CRM */
function etapaCrmDeSdr(etapaSdr: string): string {
  switch (etapaSdr) {
    case "transferido":
      return "Atendimento humano";
    case "descartado":
      return "Perdido";
    case "novo":
    case "qualificando":
    case "qualificado":
    default:
      return "Qualificação";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") ?? req.headers.get("x-sdr-handoff-secret");
  const expected = Deno.env.get("SDR_HANDOFF_SECRET");
  const authHeader = req.headers.get("Authorization");

  const sbUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

  let autorizado = false;
  if (expected && secret && secret === expected) autorizado = true;

  if (!autorizado && authHeader?.startsWith("Bearer ")) {
    const userClient = createClient(sbUrl, anonKey || serviceKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (userData?.user) autorizado = true;
  }

  if (!autorizado) return json({ error: "unauthorized" }, 401);

  const admin = createClient(sbUrl, serviceKey);
  const body = await req.json().catch(() => ({}));
  const conversationId = body.conversation_id ? String(body.conversation_id) : null;
  const telefoneIn = body.telefone ? String(body.telefone).replace(/\D/g, "") : null;

  let leadQuery = admin.from("dados_conversa").select("*");
  if (conversationId) leadQuery = leadQuery.eq("conversation_id", conversationId);
  else if (telefoneIn) leadQuery = leadQuery.eq("telefone", telefoneIn);
  else return json({ error: "conversation_id_or_telefone_required" }, 400);

  const { data: lead, error: leadErr } = await leadQuery.maybeSingle();
  if (leadErr) return json({ error: leadErr.message }, 500);
  if (!lead) return json({ error: "lead_not_found" }, 404);

  const etapaSdr = String(lead.etapa ?? "novo");
  const cid = lead.conversation_id as string;
  const q = (lead.qualificacao && typeof lead.qualificacao === "object"
    ? lead.qualificacao
    : {}) as Record<string, unknown>;

  const nome =
    (lead.nome as string) ||
    (typeof q.nome === "string" ? q.nome : null) ||
    "Lead WhatsApp (SDR)";
  const segmento = (q.segmento as string) || (lead.segmento as string) || null;
  const resumo =
    (q.resumo_handoff as string) ||
    (lead.resumo_handoff as string) ||
    null;
  const motivo =
    (q.motivo_handoff as string) ||
    (lead.motivo_handoff as string) ||
    (etapaSdr === "descartado" ? "Não qualificado pelo SDR" : null);
  const etapaCrm = etapaCrmDeSdr(etapaSdr);

  const metadadosBase = {
    sdr_conversation_id: cid,
    sdr_etapa: etapaSdr,
    qualificacao: q,
    motivo_handoff: motivo,
    oferta_sugerida: q.oferta_sugerida ?? lead.oferta_sugerida ?? null,
    origem_canal: "whatsapp",
    atendimento: "sdr",
  };

  try {
    // 1) Já existe oportunidade desta conversa SDR? → atualiza contato + opp
    const { data: existentes } = await admin
      .from("oportunidades")
      .select("id, contato_id, metadados, etapa_id")
      .contains("metadados", { sdr_conversation_id: cid })
      .limit(1);

    const existente = existentes?.[0] ?? null;

    if (existente) {
      const { data: etapasAll } = await admin.from("etapas").select("id, nome, ordem").order("ordem");
      const etapasList = (etapasAll ?? []) as Array<{ id: string; nome: string }>;
      const alvo = normalizeEtapaName(etapaCrm);
      const etapaMatch = etapasList.find((e) => normalizeEtapaName(e.nome) === alvo);

      // Atualiza contato
      if (existente.contato_id) {
        const patchContato: Record<string, unknown> = {};
        if (nome) patchContato.nome = nome;
        if (lead.telefone) patchContato.telefone = lead.telefone;
        if (segmento) patchContato.segmento = segmento;
        if (Object.keys(patchContato).length) {
          await admin.from("contatos").update(patchContato).eq("id", existente.contato_id);
        }
      }

      const md = { ...((existente.metadados as Record<string, unknown>) ?? {}), ...metadadosBase };
      const patchOpp: Record<string, unknown> = {
        titulo: nome,
        origem: ORIGEM,
        interesse: segmento,
        observacoes: resumo ?? motivo,
        descricao: resumo ?? motivo,
        metadados: md,
        responsavel: etapaSdr === "transferido" ? "Comercial" : "SDR",
      };
      if (etapaMatch) patchOpp.etapa_id = etapaMatch.id;
      if (etapaSdr === "descartado") {
        patchOpp.motivo_perda = motivo || "Não qualificado pelo SDR";
      }

      await admin.from("oportunidades").update(patchOpp).eq("id", existente.id);

      await vincularConversa(admin, lead.telefone as string, existente.contato_id as string);

      return json({
        ok: true,
        acao: "atualizado",
        sdr_etapa: etapaSdr,
        etapa_crm: etapaMatch?.nome ?? etapaCrm,
        contato_id: existente.contato_id,
        oportunidade_id: existente.id,
      });
    }

    // 2) Ainda não existe → criarLead (contato novo ou update por telefone) + etapa conforme SDR
    const result = await criarLead(admin, {
      origem: ORIGEM,
      nome,
      telefone: lead.telefone as string,
      segmento: segmento,
      etapa: etapaCrm,
      observacoes: resumo ?? motivo,
      responsavel: etapaSdr === "transferido" ? "Comercial" : "SDR",
      metadados: metadadosBase,
    });

    if (result.ignorado) return json({ ok: true, ignorado: true });

    // Garante metadados + etapa correta mesmo se reentrou em opp aberta de outro canal
    if (result.oportunidade_id) {
      const { data: etapasAll } = await admin.from("etapas").select("id, nome").order("ordem");
      const etapasList = (etapasAll ?? []) as Array<{ id: string; nome: string }>;
      const etapaMatch = etapasList.find((e) => normalizeEtapaName(e.nome) === normalizeEtapaName(etapaCrm));

      const { data: opp } = await admin
        .from("oportunidades")
        .select("metadados")
        .eq("id", result.oportunidade_id)
        .maybeSingle();
      const md = { ...((opp?.metadados as Record<string, unknown>) ?? {}), ...metadadosBase };

      const patch: Record<string, unknown> = {
        metadados: md,
        origem: ORIGEM,
        titulo: nome,
        interesse: segmento,
        observacoes: resumo ?? motivo,
        responsavel: etapaSdr === "transferido" ? "Comercial" : "SDR",
      };
      if (etapaMatch) patch.etapa_id = etapaMatch.id;
      if (etapaSdr === "descartado") {
        patch.motivo_perda = motivo || "Não qualificado pelo SDR";
      }
      await admin.from("oportunidades").update(patch).eq("id", result.oportunidade_id);
    }

    if (result.contato_id) {
      await vincularConversa(admin, lead.telefone as string, result.contato_id);
    }

    return json({
      ok: true,
      acao: result.contato_criado ? "criado" : "contato_existente_opp_nova_ou_reuso",
      sdr_etapa: etapaSdr,
      etapa_crm: result.etapa || etapaCrm,
      contato_id: result.contato_id,
      oportunidade_id: result.oportunidade_id,
      contato_criado: result.contato_criado,
    });
  } catch (e) {
    console.error("sdr_sync_error", e);
    return json({ error: String(e) }, 500);
  }
});

async function vincularConversa(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  telefone: string,
  contatoId: string,
) {
  const tel = String(telefone ?? "").replace(/\D/g, "");
  if (tel.length < 8 || !contatoId) return;
  await admin
    .from("conversas")
    .update({ contato_id: contatoId })
    .is("contato_id", null)
    .ilike("telefone", `%${tel.slice(-8)}`);
}
