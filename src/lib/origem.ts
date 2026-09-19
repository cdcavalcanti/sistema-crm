// Origens em destaque nos gráficos. Inclua a string exatamente como deve aparecer.
export const ORIGENS_DESTAQUE = [
  "WhatsApp",
  "Instagram",
  "Meta Ads",
  "Formulário do site",
  "Indicação",
] as const;

export const OUTRAS_ORIGENS_LABEL = "Outras origens";

function normalizeOrigem(s: string) {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/–/g, "-")
    .replace(/·/g, " ")
    .replace(/\s+/g, " ");
}

/** Slugs do banco → label de exibição */
const ORIGEM_ALIASES: Record<string, (typeof ORIGENS_DESTAQUE)[number] | string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  meta_ads: "Meta Ads",
  formulario_site: "Formulário do site",
  indicacao: "Indicação",
};

const LABEL_BY_NORM = new Map(
  ORIGENS_DESTAQUE.map((o) => [normalizeOrigem(o), o] as const),
);

export function displayOrigem(raw: string | null | undefined): string {
  if (!raw) return OUTRAS_ORIGENS_LABEL;
  const alias = ORIGEM_ALIASES[raw.trim().toLowerCase()];
  if (alias) return alias;
  return LABEL_BY_NORM.get(normalizeOrigem(raw)) ?? OUTRAS_ORIGENS_LABEL;
}
