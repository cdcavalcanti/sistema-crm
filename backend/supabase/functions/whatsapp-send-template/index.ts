// Envia template WhatsApp aprovado (Meta) via Chatwoot Cloud API.
//
// O chat 1:1 cotidiano do Sistema CRM é WAHA; templates oficiais precisam da
// inbox WhatsApp Cloud no Chatwoot. Esta função:
//   1) garante contato + conversa no Chatwoot (pelo telefone da conversa CRM)
//   2) re-resolve o template no servidor (não confia no browser)
//   3) envia com template_params
//   4) espelha o texto renderizado em public.mensagens (histórico do chat CRM)
//
// ARQUIVO AUTOCONTIDO: cópia de src/lib/whatsappTemplates.ts embutida.
// Mexeu lá, replique em whatsapp-templates também.
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

type TemplateRequest = {
  name: string;
  language: string;
  params: Record<string, string>;
};

// ===================== cópia: src/lib/whatsappTemplates.ts =====================
type RawTemplateButton = { type?: string; text?: string; url?: string };
type RawTemplateComponent = {
  type?: string;
  format?: string;
  text?: string;
  buttons?: RawTemplateButton[];
};
type RawTemplate = {
  name?: string;
  language?: string;
  status?: string;
  category?: string;
  parameter_format?: string;
  components?: RawTemplateComponent[];
};
type UnsupportedReason = "media_header" | "header_variables" | "button_variables";
type ParsedTemplate = {
  name: string;
  language: string;
  category: string | null;
  named: boolean;
  header_text: string | null;
  body_text: string;
  footer_text: string | null;
  buttons: string[];
  variables: string[];
  supported: boolean;
  unsupported_reason: UnsupportedReason | null;
};
type ChatwootInbox = {
  id?: number;
  name?: string;
  channel_type?: string;
  message_templates?: RawTemplate[];
};

const placeholderRe = () => /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
const digitos = (s: string) => (s ?? "").replace(/\D/g, "");

function extractPlaceholders(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const m of text.matchAll(placeholderRe())) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

function sanitizeParam(value: string): string {
  return value.replace(/[<>"']/g, "").replace(/\s+/g, " ").trim().slice(0, 1000);
}

function findComponent(
  components: RawTemplateComponent[],
  type: string,
): RawTemplateComponent | undefined {
  return components.find((c) => (c.type ?? "").toUpperCase() === type);
}

function parseTemplate(raw: RawTemplate): ParsedTemplate | null {
  const name = raw?.name;
  const language = raw?.language;
  if (!name || !language) return null;

  const components = raw.components ?? [];
  const header = findComponent(components, "HEADER");
  const body = findComponent(components, "BODY");
  const footer = findComponent(components, "FOOTER");
  const buttonsComponent = findComponent(components, "BUTTONS");

  const body_text = body?.text ?? "";
  if (!body_text.trim()) return null;

  const variables = extractPlaceholders(body_text);
  const headerFormat = (header?.format ?? (header ? "TEXT" : "")).toUpperCase();
  const headerVariables = extractPlaceholders(header?.text);
  const buttons = buttonsComponent?.buttons ?? [];

  const named = (raw.parameter_format ?? "").toUpperCase() === "NAMED" ||
    variables.some((v) => !/^\d+$/.test(v));

  let supported = true;
  let unsupported_reason: UnsupportedReason | null = null;
  if (header && headerFormat && headerFormat !== "TEXT") {
    supported = false;
    unsupported_reason = "media_header";
  } else if (headerVariables.length > 0) {
    supported = false;
    unsupported_reason = "header_variables";
  } else if (buttons.some((b) => extractPlaceholders(b.url).length > 0)) {
    supported = false;
    unsupported_reason = "button_variables";
  }

  return {
    name,
    language,
    category: raw.category ?? null,
    named,
    header_text: header?.text ?? null,
    body_text,
    footer_text: footer?.text ?? null,
    buttons: buttons.map((b) => b.text ?? "").filter(Boolean),
    variables,
    supported,
    unsupported_reason,
  };
}

function loadAllowlist(): string[] {
  const raw = Deno.env.get("WHATSAPP_TEMPLATE_ALLOWLIST") ?? "";
  return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

async function loadCampanhaTemplateNome(
  // deno-lint-ignore no-explicit-any
  admin: any,
): Promise<string | null> {
  const { data } = await admin
    .from("remarketing_campanha")
    .select("ativo, template_nome")
    .eq("id", true)
    .maybeSingle();
  if (!data?.ativo || !data?.template_nome) return null;
  return String(data.template_nome);
}

function approvedTemplates(
  inbox: ChatwootInbox,
  extraAllowed: string[] = [],
): ParsedTemplate[] {
  const allowlist = [...loadAllowlist(), ...extraAllowed.map((s) => s.trim().toLowerCase())];
  const allowed = (name: string) => {
    if (allowlist.length === 0) return true;
    const n = name.trim().toLowerCase();
    return allowlist.some((a) => a === n);
  };
  return (inbox.message_templates ?? [])
    .filter((t) => (t.status ?? "").toLowerCase() === "approved")
    .map(parseTemplate)
    .filter((t): t is ParsedTemplate => t !== null)
    .filter((t) => allowed(t.name));
}

function renderTemplate(
  template: ParsedTemplate,
  params: Record<string, string>,
): string {
  const body = template.body_text.replace(
    placeholderRe(),
    (_match, key: string) => {
      const value = params[key];
      return value && value.trim() ? value : `{{${key}}}`;
    },
  );
  return [template.header_text, body, template.footer_text]
    .filter((part) => part && part.trim().length > 0)
    .join("\n\n");
}

function pickWhatsappInbox(
  inboxes: ChatwootInbox[],
  inboxId: number | null,
): ChatwootInbox | null {
  const whatsapp = inboxes.filter((i) =>
    (i.channel_type ?? "").toLowerCase().includes("whatsapp")
  );
  if (inboxId != null) {
    return whatsapp.find((i) => i.id === inboxId) ?? null;
  }
  return whatsapp.length === 1 ? whatsapp[0] : null;
}

async function fetchInboxes(
  baseUrl: string,
  token: string,
  accountId: number,
): Promise<ChatwootInbox[]> {
  const endpoint =
    `${baseUrl.replace(/\/$/, "")}/api/v1/accounts/${accountId}/inboxes`;
  const resp = await fetch(endpoint, { headers: { api_access_token: token } });
  if (!resp.ok) throw new Error(`inboxes_fetch_failed_${resp.status}`);
  const payload = await resp.json();
  return (payload?.payload ?? []) as ChatwootInbox[];
}

/**
 * Procura contato pelo telefone, reaproveita conversa na inbox Cloud e só
 * cria nova em último caso.
 */
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
    const lista = (payload?.payload ?? []) as Array<
      { id?: number; phone_number?: string }
    >;
    const exato = lista.find((c) => digitos(c.phone_number ?? "") === fone);
    contactId = (exato ?? lista[0])?.id ?? null;
  }

  if (!contactId) {
    const criado = await fetch(`${base}/api/v1/accounts/${accountId}/contacts`, {
      method: "POST",
      headers: cabecalhoJson,
      body: JSON.stringify({
        inbox_id: inboxId,
        name: nome || e164,
        phone_number: e164,
      }),
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
    const lista = (payload?.payload ?? []) as Array<
      { id?: number; inbox_id?: number }
    >;
    const daInbox = lista
      .filter((c) =>
        typeof c.id === "number" &&
        (c.inbox_id === inboxId || c.inbox_id == null)
      )
      .map((c) => c.id as number);
    if (daInbox.length > 0) {
      return { conversationId: Math.max(...daInbox), contactId };
    }
  }

  let sourceId: string | null = null;
  const contactInboxes = await fetch(
    `${base}/api/v1/accounts/${accountId}/contacts/${contactId}/contactable_inboxes`,
    { headers: cabecalho },
  );
  if (contactInboxes.ok) {
    const payload = await contactInboxes.json();
    const lista = (payload?.payload ?? []) as Array<
      { source_id?: string; inbox?: { id?: number } }
    >;
    sourceId = lista.find((i) => i.inbox?.id === inboxId)?.source_id ?? null;
  }
  if (!sourceId) sourceId = fone;

  const criada = await fetch(
    `${base}/api/v1/accounts/${accountId}/conversations`,
    {
      method: "POST",
      headers: cabecalhoJson,
      body: JSON.stringify({
        source_id: sourceId,
        inbox_id: inboxId,
        contact_id: contactId,
      }),
    },
  );
  if (!criada.ok) throw new Error(`conversation_create_failed_${criada.status}`);
  const payload = await criada.json();
  const id = payload?.id ?? payload?.payload?.id;
  if (!id) throw new Error("conversation_create_failed");
  return { conversationId: Number(id), contactId };
}
// =================== fim da cópia ===================

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

  const chatwootUrl = (Deno.env.get("CHATWOOT_URL") ?? "").replace(/\/$/, "");
  const chatwootToken = Deno.env.get("CHATWOOT_TOKEN") ?? "";
  const accountId = Number(Deno.env.get("CHATWOOT_ACCOUNT_ID") ?? "");
  const inboxIdRaw = Deno.env.get("CHATWOOT_WHATSAPP_INBOX_ID") ??
    Deno.env.get("CHATWOOT_INBOX_ID") ??
    "";
  const inboxIdPreferido = inboxIdRaw ? Number(inboxIdRaw) : null;

  if (!chatwootUrl || !chatwootToken) {
    return json({ error: "chatwoot_not_configured" }, 500);
  }
  if (!Number.isFinite(accountId)) return json({ error: "no_account_id" }, 500);

  let conversa_id = "";
  let templateReq: TemplateRequest | null = null;
  try {
    const body = await req.json();
    conversa_id = String(body?.conversa_id ?? "");
    if (body?.template) {
      const name = String(body.template?.name ?? "");
      const language = String(body.template?.language ?? "");
      if (!name || !language) {
        return json({ error: "invalid_payload", reason: "invalid_template" }, 400);
      }
      const rawParams = (body.template?.params ?? {}) as Record<string, unknown>;
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawParams)) {
        params[k] = String(v ?? "");
      }
      templateReq = { name, language, params };
    }
  } catch (_e) {
    return json({ error: "invalid_payload" }, 400);
  }
  if (!conversa_id || !templateReq) {
    return json({ error: "invalid_payload", reason: "missing_fields" }, 400);
  }

  const admin = createClient(supabaseUrl, service);
  const { data: conversa, error: convErr } = await admin
    .from("conversas")
    .select(
      "id, canal, eh_grupo, telefone, nome_whatsapp, chatwoot_conversation_id, chatwoot_inbox_id, chatwoot_contact_id, contato:contatos(nome, telefone)",
    )
    .eq("id", conversa_id)
    .maybeSingle();
  if (convErr || !conversa) return json({ error: "conversa_not_found" }, 404);
  if (conversa.canal === "instagram") {
    return json({ error: "canal_invalido" }, 400);
  }
  if (conversa.eh_grupo) return json({ error: "grupo_nao_suportado" }, 400);

  // deno-lint-ignore no-explicit-any
  const contato = (conversa as any).contato as
    | { nome?: string; telefone?: string }
    | null;
  const telefone = digitos(conversa.telefone ?? contato?.telefone ?? "");
  if (telefone.length < 10) return json({ error: "conversa_sem_telefone" }, 409);
  const nome = (contato?.nome || conversa.nome_whatsapp || telefone).trim();

  let inboxes: ChatwootInbox[];
  try {
    inboxes = await fetchInboxes(chatwootUrl, chatwootToken, accountId);
  } catch (err) {
    console.error("chatwoot_inboxes_failed", err);
    return json({ error: "templates_fetch_failed", message: String(err) }, 502);
  }

  const inbox = pickWhatsappInbox(
    inboxes,
    Number.isFinite(inboxIdPreferido) ? inboxIdPreferido : null,
  );
  if (!inbox?.id) return json({ error: "inbox_not_found" }, 404);
  const inboxId = inbox.id;

  const campanhaNome = await loadCampanhaTemplateNome(admin);
  const resolved = approvedTemplates(
    inbox,
    campanhaNome ? [campanhaNome] : [],
  ).find(
    (t) =>
      t.name === templateReq!.name &&
      t.language.toLowerCase() === templateReq!.language.toLowerCase(),
  );
  if (!resolved) return json({ error: "template_not_found" }, 404);
  if (!resolved.supported) {
    return json({
      error: "template_unsupported",
      reason: resolved.unsupported_reason,
    }, 400);
  }

  const filled: Record<string, string> = {};
  for (const key of resolved.variables) {
    const value = sanitizeParam(templateReq.params[key] ?? "");
    if (!value) {
      return json({ error: "template_missing_params", variable: key }, 400);
    }
    filled[key] = value;
  }

  const content = renderTemplate(resolved, filled);
  // Chatwoot 4.1 espera processed_params PLANO {"1":"Maria"} — sem envelope body.
  const templateParams = {
    name: resolved.name,
    language: resolved.language,
    ...(resolved.category ? { category: resolved.category } : {}),
    ...(resolved.variables.length > 0
      ? { processed_params: filled }
      : {}),
  };

  let conversationId = conversa.chatwoot_conversation_id
    ? Number(conversa.chatwoot_conversation_id)
    : null;
  let contactId = conversa.chatwoot_contact_id
    ? Number(conversa.chatwoot_contact_id)
    : null;

  // Só reaproveita vínculo se for da mesma inbox Cloud (evita misturar IG).
  if (
    conversationId &&
    conversa.chatwoot_inbox_id &&
    Number(conversa.chatwoot_inbox_id) !== inboxId
  ) {
    conversationId = null;
    contactId = null;
  }

  if (!conversationId) {
    try {
      const g = await garantirConversa(
        chatwootUrl,
        chatwootToken,
        accountId,
        inboxId,
        telefone,
        nome,
      );
      conversationId = g.conversationId;
      contactId = g.contactId;
      await admin
        .from("conversas")
        .update({
          chatwoot_conversation_id: conversationId,
          chatwoot_inbox_id: inboxId,
          chatwoot_contact_id: contactId,
        })
        .eq("id", conversa_id);
    } catch (err) {
      console.error("chatwoot_ensure_conversation_failed", err);
      return json({
        error: "send_failed",
        message: String(err),
      }, 502);
    }
  }

  const endpoint =
    `${chatwootUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`;

  let chatwootResp: Response;
  try {
    chatwootResp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        api_access_token: chatwootToken,
      },
      body: JSON.stringify({
        content,
        message_type: "outgoing",
        private: false,
        template_params: templateParams,
      }),
    });
  } catch (err) {
    console.error("chatwoot_fetch_failed", err);
    return json({ error: "send_failed", message: String(err) }, 502);
  }

  const respText = await chatwootResp.text();
  let respJson: { id?: number; content?: string } = {};
  try {
    respJson = JSON.parse(respText);
  } catch (_e) { /* ignore */ }

  if (!chatwootResp.ok) {
    return json({
      error: "send_failed",
      status: chatwootResp.status,
      message: respText.slice(0, 800),
    }, 502);
  }

  const chatwootMessageId = typeof respJson.id === "number" ? respJson.id : null;
  const corpo = respJson.content ?? content;

  const { data: msg, error: msgErr } = await admin
    .from("mensagens")
    .insert({
      conversa_id,
      chatwoot_message_id: chatwootMessageId,
      direcao: "saida",
      corpo,
      tipo: "texto",
      status: "enviada",
      autor_id: userId,
      autor_email: userEmail,
    })
    .select("id")
    .maybeSingle();
  if (msgErr && msgErr.code !== "23505") {
    console.error("mensagens_insert_failed", msgErr);
  }

  const previa = corpo.slice(0, 120);
  await admin
    .from("conversas")
    .update({
      ultimo_em: new Date().toISOString(),
      ultima_msg: `Você: ${previa}`,
    })
    .eq("id", conversa_id);

  return json({
    ok: true,
    mensagem_id: msg?.id ?? null,
    chatwoot_message_id: chatwootMessageId,
    chatwoot_conversation_id: conversationId,
  });
});
