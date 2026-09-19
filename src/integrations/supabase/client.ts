import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { createPreviewClient } from "./preview-client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

const url = (SUPABASE_URL ?? "").trim();
const key = (SUPABASE_PUBLISHABLE_KEY ?? "").trim();

/** Sem projeto real: placeholder, vazio ou o exemplo do .env.example. */
export const hasRealSupabase =
  Boolean(url && key) &&
  !/YOUR_PROJECT_REF|placeholder\.supabase\.co/i.test(url);

/**
 * Demo de UI sem login real.
 * Liga com VITE_UI_PREVIEW=true, ou automaticamente no `npm run dev` se o Supabase não estiver configurado.
 * Nunca entra sozinho em `vite build` (produção).
 */
export const isUiPreview =
  import.meta.env.VITE_UI_PREVIEW === "true" ||
  (Boolean(import.meta.env.DEV) && !hasRealSupabase);

/** Dados fictícios em memória — só quando o preview está on e não há backend. */
export const usesPreviewData = isUiPreview && !hasRealSupabase;

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

if (!hasRealSupabase && !usesPreviewData) {
  // eslint-disable-next-line no-console
  console.error(
    "[Sistema CRM] Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env.local",
  );
}

export const supabase: SupabaseClient<Database> = usesPreviewData
  ? (createPreviewClient() as unknown as SupabaseClient<Database>)
  : createClient<Database>(
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
