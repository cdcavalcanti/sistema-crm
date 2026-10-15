import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { createPreviewClient } from "./preview-client";
import { createNestClient } from "./nest-client";
import { hasRealApi } from "@/lib/api";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

const url = (SUPABASE_URL ?? "").trim();
const key = (SUPABASE_PUBLISHABLE_KEY ?? "").trim();

/** Sem projeto real: placeholder, vazio ou o exemplo do .env.example. */
export const hasRealSupabase =
  Boolean(url && key) &&
  !/YOUR_PROJECT_REF|placeholder\.supabase\.co/i.test(url);

/**
 * Botão "Demonstração (sem dados reais)" na tela de login.
 * Liga com VITE_UI_PREVIEW=true, ou no `npm run dev` (desliga com VITE_UI_PREVIEW=false).
 * Nunca entra sozinho em `vite build` de produção — precisa da flag.
 */
export const isUiPreview =
  import.meta.env.VITE_UI_PREVIEW === "true" ||
  (Boolean(import.meta.env.DEV) && import.meta.env.VITE_UI_PREVIEW !== "false");

const PREVIEW_KEY = "crm-ui-preview";

export function isPreviewSessionActive(): boolean {
  if (!isUiPreview) return false;
  try {
    return localStorage.getItem(PREVIEW_KEY) === "1";
  } catch {
    return false;
  }
}

export function enablePreviewSession(): void {
  localStorage.setItem(PREVIEW_KEY, "1");
}

export function clearPreviewSession(): void {
  localStorage.removeItem(PREVIEW_KEY);
}

/** Dados fictícios em memória: sessão Demonstração, ou preview sem backend. */
export function usesPreviewData(): boolean {
  if (isPreviewSessionActive()) return true;
  return isUiPreview && !hasRealApi && !hasRealSupabase;
}

if (!hasRealApi && !hasRealSupabase && !isUiPreview) {
  // eslint-disable-next-line no-console
  console.error(
    "[Sistema CRM] Defina VITE_API_URL (Nest) ou VITE_SUPABASE_URL no .env.local",
  );
}

function liveClient(): SupabaseClient<Database> {
  if (hasRealApi) {
    return createNestClient() as unknown as SupabaseClient<Database>;
  }
  return createClient<Database>(
    url || "https://placeholder.supabase.co",
    key ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
    {
      auth: {
        storage: localStorage,
        persistSession: !isUiPreview,
        autoRefreshToken: !isUiPreview,
      },
    },
  );
}

const previewClient = isUiPreview
  ? (createPreviewClient() as unknown as SupabaseClient<Database>)
  : null;
const apiClient = liveClient();

function activeClient(): SupabaseClient<Database> {
  if (previewClient && usesPreviewData()) return previewClient;
  return apiClient;
}

export const supabase: SupabaseClient<Database> = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    const client = activeClient() as unknown as Record<PropertyKey, unknown>;
    const value = client[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});
