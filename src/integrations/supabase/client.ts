import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** Só UI — sem auth/API reais (útil quando o Supabase está fora). */
export const isUiPreview = import.meta.env.VITE_UI_PREVIEW === "true";

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

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  // eslint-disable-next-line no-console
  console.error(
    "[Sistema CRM] Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env.local",
  );
}

export const supabase: SupabaseClient<Database> = createClient<Database>(
  SUPABASE_URL ?? "https://placeholder.supabase.co",
  SUPABASE_PUBLISHABLE_KEY ??
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  {
    auth: {
      storage: localStorage,
      persistSession: !isUiPreview,
      autoRefreshToken: !isUiPreview,
    },
  },
);
