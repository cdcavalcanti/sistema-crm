import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LGPD_VERSAO_PADRAO } from "@/lib/lgpd";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const COOKIE_KEY = "crm-lgpd-analytics";

export function lgpdAnalyticsPermitido(): boolean {
  try {
    return localStorage.getItem(COOKIE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Exige aceite da política para usuários autenticados sem lgpd_aceito_em. */
export function LgpdConsentGate() {
  const { user, isPreview } = useAuth();
  const [open, setOpen] = useState(false);
  const [versao, setVersao] = useState(LGPD_VERSAO_PADRAO);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!user || isPreview) return;
    let cancelled = false;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cfg } = await (supabase as any)
        .from("lgpd_config")
        .select("versao_politica")
        .eq("id", true)
        .maybeSingle();
      const v = (cfg?.versao_politica as string) || LGPD_VERSAO_PADRAO;
      if (!cancelled) setVersao(v);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: perfil } = await (supabase as any)
        .from("profiles")
        .select("lgpd_aceito_em, lgpd_versao_politica")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      if (!perfil?.lgpd_aceito_em || perfil?.lgpd_versao_politica !== v) {
        setOpen(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isPreview]);

  const aceitar = async () => {
    if (!user) return;
    setSalvando(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("profiles")
        .update({
          lgpd_aceito_em: new Date().toISOString(),
          lgpd_versao_politica: versao,
        })
        .eq("user_id", user.id);
      if (error) throw error;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("lgpd_consentimentos").insert({
        sujeito_tipo: "usuario_crm",
        sujeito_ref: user.id,
        finalidade: "uso_do_crm_equipe",
        base_legal: "contrato",
        versao_politica: versao,
        aceito: true,
        detalhes: { email: user.email },
      });

      setOpen(false);
      toast.success("Política de privacidade aceita");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar aceite");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => { /* obrigatório */ }}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Privacidade e LGPD</DialogTitle>
          <DialogDescription>
            Para continuar usando o CRM, confirme que leu a política de privacidade
            (versão {versao}).
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Tratamos dados da equipe e de leads comerciais conforme a LGPD. Detalhes em{" "}
          <Link to="/privacidade" className="font-medium text-primary hover:underline" target="_blank">
            /privacidade
          </Link>
          .
        </p>
        <DialogFooter>
          <Button disabled={salvando} onClick={() => void aceitar()}>
            {salvando ? "Registrando…" : "Li e aceito"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Banner opcional de analytics (não essencial). */
export function LgpdAnalyticsBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(COOKIE_KEY) == null) setVisible(true);
    } catch {
      /* ignore */
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 p-4 shadow-lg backdrop-blur">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Usamos analytics anônimo (Vercel) para melhorar o produto.{" "}
          <Link to="/privacidade" className="text-primary hover:underline">
            Política
          </Link>
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              localStorage.setItem(COOKIE_KEY, "0");
              setVisible(false);
            }}
          >
            Recusar
          </Button>
          <Button
            size="sm"
            onClick={() => {
              localStorage.setItem(COOKIE_KEY, "1");
              setVisible(false);
              window.location.reload();
            }}
          >
            Aceitar
          </Button>
        </div>
      </div>
    </div>
  );
}
