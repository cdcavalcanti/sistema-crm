// Templates aprovados do WhatsApp, lidos via Chatwoot.
//
// O Chatwoot NÃO normaliza os templates: guarda a resposta da Meta verbatim
// num jsonb do canal e expõe em `message_templates` no objeto do inbox (só
// pra inbox WhatsApp). Não existe endpoint dedicado — a lista vem junto de
// GET /inboxes. Também não filtra por status: vem APPROVED, PENDING e
// REJECTED misturados; filtrar é com a gente.
//
// Placeholder é o da Meta: {{1}} (POSITIONAL) ou {{nome}} (NAMED).
//
// ATENÇÃO — este arquivo é a fonte da verdade, usada pelo preview do chat e
// pelos testes. As edge functions (whatsapp-templates e whatsapp-send-template)
// carregam uma CÓPIA desta lógica embutida no próprio index.ts, porque o
// editor do dashboard do Supabase apaga arquivos extras ao publicar e não
// aceita import de pasta compartilhada. Mexeu aqui, replique lá.

export type RawTemplateButton = {
  type?: string;
  text?: string;
  url?: string;
};

export type RawTemplateComponent = {
  type?: string; // BODY | HEADER | FOOTER | BUTTONS
  format?: string; // TEXT | IMAGE | DOCUMENT | VIDEO
  text?: string;
  buttons?: RawTemplateButton[];
};

export type RawTemplate = {
  name?: string;
  language?: string;
  status?: string;
  category?: string;
  parameter_format?: string; // POSITIONAL | NAMED
  components?: RawTemplateComponent[];
};

// Motivo de um template aprovado não ser enviável pelo CRM ainda.
export type UnsupportedReason = "media_header" | "header_variables" | "button_variables";

export type ParsedTemplate = {
  name: string;
  language: string;
  category: string | null;
  named: boolean; // true → processed_params por nome; false → por índice
  header_text: string | null;
  body_text: string;
  footer_text: string | null;
  buttons: string[];
  variables: string[]; // placeholders do BODY, na ordem de aparição
  supported: boolean;
  unsupported_reason: UnsupportedReason | null;
};

export type ChatwootInbox = {
  id?: number;
  name?: string;
  channel_type?: string;
  message_templates?: RawTemplate[];
};

// Regex nova a cada uso — global regex guarda lastIndex e não é reusável.
const placeholderRe = () => /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

export function extractPlaceholders(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const m of text.matchAll(placeholderRe())) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

// A Meta rejeita parâmetro com newline/tab, e o Chatwoot remove < > " ' e
// trunca em 1000 chars antes de mandar. Fazemos o mesmo pro texto que fica
// gravado no CRM bater com o que o cliente recebe.
export function sanitizeParam(value: string): string {
  return value.replace(/[<>"']/g, "").replace(/\s+/g, " ").trim().slice(0, 1000);
}

function findComponent(
  components: RawTemplateComponent[],
  type: string,
): RawTemplateComponent | undefined {
  return components.find((c) => (c.type ?? "").toUpperCase() === type);
}

export function parseTemplate(raw: RawTemplate): ParsedTemplate | null {
  const name = raw?.name;
  const language = raw?.language;
  if (!name || !language) return null;

  const components = raw.components ?? [];
  const header = findComponent(components, "HEADER");
  const body = findComponent(components, "BODY");
  const footer = findComponent(components, "FOOTER");
  const buttonsComponent = findComponent(components, "BUTTONS");

  const body_text = body?.text ?? "";
  if (!body_text.trim()) return null; // sem corpo não há o que enviar

  const variables = extractPlaceholders(body_text);
  const headerFormat = (header?.format ?? (header ? "TEXT" : "")).toUpperCase();
  const headerVariables = extractPlaceholders(header?.text);
  const buttons = buttonsComponent?.buttons ?? [];

  // POSITIONAL é o default da Meta. Se algum placeholder não for numérico o
  // template é NAMED na prática, mesmo sem o campo declarado (instâncias
  // antigas do Chatwoot não mandam parameter_format).
  const named = (raw.parameter_format ?? "").toUpperCase() === "NAMED" ||
    variables.some((v) => !/^\d+$/.test(v));

  // Só sabemos preencher parâmetro de BODY. Header de mídia precisa de
  // media_url, header com variável e botão com URL dinâmica precisam de
  // params próprios — nesses casos listamos o template mas bloqueamos o
  // envio, em vez de mandar algo que a Meta rejeita silenciosamente.
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

// Allowlist opcional. Vazio = todos os APPROVED do inbox (Sistema CRM).
// Para restringir (estilo Vai Xorá), liste os nomes e replique nas edges.
export const CRM_TEMPLATE_ALLOWLIST: readonly string[] = [];

export function approvedTemplates(
  inbox: ChatwootInbox,
  allowlist: readonly string[] = CRM_TEMPLATE_ALLOWLIST,
): ParsedTemplate[] {
  const allowed = (name: string) => {
    if (allowlist.length === 0) return true;
    const n = name.trim().toLowerCase();
    return allowlist.some((a) => a.trim().toLowerCase() === n);
  };
  return (inbox.message_templates ?? [])
    .filter((t) => (t.status ?? "").toLowerCase() === "approved")
    .map(parseTemplate)
    .filter((t): t is ParsedTemplate => t !== null)
    .filter((t) => allowed(t.name));
}

// Texto que vai pro `content` da mensagem. Não é o que a Meta renderiza (ela
// monta do template aprovado), mas é o que o consultor e o histórico do CRM
// enxergam — sem isso a bolha fica vazia.
//
// Variável vazia continua aparecendo como {{1}}: no preview mostra pro
// consultor o que falta, e no servidor o envio já foi barrado antes daqui.
export function renderTemplate(
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

// Resolve qual inbox olhar. Preferimos o id em CHATWOOT_WHATSAPP_INBOX_ID;
// sem ele, só dá pra adivinhar se existir exatamente um inbox WhatsApp na conta.
export function pickWhatsappInbox(
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
