import { extractPlaceholders, parseTemplate, type ParsedTemplate, type RawTemplate } from "@/lib/whatsappTemplates";

export type TemplateStatus = "APPROVED" | "PENDING" | "REJECTED";

export type CatalogTemplate = ParsedTemplate & {
  status: TemplateStatus;
};

const DRAFT_KEY = "crm-meta-template-drafts";

const SEED_RAW: Array<RawTemplate & { status: TemplateStatus }> = [
  {
    name: "orcamento_pronto",
    language: "pt_BR",
    status: "APPROVED",
    category: "UTILITY",
    components: [
      { type: "HEADER", format: "TEXT", text: "VORTEX" },
      { type: "BODY", text: "Oi {{1}}, o orçamento da {{2}} está pronto. Posso enviar agora?" },
      { type: "FOOTER", text: "Responda para falar com o consultor." },
    ],
  },
  {
    name: "follow_up_reuniao",
    language: "pt_BR",
    status: "PENDING",
    category: "UTILITY",
    components: [
      { type: "BODY", text: "Olá {{1}}, confirmando nossa reunião em {{2}}. Qualquer ajuste, é só responder." },
    ],
  },
  {
    name: "lembrete_proposta",
    language: "pt_BR",
    status: "REJECTED",
    category: "MARKETING",
    components: [
      { type: "BODY", text: "{{1}}, a proposta ainda está aberta. Quer que eu reserve uma data nesta semana?" },
    ],
  },
];

function toCatalog(raw: RawTemplate & { status?: string }): CatalogTemplate | null {
  const parsed = parseTemplate(raw);
  if (!parsed) return null;
  const status = String(raw.status ?? "PENDING").toUpperCase() as TemplateStatus;
  const ok: TemplateStatus = status === "APPROVED" || status === "REJECTED" ? status : "PENDING";
  return { ...parsed, status: ok };
}

export function seedTemplates(): CatalogTemplate[] {
  return SEED_RAW.map(toCatalog).filter((t): t is CatalogTemplate => Boolean(t));
}

function loadDrafts(): CatalogTemplate[] {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as Array<RawTemplate & { status?: string }>;
    return list.map(toCatalog).filter((t): t is CatalogTemplate => Boolean(t));
  } catch {
    return [];
  }
}

function persistDrafts(items: CatalogTemplate[]) {
  const raw = items.map((t) => ({
    name: t.name,
    language: t.language,
    status: t.status,
    category: t.category,
    components: [
      ...(t.header_text ? [{ type: "HEADER", format: "TEXT", text: t.header_text }] : []),
      { type: "BODY", text: t.body_text },
      ...(t.footer_text ? [{ type: "FOOTER", text: t.footer_text }] : []),
    ],
  }));
  localStorage.setItem(DRAFT_KEY, JSON.stringify(raw));
}

export function mergeTemplateCatalog(fromApi: CatalogTemplate[]): CatalogTemplate[] {
  const drafts = loadDrafts();
  const key = (t: CatalogTemplate) => `${t.name}:${t.language}`;
  const map = new Map<string, CatalogTemplate>();
  for (const t of fromApi) map.set(key(t), t);
  for (const t of drafts) if (!map.has(key(t))) map.set(key(t), t);
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export type NovoTemplateInput = {
  name: string;
  language: string;
  category: string;
  header_text?: string;
  body_text: string;
  footer_text?: string;
};

export function rascunhoParaCatalog(input: NovoTemplateInput): CatalogTemplate {
  const raw: RawTemplate & { status: TemplateStatus } = {
    name: input.name.trim().toLowerCase().replace(/\s+/g, "_"),
    language: input.language || "pt_BR",
    status: "PENDING",
    category: input.category,
    components: [
      ...(input.header_text?.trim()
        ? [{ type: "HEADER", format: "TEXT" as const, text: input.header_text.trim() }]
        : []),
      { type: "BODY", text: input.body_text.trim() },
      ...(input.footer_text?.trim() ? [{ type: "FOOTER", text: input.footer_text.trim() }] : []),
    ],
  };
  const parsed = toCatalog(raw);
  if (!parsed) {
    throw new Error("Corpo do template é obrigatório.");
  }
  return parsed;
}

export function saveTemplateDraft(item: CatalogTemplate): void {
  const current = loadDrafts().filter((t) => !(t.name === item.name && t.language === item.language));
  persistDrafts([item, ...current]);
}

export function slugTemplateName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 512);
}

export function variaveisDoCorpo(body: string): string[] {
  return extractPlaceholders(body);
}
