// CRUD + tick de disparos WhatsApp (templates Meta via Chatwoot Cloud).
//
// O envio espaçado (5–7s) é feito por `tick` (UI polled) ou `disparo-worker` (cron).
// processed_params é PLANO {"1":"Maria"} — envelope {body:...} quebra no Chatwoot 4.1.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const MAX_DEST = 10_000;
const digitos = (s: string) => (s ?? "").replace(/\D/g, "");
const placeholderRe = () => /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

type RawTemplate = {
  name?: string;
  language?: string;
  status?: string;
  category?: string;
  parameter_format?: string;
  components?: Array<{ type?: string; format?: string; text?: string; buttons?: Array<{ url?: string }> }>;
};
type Parsed = {
  name: string;
  language: string;
  category: string | null;
  body_text: string;
  header_text: string | null;
  footer_text: string | null;
  variables: string[];
  supported: boolean;
};
type ChatwootInbox = {
  id?: number;
  channel_type?: string;
  message_templates?: RawTemplate[];
};

function sanitizeParam(value: string): string {
  return value.replace(/[<>"']/g, "").replace(/\s+/g, " ").trim().slice(0, 1000);
}

function extractPlaceholders(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const m of text.matchAll(placeholderRe())) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

function parseTemplate(raw: RawTemplate): Parsed | null {
  const name = raw?.name;
  const language = raw?.language;
  if (!name || !language) return null;
  const components = raw.components ?? [];
  const body = components.find((c) => (c.type ?? "").toUpperCase() === "BODY");
  const header = components.find((c) => (c.type ?? "").toUpperCase() === "HEADER");
  const footer = components.find((c) => (c.type ?? "").toUpperCase() === "FOOTER");
  const body_text = body?.text ?? "";
  if (!body_text.trim()) return null;
  const variables = extractPlaceholders(body_text);
  const headerFormat = (header?.format ?? (header ? "TEXT" : "")).toUpperCase();
  const headerVars = extractPlaceholders(header?.text);
  let supported = true;
  if (header && headerFormat && headerFormat !== "TEXT") supported = false;
  else if (headerVars.length > 0) supported = false;
  return {
    name,
    language,
    category: raw.category ?? null,
    body_text,
    header_text: header?.text ?? null,
    footer_text: footer?.text ?? null,
    variables,
    supported,
  };
}

function renderTemplate(t: Parsed, params: Record<string, string>): string {
  const body = t.body_text.replace(placeholderRe(), (_m, key: string) => {
    const v = params[key];
    return v && v.trim() ? v : `{{${key}}}`;
  });
  return [t.header_text, body, t.footer_text]
    .filter((p) => p && p.trim().length > 0)
    .join("\n\n");
}

function paramsDeEnvio(t: Parsed, valores: string[]) {
  const processed: Record<string, string> = {};
  t.variables.forEach((chave, i) => {
    processed[chave] = sanitizeParam(valores[i] ?? "");
  });
  return {
    conteudo: renderTemplate(t, processed),
    templateParams: {
      name: t.name,
      language: t.language,
      ...(t.category ? { category: t.category } : {}),
      ...(t.variables.length ? { processed_params: processed } : {}),
    },
  };
}

async function fetchInboxes(baseUrl: string, token: string, accountId: number) {
  const resp = await fetch(
    `${baseUrl.replace(/\/$/, "")}/api/v1/accounts/${accountId}/inboxes`,
    { headers: { api_access_token: token } },
  );
  if (!resp.ok) throw new Error(`inboxes_fetch_failed_${resp.status}`);
  const payload = await resp.json();
  return (payload?.payload ?? []) as ChatwootInbox[];
}

function pickWhatsappInbox(inboxes: ChatwootInbox[], inboxId: number | null) {
  const whatsapp = inboxes.filter((i) =>
    (i.channel_type ?? "").toLowerCase().includes("whatsapp")
  );
  if (inboxId != null) return whatsapp.find((i) => i.id === inboxId) ?? null;
  return whatsapp.length === 1 ? whatsapp[0] : null;
}

async function garantirConversa(
  baseUrl: string,
  token: string,
  accountId: number,
  inboxId: number,
  telefone: string,
  nome: string,
): Promise<{ conversationId: number; contactId: number }> {
  const base = baseUrl.replace(/\/$/, "");
  const cabecalho = { api_access_token: token };
  const cabecalhoJson = { ...cabecalho, "Content-Type": "application/json" };
  const fone = digitos(telefone);
  const e164 = `+${fone}`;

  let contactId: number | null = null;
  const busca = await fetch(
    `${base}/api/v1/accounts/${accountId}/contacts/search?q=${encodeURIComponent(fone)}`,
    { headers: cabecalho },
  );
  if (busca.ok) {
    const payload = await busca.json();
    const lista = (payload?.payload ?? []) as Array<{ id?: number; phone_number?: string }>;
    const exato = lista.find((c) => digitos(c.phone_number ?? "") === fone);
    contactId = (exato ?? lista[0])?.id ?? null;
  }

  if (!contactId) {
    const criado = await fetch(`${base}/api/v1/accounts/${accountId}/contacts`, {
      method: "POST",
      headers: cabecalhoJson,
      body: JSON.stringify({ inbox_id: inboxId, name: nome || e164, phone_number: e164 }),
    });
    if (!criado.ok) throw new Error(`contact_create_failed_${criado.status}`);
    const payload = await criado.json();
    contactId = payload?.payload?.contact?.id ?? payload?.payload?.id ?? null;
    if (!contactId) throw new Error("contact_create_failed");
  }

  const conversas = await fetch(
    `${base}/api/v1/accounts/${accountId}/contacts/${contactId}/conversations`,
    { headers: cabecalho },
  );
  if (conversas.ok) {
    const payload = await conversas.json();
    const lista = (payload?.payload ?? []) as Array<{ id?: number; inbox_id?: number; status?: string }>;
    const aberta = lista.find(
      (c) =>
        typeof c.id === "number" &&
        c.inbox_id === inboxId &&
        (c.status ?? "") !== "resolved",
    );
    if (aberta?.id) return { conversationId: aberta.id, contactId };
    const qualquer = lista.find((c) => typeof c.id === "number" && c.inbox_id === inboxId);
    if (qualquer?.id) return { conversationId: qualquer.id, contactId };
  }

  let sourceId: string | null = null;
  const contactInboxes = await fetch(
    `${base}/api/v1/accounts/${accountId}/contacts/${contactId}/contactable_inboxes`,
    { headers: cabecalho },
  );
  if (contactInboxes.ok) {
    const payload = await contactInboxes.json();
    const lista = (payload?.payload ?? []) as Array<{ source_id?: string; inbox?: { id?: number } }>;
    sourceId = lista.find((i) => i.inbox?.id === inboxId)?.source_id ?? null;
  }
  if (!sourceId) sourceId = fone;

  const criada = await fetch(`${base}/api/v1/accounts/${accountId}/conversations`, {
    method: "POST",
    headers: cabecalhoJson,
    body: JSON.stringify({
      source_id: sourceId,
      inbox_id: inboxId,
      contact_id: contactId,
    }),
  });
  if (!criada.ok) throw new Error(`conversation_create_failed_${criada.status}`);
  const payload = await criada.json();
  const id = payload?.id ?? payload?.payload?.id;
  if (!id) throw new Error("conversation_create_failed");
  return { conversationId: Number(id), contactId };
}

async function enviarTemplateNaConversa(
  baseUrl: string,
  token: string,
  accountId: number,
  conversationId: number,
  conteudo: string,
  templateParams: Record<string, unknown>,
): Promise<number | null> {
  const resp = await fetch(
    `${baseUrl.replace(/\/$/, "")}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        api_access_token: token,
      },
      body: JSON.stringify({
        content: conteudo,
        message_type: "outgoing",
        private: false,
        template_params: templateParams,
      }),
    },
  );
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(text.slice(0, 300) || `HTTP ${resp.status}`);
  }
  try {
    const j = JSON.parse(text);
    return typeof j.id === "number" ? j.id : null;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function contarPorStatus(admin: any, disparoId: string) {
  const { data } = await admin
    .from("disparo_destinatarios")
    .select("status")
    .eq("disparo_id", disparoId);
  const base = {
    pendente: 0,
    enviando: 0,
    enviado: 0,
    falhou: 0,
    pulado: 0,
    total: 0,
  };
  for (const row of data ?? []) {
    const s = row.status as keyof typeof base;
    if (s in base && s !== "total") base[s] += 1;
    base.total += 1;
  }
  return base;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function serDisparo(admin: any, row: Record<string, unknown>) {
  const contagem = await contarPorStatus(admin, row.id as string);
  return {
    id: row.id,
    nome: row.nome,
    inbox_id: row.inbox_id,
    template: row.template,
    idioma: row.template_idioma,
    status: row.status,
    arquivo: row.arquivo,
    autor: row.autor_email,
    criado_em: row.criado_em,
    intervalo_min_s: row.intervalo_min_s,
    intervalo_max_s: row.intervalo_max_s,
    publico_tipo: row.publico_tipo,
    iniciado_em: row.iniciado_em,
    concluido_em: row.concluido_em,
    contagem,
  };
}

function intervaloAleatorio(minS: number, maxS: number): number {
  const a = Math.min(minS, maxS);
  const b = Math.max(minS, maxS);
  return a + Math.random() * (b - a);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anon);
  const { data: userData, error: userError } = await userClient.auth.getUser(
    auth.replace("Bearer ", ""),
  );
  if (userError || !userData?.user) return json({ error: "unauthorized" }, 401);
  const userId = userData.user.id;
  const userEmail = userData.user.email ?? null;

  const admin = createClient(supabaseUrl, service);

  const { data: roles } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const isAdmin = (roles ?? []).some((r: { role: string }) =>
    r.role === "admin" || r.role === "super_admin"
  );

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_payload" }, 400);
  }

  const action = String(body.action ?? "list");

  const chatwootUrl = (Deno.env.get("CHATWOOT_URL") ?? "").replace(/\/$/, "");
  const chatwootToken = Deno.env.get("CHATWOOT_TOKEN") ?? "";
  const accountId = Number(Deno.env.get("CHATWOOT_ACCOUNT_ID") ?? "");
  const inboxIdRaw =
    Deno.env.get("CHATWOOT_WHATSAPP_INBOX_ID") ??
    Deno.env.get("CHATWOOT_INBOX_ID") ??
    "";
  const inboxIdPreferido = inboxIdRaw ? Number(inboxIdRaw) : null;

  // ---- list ----
  if (action === "list") {
    const { data, error } = await admin
      .from("disparos")
      .select("*")
      .order("criado_em", { ascending: false })
      .limit(100);
    if (error) return json({ error: error.message }, 500);
    const lista = [];
    for (const row of data ?? []) {
      lista.push(await serDisparo(admin, row));
    }
    return json({ disparos: lista });
  }

  // ---- get ----
  if (action === "get") {
    const id = String(body.id ?? "");
    if (!id) return json({ error: "missing_id" }, 400);
    const { data: row, error } = await admin.from("disparos").select("*").eq("id", id).maybeSingle();
    if (error || !row) return json({ error: "not_found" }, 404);
    const { data: dest } = await admin
      .from("disparo_destinatarios")
      .select("id, nome, telefone, status, erro, conversa_id, enviado_em, variaveis")
      .eq("disparo_id", id)
      .order("id")
      .limit(5000);
    const ser = await serDisparo(admin, row);
    return json({ ...ser, destinatarios: dest ?? [] });
  }

  // ---- criar ----
  if (action === "criar") {
    if (!isAdmin) return json({ error: "forbidden" }, 403);
    const nome = String(body.nome ?? "").trim().slice(0, 120);
    const template = String(body.template ?? "").trim();
    const idioma = String(body.idioma ?? "pt_BR").trim();
    const arquivo = body.arquivo != null ? String(body.arquivo).slice(0, 255) : null;
    const intervaloMin = Number(body.intervalo_min_s ?? 5);
    const intervaloMax = Number(body.intervalo_max_s ?? 7);
    const destinatarios = Array.isArray(body.destinatarios)
      ? (body.destinatarios as Array<{ nome?: string; telefone?: string; variaveis?: string[] }>)
      : [];

    if (!nome || !template) return json({ error: "missing_fields" }, 400);
    if (destinatarios.length === 0) return json({ error: "lista_vazia" }, 400);
    if (destinatarios.length > MAX_DEST) {
      return json({ error: "lista_excede_limite", max: MAX_DEST }, 400);
    }

    if (!chatwootUrl || !chatwootToken || !Number.isFinite(accountId)) {
      return json({ error: "chatwoot_not_configured" }, 500);
    }

    let inboxId = Number(body.inbox_id ?? inboxIdPreferido ?? NaN);
    let resolved: Parsed | null = null;
    try {
      const inboxes = await fetchInboxes(chatwootUrl, chatwootToken, accountId);
      const inbox = pickWhatsappInbox(
        inboxes,
        Number.isFinite(inboxId) ? inboxId : inboxIdPreferido,
      );
      if (!inbox?.id) return json({ error: "inbox_not_found" }, 404);
      inboxId = inbox.id;
      resolved =
        (inbox.message_templates ?? [])
          .filter((t) => (t.status ?? "").toLowerCase() === "approved")
          .map(parseTemplate)
          .filter((t): t is Parsed => t !== null)
          .find(
            (t) =>
              t.name === template &&
              t.language.toLowerCase() === idioma.toLowerCase(),
          ) ?? null;
    } catch (err) {
      return json({ error: "templates_fetch_failed", message: String(err) }, 502);
    }
    if (!resolved) return json({ error: "template_not_found" }, 404);
    if (!resolved.supported) return json({ error: "template_unsupported" }, 400);

    const limpos: Array<{ nome: string; telefone: string; variaveis: string[] }> = [];
    const vistos = new Set<string>();
    for (const d of destinatarios) {
      const n = String(d.nome ?? "").trim();
      const tel = digitos(String(d.telefone ?? ""));
      const vars = Array.isArray(d.variaveis) ? d.variaveis.map((v) => String(v).trim()) : [];
      if (!n || !tel) continue;
      if (vistos.has(tel)) continue;
      if (vars.length !== resolved.variables.length) {
        return json({
          error: "variaveis_mismatch",
          esperado: resolved.variables.length,
          recebido: vars.length,
        }, 400);
      }
      if (vars.some((v) => !v)) return json({ error: "variavel_vazia" }, 400);
      vistos.add(tel);
      limpos.push({ nome: n, telefone: tel, variaveis: vars });
    }
    if (limpos.length === 0) return json({ error: "lista_vazia" }, 400);

    const { data: disparo, error: insErr } = await admin
      .from("disparos")
      .insert({
        nome,
        template,
        template_idioma: resolved.language,
        inbox_id: inboxId,
        status: "rascunho",
        intervalo_min_s: Number.isFinite(intervaloMin) ? intervaloMin : 5,
        intervalo_max_s: Number.isFinite(intervaloMax) ? intervaloMax : 7,
        publico_tipo: "planilha",
        arquivo,
        autor_email: userEmail,
      })
      .select("*")
      .single();
    if (insErr || !disparo) return json({ error: insErr?.message ?? "insert_failed" }, 500);

    const chunks: typeof limpos[] = [];
    for (let i = 0; i < limpos.length; i += 500) {
      chunks.push(limpos.slice(i, i + 500));
    }
    for (const chunk of chunks) {
      const { error: destErr } = await admin.from("disparo_destinatarios").insert(
        chunk.map((d) => ({
          disparo_id: disparo.id,
          nome: d.nome,
          telefone: d.telefone,
          variaveis: d.variaveis,
          status: "pendente",
        })),
      );
      if (destErr) {
        await admin.from("disparos").delete().eq("id", disparo.id);
        return json({ error: destErr.message }, 500);
      }
    }

    return json(await serDisparo(admin, disparo));
  }

  // ---- iniciar ----
  if (action === "iniciar") {
    if (!isAdmin) return json({ error: "forbidden" }, 403);
    const id = String(body.id ?? "");
    if (!id) return json({ error: "missing_id" }, 400);
    const { data: row } = await admin.from("disparos").select("*").eq("id", id).maybeSingle();
    if (!row) return json({ error: "not_found" }, 404);
    if (row.status !== "rascunho" && row.status !== "cancelado") {
      return json({ error: "status_invalido", status: row.status }, 400);
    }
    // Reinício após cancelar: devolve pulados à fila.
    if (row.status === "cancelado") {
      await admin
        .from("disparo_destinatarios")
        .update({ status: "pendente", erro: null })
        .eq("disparo_id", id)
        .eq("status", "pulado");
    }
    const { error } = await admin
      .from("disparos")
      .update({
        status: "enviando",
        iniciado_em: new Date().toISOString(),
        concluido_em: null,
      })
      .eq("id", id);
    if (error) return json({ error: error.message }, 500);
    // Reabre falhas? Não — só pendentes. Cancelados mantêm o que já saiu.
    const { data: updated } = await admin.from("disparos").select("*").eq("id", id).single();
    return json(await serDisparo(admin, updated!));
  }

  // ---- cancelar ----
  if (action === "cancelar") {
    if (!isAdmin) return json({ error: "forbidden" }, 403);
    const id = String(body.id ?? "");
    if (!id) return json({ error: "missing_id" }, 400);
    await admin
      .from("disparo_destinatarios")
      .update({ status: "pulado" })
      .eq("disparo_id", id)
      .eq("status", "pendente");
    await admin
      .from("disparos")
      .update({ status: "cancelado", concluido_em: new Date().toISOString() })
      .eq("id", id);
    const { data: updated } = await admin.from("disparos").select("*").eq("id", id).single();
    return json(await serDisparo(admin, updated!));
  }

  // ---- excluir ----
  if (action === "excluir") {
    if (!isAdmin) return json({ error: "forbidden" }, 403);
    const id = String(body.id ?? "");
    if (!id) return json({ error: "missing_id" }, 400);
    const { data: row } = await admin.from("disparos").select("status").eq("id", id).maybeSingle();
    if (!row) return json({ error: "not_found" }, 404);
    if (row.status === "enviando") {
      return json({ error: "cancele_antes" }, 400);
    }
    const { error } = await admin.from("disparos").delete().eq("id", id);
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ---- tick: envia 1 destinatário se o intervalo permitir ----
  if (action === "tick") {
    if (!isAdmin) return json({ error: "forbidden" }, 403);
    const id = String(body.id ?? "");
    if (!id) return json({ error: "missing_id" }, 400);

    if (!chatwootUrl || !chatwootToken || !Number.isFinite(accountId)) {
      return json({ error: "chatwoot_not_configured" }, 500);
    }

    const { data: disparo } = await admin.from("disparos").select("*").eq("id", id).maybeSingle();
    if (!disparo) return json({ error: "not_found" }, 404);
    if (disparo.status !== "enviando") {
      return json({
        ok: true,
        skipped: true,
        reason: "not_enviando",
        disparo: await serDisparo(admin, disparo),
      });
    }

    const minS = Number(disparo.intervalo_min_s ?? 5);
    const maxS = Number(disparo.intervalo_max_s ?? 7);
    const { data: ultimo } = await admin
      .from("disparo_destinatarios")
      .select("enviado_em")
      .eq("disparo_id", id)
      .not("enviado_em", "is", null)
      .order("enviado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ultimo?.enviado_em) {
      const elapsed = (Date.now() - new Date(ultimo.enviado_em).getTime()) / 1000;
      const precisa = intervaloAleatorio(minS, maxS);
      if (elapsed < minS) {
        return json({
          ok: true,
          skipped: true,
          reason: "intervalo",
          wait_s: Math.ceil(precisa - elapsed),
          disparo: await serDisparo(admin, disparo),
        });
      }
    }

    // Reserva 1 pendente
    const { data: candidatos } = await admin
      .from("disparo_destinatarios")
      .select("id, nome, telefone, variaveis")
      .eq("disparo_id", id)
      .eq("status", "pendente")
      .order("id")
      .limit(1);

    const linha = candidatos?.[0];
    if (!linha) {
      await admin
        .from("disparos")
        .update({ status: "concluido", concluido_em: new Date().toISOString() })
        .eq("id", id);
      const { data: updated } = await admin.from("disparos").select("*").eq("id", id).single();
      return json({
        ok: true,
        done: true,
        disparo: await serDisparo(admin, updated!),
      });
    }

    await admin
      .from("disparo_destinatarios")
      .update({ status: "enviando", reservado_em: new Date().toISOString() })
      .eq("id", linha.id)
      .eq("status", "pendente");

    let template: Parsed | null = null;
    try {
      const inboxes = await fetchInboxes(chatwootUrl, chatwootToken, accountId);
      const inbox = pickWhatsappInbox(inboxes, Number(disparo.inbox_id));
      template =
        (inbox?.message_templates ?? [])
          .filter((t) => (t.status ?? "").toLowerCase() === "approved")
          .map(parseTemplate)
          .filter((t): t is Parsed => t !== null)
          .find(
            (t) =>
              t.name === disparo.template &&
              t.language.toLowerCase() === String(disparo.template_idioma).toLowerCase(),
          ) ?? null;
    } catch (err) {
      await admin
        .from("disparo_destinatarios")
        .update({ status: "falhou", erro: String(err).slice(0, 300) })
        .eq("id", linha.id);
      return json({
        ok: false,
        error: "template_resolve_failed",
        disparo: await serDisparo(admin, disparo),
      });
    }

    if (!template) {
      await admin
        .from("disparo_destinatarios")
        .update({ status: "falhou", erro: "template_indisponivel" })
        .eq("id", linha.id);
      await admin
        .from("disparos")
        .update({ status: "cancelado", concluido_em: new Date().toISOString() })
        .eq("id", id);
      const { data: updated } = await admin.from("disparos").select("*").eq("id", id).single();
      return json({
        ok: false,
        error: "template_not_found",
        disparo: await serDisparo(admin, updated!),
      });
    }

    const valores = Array.isArray(linha.variaveis)
      ? (linha.variaveis as string[]).map(String)
      : [];
    const { conteudo, templateParams } = paramsDeEnvio(template, valores);

    try {
      const { conversationId } = await garantirConversa(
        chatwootUrl,
        chatwootToken,
        accountId,
        Number(disparo.inbox_id),
        linha.telefone,
        linha.nome,
      );
      const msgId = await enviarTemplateNaConversa(
        chatwootUrl,
        chatwootToken,
        accountId,
        conversationId,
        conteudo,
        templateParams,
      );
      await admin
        .from("disparo_destinatarios")
        .update({
          status: "enviado",
          conversa_id: conversationId,
          externo_id: msgId != null ? String(msgId) : null,
          enviado_em: new Date().toISOString(),
          erro: null,
        })
        .eq("id", linha.id);
    } catch (err) {
      await admin
        .from("disparo_destinatarios")
        .update({
          status: "falhou",
          erro: (err instanceof Error ? err.message : String(err)).slice(0, 300),
        })
        .eq("id", linha.id);
    }

    // Conclui se não há mais pendentes
    const contagem = await contarPorStatus(admin, id);
    if (contagem.pendente === 0 && contagem.enviando === 0) {
      await admin
        .from("disparos")
        .update({ status: "concluido", concluido_em: new Date().toISOString() })
        .eq("id", id);
    }

    const { data: updated } = await admin.from("disparos").select("*").eq("id", id).single();
    return json({
      ok: true,
      enviado: true,
      disparo: await serDisparo(admin, updated!),
    });
  }

  return json({ error: "unknown_action", action }, 400);
});
