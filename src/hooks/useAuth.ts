import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  clearPreviewSession,
  enablePreviewSession,
  isPreviewSessionActive,
  isUiPreview,
  supabase,
} from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "admin" | "usuario";

const PREVIEW_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "preview@crm.local",
  app_metadata: {},
  user_metadata: { nome: "Preview UI" },
  aud: "authenticated",
  created_at: new Date().toISOString(),
} as User;

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [responsavelCrm, setResponsavelCrm] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState(() => isPreviewSessionActive());

  useEffect(() => {
    let mounted = true;

    if (isUiPreview && isPreviewSessionActive()) {
      setPreview(true);
      setUser(PREVIEW_USER);
      setSession(null);
      setRoles(["super_admin", "admin"]);
      setResponsavelCrm("Comercial");
      setLoading(false);
      return;
    }

    const fetchRoles = async (userId: string) => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (!mounted) return;
      if (error) {
        console.error("fetchRoles", error);
        setRoles([]);
        return;
      }
      setRoles((data ?? []).map((r) => r.role as AppRole));
    };

    const fetchPerfil = async (userId: string) => {
      const { data } = await supabase
        .from("profiles")
        .select("responsavel_crm")
        .eq("user_id", userId)
        .maybeSingle();
      if (!mounted) return;
      setResponsavelCrm(
        (data as { responsavel_crm?: string | null } | null)?.responsavel_crm ?? null,
      );
    };

    const applySession = async (sess: Session | null) => {
      if (!mounted) return;
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        await Promise.all([fetchRoles(sess.user.id), fetchPerfil(sess.user.id)]);
      } else {
        setRoles([]);
        setResponsavelCrm(null);
      }
    };

    // Timeout: host morto do Supabase não pode travar a tela de login.
    const timeout = window.setTimeout(() => {
      if (mounted) setLoading(false);
    }, 2500);

    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        window.clearTimeout(timeout);
        await applySession(session);
        if (mounted) setLoading(false);
      })
      .catch(() => {
        window.clearTimeout(timeout);
        if (mounted) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => {
      setTimeout(() => applySession(sess), 0);
    });

    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, [preview]);

  const isSuperAdmin = roles.includes("super_admin");
  const isAdmin = roles.includes("admin") || isSuperAdmin;

  return {
    session,
    user,
    roles,
    responsavelCrm,
    loading,
    isPreview: preview,
    isSuperAdmin,
    isAdmin,
    canManageUsers: isAdmin,
    canViewLogs: isSuperAdmin,
    canEditPipeline: isAdmin,
    canConnectGoogle: isSuperAdmin,
    enterPreview: () => {
      enablePreviewSession();
      window.location.assign("/");
    },
    signOut: async () => {
      clearPreviewSession();
      setPreview(false);
      setUser(null);
      setRoles([]);
      setResponsavelCrm(null);
      await supabase.auth.signOut().catch(() => undefined);
      window.location.assign("/auth");
    },
  };
}
