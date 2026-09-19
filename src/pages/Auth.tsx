import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CrmLogo } from "@/components/branding/Logos";
import { Building2, MessageCircle, LineChart } from "lucide-react";
import { isUiPreview } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** Em produção o CRM é só por convite (admin cria em Usuários). */
const ALLOW_SIGNUP = import.meta.env.VITE_ALLOW_SIGNUP === "true";

const loginSchema = z.object({
  email: z.string().email("E-mail inválido").max(255),
  password: z.string().min(6, "Mínimo de 6 caracteres").max(72),
});

const signupSchema = loginSchema.extend({
  nome: z.string().max(120).optional(),
});

const forgotSchema = z.object({
  email: z.string().email("E-mail inválido").max(255),
});

const recoverySchema = z
  .object({
    password: z.string().min(8, "Mínimo de 8 caracteres").max(72),
    confirma: z.string(),
  })
  .refine((d) => d.password === d.confirma, {
    message: "As senhas não conferem",
    path: ["confirma"],
  });

const PILARES = [
  { icon: Building2, titulo: "Comercial B2B", desc: "Leads de empresas e organizações no mesmo pipeline." },
  { icon: MessageCircle, titulo: "SDR + humano", desc: "Qualificação pela IA SDR e handoff para o consultor." },
  { icon: LineChart, titulo: "Do lead ao contrato", desc: "Oportunidades, tarefas e chat em um só CRM." },
];

type Mode = "login" | "signup" | "forgot" | "recovery";

export default function Auth() {
  const navigate = useNavigate();
  const { enterPreview } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [emailPrefill, setEmailPrefill] = useState("");

  // Link do e-mail de recuperação: Supabase abre /auth#type=recovery (ou ?code=).
  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const fromHash = new URLSearchParams(hash);
    const type = fromHash.get("type") || searchParams.get("type");
    if (type === "recovery" || searchParams.get("mode") === "recovery") {
      setMode("recovery");
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("recovery");
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && mode !== "recovery" && type !== "recovery") {
        navigate("/", { replace: true });
      }
    });

    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, searchParams]);

  const afterAuth = () => {
    supabase.rpc("registrar_acesso").then(({ error: rpcError }) => {
      if (rpcError) console.warn("Falha ao registrar acesso:", rpcError.message);
    });
    navigate("/", { replace: true });
  };

  const handleLoginSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    if (mode === "login") {
      const parsed = loginSchema.safeParse({
        email: fd.get("email"),
        password: fd.get("password"),
      });
      if (!parsed.success) {
        toast.error(parsed.error.issues[0].message);
        return;
      }
      setLoading(true);
      const { error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });
      setLoading(false);
      if (error) {
        const msg = error.message?.toLowerCase() ?? "";
        if (msg.includes("invalid login")) {
          toast.error("E-mail ou senha incorretos.");
        } else if (msg.includes("email not confirmed")) {
          toast.error("Confirme seu e-mail antes de entrar.");
        } else {
          toast.error(error.message);
        }
        return;
      }
      afterAuth();
      return;
    }

    if (!ALLOW_SIGNUP) {
      toast.error("Cadastro público desativado. Peça acesso ao administrador.");
      setMode("login");
      return;
    }

    const parsed = signupSchema.safeParse({
      nome: fd.get("nome") || undefined,
      email: fd.get("email"),
      password: fd.get("password"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { nome: parsed.data.nome?.trim() || undefined },
      },
    });
    setLoading(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    if (data.session) {
      toast.success("Conta criada. Bem-vindo!");
      afterAuth();
      return;
    }

    toast.success("Conta criada. Verifique seu e-mail se solicitado e faça login.");
    setMode("login");
  };

  const handleForgot = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = forgotSchema.safeParse({ email: fd.get("email") });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setEmailPrefill(parsed.data.email);
    setLoading(true);
    const redirectTo = `${window.location.origin}/auth?mode=recovery`;
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Se o e-mail existir, enviamos um link para redefinir a senha.");
    setMode("login");
  };

  const handleRecovery = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = recoverySchema.safeParse({
      password: fd.get("password"),
      confirma: fd.get("confirma"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Senha redefinida. Você já está logado.");
    window.history.replaceState(null, "", "/auth");
    setSearchParams({});
    afterAuth();
  };

  const titulo =
    mode === "login"
      ? "Bem-vindo de volta"
      : mode === "signup"
        ? "Primeiro acesso"
        : mode === "forgot"
          ? "Recuperar senha"
          : "Nova senha";

  const subtitulo =
    mode === "login"
      ? "Acesso por convite. Peça ao gestor se ainda não tem conta."
      : mode === "signup"
        ? "Disponível só em ambiente de desenvolvimento."
        : mode === "forgot"
          ? "Enviaremos um link para o e-mail cadastrado."
          : "Defina a nova senha de acesso ao CRM.";

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground lg:flex">
        <div className="absolute inset-0 pattern-grid opacity-10" />
        <div
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full"
          style={{
            background:
              "radial-gradient(circle, hsl(var(--brand) / 0.32) 0%, transparent 70%)",
          }}
        />
        <div
          className="pointer-events-none absolute -bottom-40 -left-32 h-[28rem] w-[28rem] rounded-full"
          style={{
            background:
              "radial-gradient(circle, hsl(var(--brand-soft) / 0.22) 0%, transparent 70%)",
          }}
        />

        <div className="relative z-10 inline-flex rounded-2xl bg-white px-5 py-3 shadow-elegant">
          <CrmLogo className="h-16 -my-2" />
        </div>

        <div className="relative z-10 max-w-lg space-y-8">
          <div className="space-y-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.32em] text-primary-foreground/60">
              CRM comercial
            </p>
            <h2 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight">
              Pipeline, WhatsApp e follow-up para vender a empresas e organizações.
            </h2>
            <p className="text-sm text-primary-foreground/70">
              Pipeline, WhatsApp e follow-up no mesmo lugar — do lead frio ao contrato fechado.
            </p>
          </div>

          <ul className="space-y-3">
            {PILARES.map(({ icon: Icon, titulo: t, desc }) => (
              <li key={t} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary-foreground/10 ring-1 ring-primary-foreground/15">
                  <Icon className="h-4 w-4 text-primary-foreground/90" />
                </span>
                <div className="text-sm">
                  <div className="font-medium">{t}</div>
                  <div className="text-primary-foreground/65">{desc}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 text-xs text-primary-foreground/55">
          © {new Date().getFullYear()} Sistema CRM — Todos os direitos reservados.
        </div>
      </aside>

      <section className="relative flex items-center justify-center bg-background px-6 py-16">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center lg:hidden">
            <CrmLogo className="h-14 -my-2" />
          </div>

          <div className="surface-elevated p-8">
            <div className="mb-7 space-y-2">
              <p className="page-eyebrow">{titulo}</p>
              <h1 className="font-display text-3xl font-semibold tracking-tight">
                {mode === "login" || (ALLOW_SIGNUP && mode === "signup") ? (
                  <>
                    {mode === "login" ? "Acesse o " : "Crie sua conta no "}
                    <span className="text-gradient-brand">
                      {mode === "login" ? "Sistema CRM" : "CRM"}
                    </span>
                  </>
                ) : mode === "forgot" ? (
                  <>Esqueceu a <span className="text-gradient-brand">senha</span>?</>
                ) : (
                  <>Redefinir <span className="text-gradient-brand">senha</span></>
                )}
              </h1>
              <p className="text-sm text-muted-foreground">{subtitulo}</p>
            </div>

            {ALLOW_SIGNUP && (mode === "login" || mode === "signup") && (
              <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                <button
                  type="button"
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    mode === "login"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setMode("login")}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    mode === "signup"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setMode("signup")}
                >
                  Criar conta
                </button>
              </div>
            )}

            {!ALLOW_SIGNUP && mode === "login" && (
              <p className="mb-5 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                Contas novas só pelo admin em <strong>Usuários</strong>. Sem cadastro público.
              </p>
            )}

            {(mode === "login" || (ALLOW_SIGNUP && mode === "signup")) && (
              <form onSubmit={handleLoginSignup} className="space-y-4">
                {ALLOW_SIGNUP && mode === "signup" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="auth-nome">Nome</Label>
                    <Input
                      id="auth-nome"
                      name="nome"
                      type="text"
                      autoComplete="name"
                      placeholder="Seu nome"
                      className="h-11"
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="auth-email">E-mail</Label>
                  <Input
                    id="auth-email"
                    name="email"
                    type="email"
                    required
                    defaultValue={emailPrefill}
                    autoComplete="email"
                    placeholder="voce@empresa.com"
                    className="h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="auth-password">Senha</Label>
                    {mode === "login" && (
                      <button
                        type="button"
                        className="text-xs font-medium text-primary hover:underline"
                        onClick={() => {
                          const el = document.getElementById("auth-email") as HTMLInputElement | null;
                          if (el?.value) setEmailPrefill(el.value);
                          setMode("forgot");
                        }}
                      >
                        Esqueci a senha
                      </button>
                    )}
                  </div>
                  <Input
                    id="auth-password"
                    name="password"
                    type="password"
                    required
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    placeholder="Mínimo 6 caracteres"
                    className="h-11"
                  />
                </div>
                <Button type="submit" disabled={loading} className="h-11 w-full text-sm font-medium">
                  {loading
                    ? mode === "login"
                      ? "Entrando…"
                      : "Criando…"
                    : mode === "login"
                      ? "Entrar"
                      : "Criar conta"}
                </Button>
                {isUiPreview && mode === "login" && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full text-sm font-medium"
                    onClick={() => enterPreview()}
                  >
                    Demonstração (sem dados reais)
                  </Button>
                )}
              </form>
            )}

            {mode === "forgot" && (
              <form onSubmit={handleForgot} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="forgot-email">E-mail</Label>
                  <Input
                    id="forgot-email"
                    name="email"
                    type="email"
                    required
                    defaultValue={emailPrefill}
                    autoComplete="email"
                    className="h-11"
                  />
                </div>
                <Button type="submit" disabled={loading} className="h-11 w-full text-sm font-medium">
                  {loading ? "Enviando…" : "Enviar link de recuperação"}
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setMode("login")}
                >
                  Voltar ao login
                </button>
              </form>
            )}

            {mode === "recovery" && (
              <form onSubmit={handleRecovery} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="recovery-password">Nova senha</Label>
                  <Input
                    id="recovery-password"
                    name="password"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="recovery-confirma">Confirmar senha</Label>
                  <Input
                    id="recovery-confirma"
                    name="confirma"
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    className="h-11"
                  />
                </div>
                <Button type="submit" disabled={loading} className="h-11 w-full text-sm font-medium">
                  {loading ? "Salvando…" : "Salvar nova senha"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
