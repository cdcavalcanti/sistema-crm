// Lista templates APPROVED do WhatsApp Cloud (via Chatwoot).
//
// JWT-authed. O chat cotidiano do Sistema CRM usa WAHA; templates oficiais da
// Meta só saem por inbox Channel::Whatsapp (Cloud API) no Chatwoot.
//
// ARQUIVO AUTOCONTIDO: cópia de src/lib/whatsappTemplates.ts embutida.
// Mexeu lá, replique em whatsapp-send-template também.
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

function extractPlaceholders(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const m of text.matchAll(placeholderRe())) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
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

function approvedTemplates(inbox: ChatwootInbox): ParsedTemplate[] {
  const allowlist = loadAllowlist();
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
  let todos = false;
  try {
    const body = await req.json();
    conversa_id = String(body?.conversa_id ?? "");
    todos = !!body?.todos;
  } catch (_e) {
    return json({ error: "invalid_payload" }, 400);
  }
  // `todos: true` lista todos os APPROVED (campanha). Sem isso, exige conversa.
  if (!todos && !conversa_id) {
    return json({ error: "invalid_payload", reason: "missing_conversa_id" }, 400);
  }

  const admin = createClient(supabaseUrl, service);
  if (conversa_id) {
    const { data: conversa, error: convErr } = await admin
      .from("conversas")
      .select("id, canal, eh_grupo")
      .eq("id", conversa_id)
      .maybeSingle();
    if (convErr || !conversa) return json({ error: "conversa_not_found" }, 404);
    if (conversa.canal === "instagram") {
      return json({ error: "canal_invalido" }, 400);
    }
    if (conversa.eh_grupo) return json({ error: "grupo_nao_suportado" }, 400);
  }

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
  if (!inbox) {
    console.warn("chatwoot_whatsapp_inbox_unresolved", {
      accountId,
      inboxId: inboxIdPreferido,
    });
    return json({ error: "inbox_not_found" }, 404);
  }

  // Campanha (todos) ignora allowlist do chat; senão respeita env/código.
  const list = todos
    ? (inbox.message_templates ?? [])
      .filter((t) => (t.status ?? "").toLowerCase() === "approved")
      .map(parseTemplate)
      .filter((t): t is ParsedTemplate => t !== null)
    : approvedTemplates(inbox);

  return json({
    inbox_id: inbox.id ?? null,
    templates: list,
  });
});
