const EXPLICIT = (import.meta.env.VITE_API_URL as string | undefined)?.trim();

/** Base da API Nest (`/api/v1`). Vazio = não usar Nest. */
export function apiV1(): string {
  if (EXPLICIT) return EXPLICIT.replace(/\/$/, "");
  if (import.meta.env.DEV) return "/api/v1";
  return "/api/v1";
}

export const hasRealApi = Boolean(EXPLICIT) || import.meta.env.VITE_USE_API === "true";

export function functionsUrl(name: string): string {
  return `${apiV1()}/functions/${name}`;
}

/** URL da função: Nest `/functions/:name` ou legado Supabase. */
export function edgeFunctionUrl(name: string): string {
  if (hasRealApi) return functionsUrl(name);
  const base = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "").replace(/\/$/, "");
  return `${base}/functions/v1/${name}`;
}
