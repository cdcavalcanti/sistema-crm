import { Link } from "react-router-dom";
import { Shield } from "lucide-react";
import { LGPD_POLITICA } from "@/lib/lgpd";
import { CrmLogo } from "@/components/branding/Logos";

/** Página pública da política de privacidade (LGPD). */
export default function Privacidade() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <CrmLogo className="h-10" />
          <Link to="/auth" className="text-sm font-medium text-primary hover:underline">
            Voltar ao login
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-8 px-6 py-10">
        <div className="space-y-2">
          <p className="page-eyebrow flex items-center gap-2">
            <Shield className="h-3.5 w-3.5" /> LGPD · Privacidade
          </p>
          <h1 className="page-title text-3xl">Política de Privacidade</h1>
          <p className="text-sm text-muted-foreground">
            Versão {LGPD_POLITICA.versao} · Atualizada em {LGPD_POLITICA.atualizadoEm} ·{" "}
            {LGPD_POLITICA.controlador}
          </p>
        </div>
        {LGPD_POLITICA.secoes.map((s) => (
          <section key={s.titulo} className="space-y-2">
            <h2 className="font-display text-lg font-semibold">{s.titulo}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{s.corpo}</p>
          </section>
        ))}
      </main>
    </div>
  );
}
