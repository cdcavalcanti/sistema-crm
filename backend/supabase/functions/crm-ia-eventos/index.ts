// Automações mínimas por EVENTO (cron + secret), no mesmo CRM.
// - Sem resposta no prazo: cria tarefa de follow-up. NÃO envia mensagem.
// - Negócio sem atividade há N dias: marca metadados.ia_esfriou; se o tenant
//   tiver campanha aprovada, entra na fila (metadados.ia_fila_campanha). Sem disparo.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") ?? req.headers.get("x-crm-ia-secret");
  const expected = Deno.env.get("AGENDA_SYNC_SECRET") ?? Deno.env.get("CRM_IA_EVENTOS_SECRET");
  if (!expected || secret !== expected) return json({ error: "unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: cfg } = await admin.from("ia_tenant_config").select("*").eq("id", true).maybeSingle();
  const prazoH = cfg?.prazo_sem_resposta_horas ?? 24;
  const diasFrio = cfg?.dias_sem_atividade ?? 7;
  const campanhaOk = cfg?.campanha_fria_aprovada === true;

  const agora = Date.now();
  const corteResposta = new Date(agora - prazoH * 3600_000).toISOString();
  const corteFrio = new Date(agora - diasFrio * 86_400_000).toISOString();

  const { data: convs } = await admin
    .from("conversas")
    .select("id, contato_id, ultimo_em, ultima_msg")
    .lt("ultimo_em", corteResposta)
    .limit(300);

  let followups = 0;
  for (const c of convs ?? []) {
    const { data: last } = await admin
      .from("mensagens")
      .select("id, direcao, criado_em")
      .eq("conversa_id", c.id)
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!last || last.direcao !== "out") continue;

    const { data: opps } = await admin
      .from("oportunidades")
      .select("id, titulo, etapa:etapas(tipo)")
      .eq("contato_id", c.contato_id)
      .limit(5);
    const aberta = (opps ?? []).find((o: { etapa?: { tipo?: string } }) => o.etapa?.tipo !== "ganho" && o.etapa?.tipo !== "perdido");
    if (!aberta) continue;

    const { data: ja } = await admin
      .from("tarefas")
      .select("id")
      .eq("oportunidade_id", aberta.id)
      .contains("metadados", { ia_followup: true })
      .in("status", ["aberta", "em_andamento"])
      .limit(1);
    if (ja?.length) continue;

    const due = new Date(agora + 24 * 3600_000).toISOString();
    const { error } = await admin.from("tarefas").insert({
      titulo: `Follow-up automático: sem resposta em ${prazoH}h`,
      descricao: "Criado por evento do CRM. A IA não enviou mensagem.",
      status: "aberta",
      prioridade: "media",
      due_date: due,
      oportunidade_id: aberta.id,
      contato_id: c.contato_id,
      metadados: { ia_followup: true, conversa_id: c.id },
    });
    if (!error) followups += 1;
  }

  const { data: opps } = await admin
    .from("oportunidades")
    .select("id, titulo, atualizado_em, metadados, etapa:etapas(tipo)")
    .lt("atualizado_em", corteFrio)
    .limit(400);

  let esfriou = 0;
  let filaCampanha = 0;
  for (const o of opps ?? []) {
    if (o.etapa?.tipo === "ganho" || o.etapa?.tipo === "perdido") continue;
    const md = (o.metadados ?? {}) as Record<string, unknown>;
    if (md.ia_esfriou === true && (!campanhaOk || md.ia_fila_campanha === true)) continue;
    const next = {
      ...md,
      ia_esfriou: true,
      ia_esfriou_em: new Date().toISOString(),
      ...(campanhaOk ? { ia_fila_campanha: true } : {}),
    };
    await admin.from("oportunidades").update({ metadados: next }).eq("id", o.id);
    esfriou += 1;
    if (campanhaOk) filaCampanha += 1;
  }

  await admin.from("ia_consultas").insert({
    user_id: null,
    modo: "evento",
    provider: "deterministico",
    modelo: "crm-ia-eventos",
    pergunta: "tick",
    resposta: JSON.stringify({ followups, esfriou, filaCampanha, prazoH, diasFrio, campanhaOk }),
  });

  return json({ ok: true, followups, esfriou, filaCampanha, prazoH, diasFrio, campanhaOk });
});
