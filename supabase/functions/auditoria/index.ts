// Auditoria automática do CRM ("empresa de 1 homem só").
// Roda por cron (?secret=AGENDA_SYNC_SECRET) e checa:
//   1. site        — páginas no ar (HTTP 200)
//   2. entradas    — formulários do site recebendo (staleness + volume 24h)
//   3. meta        — leads do Meta que não entraram no CRM (por formulário)
//   4. movimentacoes — atividade do pipeline (criados 24h, leads parados)
// Grava cada resultado em `auditorias` e, se houver alerta, envia WhatsApp
// para ALERTA_WHATSAPP_CHATID via WAHA.
//
// ?dryRun=1 retorna o resultado sem gravar/alertar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const PAGINAS_SITE = [
  "https://www.instagram.com/suaempresa/",
  "https://site.example.com/",
];

const AGENDA_CAL = Deno.env.get("AGENDA_CALENDAR_ID") ?? "agenda@empresa.example.com";

type Check = { tipo: string; status: "ok" | "alerta"; resumo: string; detalhes: Record<string, unknown> };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// Access token do Google (mesma lógica do google-calendar-sync/agenda-sync).
async function tokenGoogle(admin: Admin): Promise<string | null> {
  const { data: cred } = await admin.from("google_credentials").select("*").eq("id", 1).maybeSingle();
  if (!cred) return null;
  const exp = cred.access_token_expires_at ? new Date(cred.access_token_expires_at) : null;
  if (exp && exp.getTime() - Date.now() > 60_000 && cred.access_token) return cred.access_token;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: cred.refresh_token,
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  await admin.from("google_credentials").update({
    access_token: j.access_token,
    access_token_expires_at: new Date(Date.now() + j.expires_in * 1000).toISOString(),
  }).eq("id", 1);
  return j.access_token;
}

// Confere se os eventos da agenda do Google viraram oportunidade no CRM (agenda-sync ok).
async function checarAgendamentos(admin: Admin): Promise<Check> {
  const token = await tokenGoogle(admin);
  if (!token) return { tipo: "agendamento", status: "ok", resumo: "Google Calendar não conectado", detalhes: {} };
  const timeMin = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  const qs = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", maxResults: "100", timeMin, timeMax, eventTypes: "default" });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(AGENDA_CAL)}/events?${qs}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return { tipo: "agendamento", status: "alerta", resumo: "erro ao ler a agenda do Google", detalhes: { detail: (await res.text()).slice(0, 200) } };
  const data = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eventos: any[] = (data.items ?? []).filter((e: any) => e.start && (e.start.dateTime || e.start.date));
  // só considera eventos criados há mais de 5 min (dá tempo do agenda-sync rodar)
  const corte = Date.now() - 5 * 60 * 1000;
  const naoSync: string[] = [];
  for (const e of eventos) {
    if (e.created && new Date(e.created).getTime() > corte) continue;
    // checa o LEDGER de eventos (1 linha por google_event_id). Não usar
    // oportunidades: com "uma oportunidade por contato", vários eventos de um
    // mesmo contato colapsam numa opp só (que guarda 1 google_event_id), e os
    // demais apareceriam como "não sincronizados" (alarme falso).
    const { count } = await admin.from("calendario_eventos").select("google_event_id", { count: "exact", head: true }).eq("google_event_id", e.id);
    if (!count) naoSync.push(e.summary ?? e.id);
  }
  return naoSync.length
    ? { tipo: "agendamento", status: "alerta", resumo: `${naoSync.length} agendamento(s) da agenda não entraram no CRM`, detalhes: { nao_sincronizados: naoSync.slice(0, 20), total: eventos.length } }
    : { tipo: "agendamento", status: "ok", resumo: `${eventos.length} agendamento(s) na agenda, todos no CRM`, detalhes: { total: eventos.length } };
}

async function checarSite(): Promise<Check> {
  const fora: string[] = [];
  await Promise.all(
    PAGINAS_SITE.map(async (u) => {
      try {
        const r = await fetch(u, { method: "GET", redirect: "follow" });
        if (!r.ok) fora.push(`${u} (${r.status})`);
      } catch {
        fora.push(`${u} (sem resposta)`);
      }
    }),
  );
  return fora.length
    ? { tipo: "site", status: "alerta", resumo: `${fora.length} página(s) fora do ar`, detalhes: { fora } }
    : { tipo: "site", status: "ok", resumo: `${PAGINAS_SITE.length} páginas no ar`, detalhes: {} };
}

async function checarEntradas(admin: Admin): Promise<Check> {
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: total24 } = await admin
    .from("entradas_log").select("id", { count: "exact", head: true })
    .eq("canal", "site").gte("criado_em", desde);
  const { data: ultima } = await admin
    .from("entradas_log").select("criado_em").eq("canal", "site")
    .order("criado_em", { ascending: false }).limit(1).maybeSingle();
  const horasSemLead = ultima
    ? Math.round((Date.now() - new Date(ultima.criado_em).getTime()) / 3600000)
    : null;
  // Só alerta se JÁ houve entradas e a última passou de 48h (sem histórico = ok, não alarme).
  const alerta = horasSemLead !== null && horasSemLead > 48;
  return {
    tipo: "entradas",
    status: alerta ? "alerta" : "ok",
    resumo: horasSemLead === null
      ? "Nenhuma entrada do site registrada ainda"
      : alerta
        ? `Sem entradas do site há ${horasSemLead}h`
        : `${total24 ?? 0} entradas nas últimas 24h`,
    detalhes: { total_24h: total24 ?? 0, horas_sem_lead: horasSemLead },
  };
}

// Leads que entraram pelo Instagram (Linktree → WhatsApp com frase de ativação).
async function checarInstagram(admin: Admin): Promise<Check> {
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await admin
    .from("entradas_log").select("id", { count: "exact", head: true })
    .eq("canal", "instagram").gte("criado_em", desde);
  const total = count ?? 0;
  return {
    tipo: "instagram",
    status: "ok",
    resumo: total > 0 ? `${total} lead(s) do Instagram nas últimas 24h` : "Sem leads do Instagram nas últimas 24h",
    detalhes: { total_24h: total },
  };
}

async function checarMeta(admin: Admin): Promise<Check> {
  const token = Deno.env.get("META_PAGE_ACCESS_TOKEN");
  const ver = Deno.env.get("META_GRAPH_VERSION") ?? "v21.0";
  const pageId = Deno.env.get("META_PAGE_ID") ?? "393102414069269";
  const horas = Number(Deno.env.get("META_RECONCILE_HORAS") ?? "24");
  if (!token) return { tipo: "meta", status: "ok", resumo: "Meta não configurado", detalhes: {} };

  // O token do Usuário do Sistema não serve direto para endpoints de PÁGINA
  // (leadgen_forms). Derivamos o Page Access Token a partir dele.
  let pageToken = token;
  try {
    const ptRes = await fetch(`https://graph.facebook.com/${ver}/${pageId}?fields=access_token&access_token=${encodeURIComponent(token)}`);
    const ptJson = await ptRes.json();
    if (ptJson?.access_token) pageToken = ptJson.access_token;
  } catch { /* mantém o token original como fallback */ }

  // 1) lista os formulários de Lead Ads da página (central do Meta)
  const fr = await fetch(`https://graph.facebook.com/${ver}/${pageId}/leadgen_forms?fields=id,name,status,leads_count&limit=100&access_token=${encodeURIComponent(pageToken)}`);
  const fj = await fr.json();
  if (!fr.ok || !Array.isArray(fj.data)) {
    const code = fj?.error?.code;
    const msg = fj?.error?.message ?? "desconhecido";
    // Token válido, mas sem pages_manage_ads: a captação (busca de lead por id)
    // continua funcionando; só a LISTAGEM de formulários fica indisponível.
    // Isso não é motivo de alarme vermelho — só a reconciliação fica parcial.
    if (code === 200 || /pages_manage_ads/i.test(msg)) {
      return { tipo: "meta", status: "ok", resumo: "Meta conectado (captação ativa) — reconciliação de formulários requer permissão pages_manage_ads", detalhes: { aviso: msg } };
    }
    // Token inválido/expirado (ex.: code 190): aí sim é alarme de verdade.
    return { tipo: "meta", status: "alerta", resumo: "Não foi possível consultar a central de leads do Meta", detalhes: { erro: msg } };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const forms = fj.data.filter((f: any) => f.status === "ACTIVE" && (f.leads_count ?? 0) > 0);

  const desdeMs = Date.now() - horas * 3600 * 1000;
  let recentes = 0;
  const faltando: Array<{ form: string; id: string; nome?: string }> = [];

  for (const f of forms) {
    try {
      const lr = await fetch(`https://graph.facebook.com/${ver}/${f.id}/leads?fields=id,created_time,field_data&limit=50&access_token=${encodeURIComponent(pageToken)}`);
      const lj = await lr.json();
      if (!lr.ok || !Array.isArray(lj.data)) continue;
      for (const lead of lj.data) {
        const ct = lead.created_time ? new Date(lead.created_time).getTime() : 0;
        if (ct < desdeMs) break; // leads vêm do mais novo p/ o mais antigo
        recentes++;
        const { count } = await admin
          .from("entradas_log").select("id", { count: "exact", head: true })
          .eq("canal", "meta").filter("payload->lead->>id", "eq", String(lead.id));
        if (!count) {
          // Não está no entradas_log — mas pode ter sido IGNORADO de propósito
          // (cliente já ativo / já é cliente ativo). Nesse caso não é lead
          // perdido: confere o telefone/e-mail do lead contra a blocklist.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fd: any[] = lead.field_data ?? [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const campo = (rx: RegExp) => fd.find((x: any) => rx.test(x.name))?.values?.[0] as string | undefined;
          const tel = (campo(/telefone|phone|celular|whatsapp/i) ?? "").replace(/\D/g, "");
          const email = (campo(/email|e-mail/i) ?? "").toLowerCase().trim();
          let ehMatriculado = false;
          if (tel.length >= 8) {
            const { count: tc } = await admin
              .from("telefones_matriculados").select("id", { count: "exact", head: true }).eq("sufixo8", tel.slice(-8));
            if (tc) ehMatriculado = true;
          }
          if (!ehMatriculado && email) {
            const { count: ec } = await admin
              .from("emails_matriculados").select("id", { count: "exact", head: true }).eq("email", email);
            if (ec) ehMatriculado = true;
          }
          if (!ehMatriculado) {
            const nomeCampo = fd.find((x: { name: string }) => /nome|name/i.test(x.name));
            faltando.push({ form: f.name, id: lead.id, nome: nomeCampo?.values?.[0] });
          }
        }
      }
    } catch { /* ignora form com erro */ }
  }

  return faltando.length
    ? { tipo: "meta", status: "alerta", resumo: `${faltando.length} lead(s) do Meta (últimas ${horas}h) NÃO entraram no CRM`, detalhes: { faltando: faltando.slice(0, 30), formularios_ativos: forms.length } }
    : { tipo: "meta", status: "ok", resumo: recentes > 0 ? `${recentes} lead(s) do Meta (últimas ${horas}h) conferidos, todos no CRM` : `Sem leads novos no Meta nas últimas ${horas}h`, detalhes: { formularios_ativos: forms.length, leads_recentes: recentes } };
}

// Verifica se o comercial está recebendo avisos no chat quando entra
// lead/agendamento. As notificações chegam do número notificador (WAHA).
async function checarAvisos(admin: Admin): Promise<Check> {
  const tel = Deno.env.get("AVISO_SECRETARIA_TELEFONE") ?? "5521974316094";
  const d1 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { data: conv } = await admin
    .from("conversas").select("id").ilike("telefone", `%${tel}%`).limit(1).maybeSingle();
  let avisos = 0;
  if (conv) {
    const { count } = await admin
      .from("mensagens").select("id", { count: "exact", head: true })
      .eq("conversa_id", conv.id).eq("direcao", "entrada").gte("criado_em", d1);
    avisos = count ?? 0;
  }

  const { count: entradas } = await admin
    .from("entradas_log").select("id", { count: "exact", head: true })
    .in("canal", ["site", "meta", "instagram"]).gte("criado_em", d1);
  const { count: agendamentos } = await admin
    .from("oportunidades").select("id", { count: "exact", head: true })
    .ilike("origem", "Agenda%").gte("criado_em", d1);
  const novos = (entradas ?? 0) + (agendamentos ?? 0);

  const alerta = novos > 0 && avisos === 0;
  return {
    tipo: "avisos",
    status: alerta ? "alerta" : "ok",
    resumo: alerta
      ? `Entrou lead/agendamento mas NENHUM aviso chegou no 0277 (24h)`
      : `${avisos} aviso(s) recebido(s) no 0277 nas últimas 24h`,
    detalhes: { novos_24h: novos, avisos_24h: avisos, entradas: entradas ?? 0, agendamentos: agendamentos ?? 0, conversa_avisos: !!conv },
  };
}

async function checarMovimentacoes(admin: Admin): Promise<Check> {
  const d1 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: criados24 } = await admin
    .from("oportunidades").select("id", { count: "exact", head: true }).gte("criado_em", d1);
  // parados: sem atualização há 7+ dias e não ganho/perdido (best-effort por atualizado_em)
  const d7 = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { count: parados } = await admin
    .from("oportunidades").select("id", { count: "exact", head: true }).lt("atualizado_em", d7);
  return {
    tipo: "movimentacoes",
    status: "ok",
    resumo: `${criados24 ?? 0} criadas em 24h · ${parados ?? 0} sem movimento há 7+ dias`,
    detalhes: { criados_24h: criados24 ?? 0, parados_7d: parados ?? 0 },
  };
}

/** Sessão WhatsApp do dia a dia (provedor HTTP). */
async function checarWhatsapp(): Promise<Check> {
  const wahaUrl = (Deno.env.get("WAHA_URL") ?? "").replace(/\/$/, "");
  const wahaKey = Deno.env.get("WAHA_API_KEY") ?? "";
  const session = Deno.env.get("WAHA_SESSION") ?? "default";
  if (!wahaUrl || !wahaKey) {
    return {
      tipo: "whatsapp",
      status: "alerta",
      resumo: "WhatsApp comercial sem configuração no servidor",
      detalhes: { configurado: false },
    };
  }
  try {
    const r = await fetch(`${wahaUrl}/api/sessions/${encodeURIComponent(session)}`, {
      headers: { "X-Api-Key": wahaKey },
    });
    const body = await r.json().catch(() => ({})) as { status?: string; me?: { id?: string } };
    const status = String(body?.status ?? (r.ok ? "UNKNOWN" : "FAILED"));
    const ok = /WORKING|ONLINE|AUTHENTICATED/i.test(status);
    return {
      tipo: "whatsapp",
      status: ok ? "ok" : "alerta",
      resumo: ok
        ? `Sessão online${body?.me?.id ? ` · ${body.me.id}` : ""}`
        : `Sessão ${status} — reconecte no Chat`,
      detalhes: { status, http: r.status },
    };
  } catch (e) {
    return {
      tipo: "whatsapp",
      status: "alerta",
      resumo: "Não foi possível falar com o provedor WhatsApp",
      detalhes: { e: String(e) },
    };
  }
}

/** Templates oficiais (Meta) + falhas recentes de disparo. */
async function checarDisparos(admin: Admin): Promise<Check> {
  const chatwootUrl = (Deno.env.get("CHATWOOT_URL") ?? "").replace(/\/$/, "");
  const token = Deno.env.get("CHATWOOT_TOKEN") ?? "";
  const accountId = Deno.env.get("CHATWOOT_ACCOUNT_ID") ?? "";
  const inboxId = Deno.env.get("CHATWOOT_WHATSAPP_INBOX_ID") ?? Deno.env.get("CHATWOOT_INBOX_ID") ?? "";

  let templatesOk: boolean | null = null;
  let templatesDetalhe = "não checado";
  if (chatwootUrl && token && accountId) {
    try {
      const r = await fetch(`${chatwootUrl}/api/v1/accounts/${accountId}/inboxes`, {
        headers: { api_access_token: token },
      });
      if (!r.ok) {
        templatesOk = false;
        templatesDetalhe = `API oficial HTTP ${r.status}`;
      } else {
        const payload = await r.json();
        const lista = (payload?.payload ?? []) as Array<{
          id?: number;
          channel_type?: string;
          message_templates?: unknown[];
        }>;
        const wa = inboxId
          ? lista.find((i) => String(i.id) === String(inboxId))
          : lista.find((i) => (i.channel_type ?? "").toLowerCase().includes("whatsapp"));
        const n = wa?.message_templates?.length ?? 0;
        templatesOk = !!wa && n >= 0;
        templatesDetalhe = wa
          ? `Inbox #${wa.id} · ${n} template(s)`
          : "Inbox WhatsApp oficial não encontrado";
        if (!wa) templatesOk = false;
      }
    } catch (e) {
      templatesOk = false;
      templatesDetalhe = String(e);
    }
  } else {
    templatesOk = false;
    templatesDetalhe = "Templates oficiais sem configuração";
  }

  const d1 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: falhas } = await admin
    .from("disparo_destinatarios")
    .select("id", { count: "exact", head: true })
    .eq("status", "falhou")
    .gte("enviado_em", d1);
  // falhas sem enviado_em (acabou de falhar)
  const { count: falhasPend } = await admin
    .from("disparo_destinatarios")
    .select("id", { count: "exact", head: true })
    .eq("status", "falhou")
    .gte("reservado_em", d1);

  const nFalhas = Math.max(falhas ?? 0, falhasPend ?? 0);
  const alerta = templatesOk === false || nFalhas > 10;
  return {
    tipo: "disparos",
    status: alerta ? "alerta" : "ok",
    resumo: templatesOk === false
      ? `Templates: ${templatesDetalhe}`
      : `${templatesDetalhe} · ${nFalhas} falha(s) de disparo/24h`,
    detalhes: { templates_ok: templatesOk, templates: templatesDetalhe, falhas_24h: nFalhas },
  };
}

async function enviarWhatsapp(texto: string) {
  const chatId = Deno.env.get("ALERTA_WHATSAPP_CHATID");
  const wahaUrl = (Deno.env.get("WAHA_URL") ?? "").replace(/\/$/, "");
  const wahaKey = Deno.env.get("WAHA_API_KEY") ?? "";
  const session = Deno.env.get("ALERTA_WAHA_SESSION") ?? Deno.env.get("WAHA_SESSION") ?? "default";
  if (!chatId || !wahaUrl || !wahaKey) return;
  await fetch(`${wahaUrl}/api/sendText`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Api-Key": wahaKey },
    body: JSON.stringify({ session, chatId, text: texto }),
  }).catch(() => {});
}

const ROTULO: Record<string, string> = {
  site: "Site no ar",
  entradas: "Formulários (site)",
  instagram: "Instagram",
  meta: "Meta × CRM",
  agendamento: "Agendamentos",
  avisos: "Avisos comerciais",
  movimentacoes: "Movimentações",
  whatsapp: "WhatsApp comercial",
  disparos: "Templates / Disparos",
};
const agora = () =>
  new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
const linhaCheck = (c: Check) =>
  `${c.status === "alerta" ? "🔴" : "🟢"} *${ROTULO[c.tipo] ?? c.tipo}*\n     ${c.resumo}`;

// Alerta apenas quando há problema (cron de 15 min).
async function alertarWhatsapp(checks: Check[]) {
  const alertas = checks.filter((c) => c.status === "alerta");
  if (!alertas.length) return;
  const txt =
    `🔴 *Sistema CRM · ALERTA*\n` +
    `🗓 ${agora()}\n` +
    `━━━━━━━━━━━━━━━\n\n` +
    alertas.map(linhaCheck).join("\n\n") +
    `\n\n_Confira em /admin/saude._`;
  await enviarWhatsapp(txt);
}

// Resumo de saúde (heartbeat de 1h) — manda mesmo com tudo OK.
async function enviarResumo(checks: Check[]) {
  const nAlertas = checks.filter((c) => c.status === "alerta").length;
  const cab = nAlertas ? "🩺 *Sistema CRM · Saúde dos serviços*" : "🩺 *Sistema CRM · Saúde dos serviços*";
  const rodape = nAlertas
    ? `\n\n⚠️ _${nAlertas} ponto(s) de atenção — confira em /admin/saude._`
    : `\n\n✅ _Tudo operando normalmente._`;
  const txt = `${cab}\n🗓 ${agora()}\n━━━━━━━━━━━━━━━\n\n${checks.map(linhaCheck).join("\n\n")}${rodape}`;
  await enviarWhatsapp(txt);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  // Autoriza por secret (cron) OU por JWT de super_admin (botão "rodar agora").
  let autorizado = secret === Deno.env.get("AGENDA_SYNC_SECRET");
  if (!autorizado) {
    const auth = req.headers.get("Authorization");
    if (auth?.startsWith("Bearer ")) {
      const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: u } = await uc.auth.getUser(auth.replace("Bearer ", ""));
      if (u?.user) {
        const adminC = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data: roles } = await adminC.from("user_roles").select("role").eq("user_id", u.user.id);
        autorizado = (roles ?? []).some((r: { role: string }) => r.role === "super_admin");
      }
    }
  }
  if (!autorizado) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const dryRun = url.searchParams.get("dryRun") === "1";
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const checks: Check[] = [];
  try { checks.push(await checarSite()); } catch (e) { checks.push({ tipo: "site", status: "alerta", resumo: "erro na checagem", detalhes: { e: String(e) } }); }
  try { checks.push(await checarEntradas(admin)); } catch (e) { checks.push({ tipo: "entradas", status: "alerta", resumo: "erro na checagem", detalhes: { e: String(e) } }); }
  try { checks.push(await checarInstagram(admin)); } catch (e) { checks.push({ tipo: "instagram", status: "alerta", resumo: "erro na checagem", detalhes: { e: String(e) } }); }
  try { checks.push(await checarMeta(admin)); } catch (e) { checks.push({ tipo: "meta", status: "alerta", resumo: "erro na checagem", detalhes: { e: String(e) } }); }
  try { checks.push(await checarAgendamentos(admin)); } catch (e) { checks.push({ tipo: "agendamento", status: "alerta", resumo: "erro na checagem", detalhes: { e: String(e) } }); }
  try { checks.push(await checarAvisos(admin)); } catch (e) { checks.push({ tipo: "avisos", status: "alerta", resumo: "erro na checagem", detalhes: { e: String(e) } }); }
  try { checks.push(await checarMovimentacoes(admin)); } catch (e) { checks.push({ tipo: "movimentacoes", status: "alerta", resumo: "erro na checagem", detalhes: { e: String(e) } }); }
  try { checks.push(await checarWhatsapp()); } catch (e) { checks.push({ tipo: "whatsapp", status: "alerta", resumo: "erro na checagem", detalhes: { e: String(e) } }); }
  try { checks.push(await checarDisparos(admin)); } catch (e) { checks.push({ tipo: "disparos", status: "alerta", resumo: "erro na checagem", detalhes: { e: String(e) } }); }

  const resumo = url.searchParams.get("resumo") === "1";
  if (!dryRun) {
    await admin.from("auditorias").insert(checks);
    if (resumo) await enviarResumo(checks);   // heartbeat 1h (sempre)
    else await alertarWhatsapp(checks);        // 15 min (só problemas)
  }
  return new Response(JSON.stringify({ ok: true, checks }, null, 2), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
