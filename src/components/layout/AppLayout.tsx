import { Outlet, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SinoLembretes } from "./SinoLembretes";
import { AppSidebar } from "./AppSidebar";
import { useAuth, type AppRole } from "@/hooks/useAuth";

const PAGE_LABELS: Array<[RegExp, string]> = [
  [/^\/$/, "Dashboard"],
  [/^\/contatos$/, "Contatos"],
  [/^\/contatos\/.+/, "Detalhe do contato"],
  [/^\/oportunidades$/, "Oportunidades"],
  [/^\/oportunidades\/.+/, "Detalhe da oportunidade"],
  [/^\/tarefas$/, "Tarefas"],
  [/^\/chat$/, "Chat"],
  [/^\/remarketing$/, "Remarketing"],
  [/^\/meta$/, "Meta / Disparos"],
  [/^\/melhorias$/, "Melhorias internas"],
  [/^\/relatorios$/, "Relatórios"],
  [/^\/calendario$/, "Calendário"],
  [/^\/pipeline$/, "Pipeline"],
  [/^\/admin\/usuarios$/, "Usuários"],
  [/^\/admin\/logs$/, "Logs de auditoria"],
];

function pageLabel(pathname: string) {
  for (const [re, label] of PAGE_LABELS) if (re.test(pathname)) return label;
  return "Sistema CRM";
}

const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "Super admin",
  admin: "Administrador",
  usuario: "Usuário",
};

export function AppLayout() {
  const { pathname } = useLocation();
  const { user, roles, isPreview } = useAuth();
  const role = roles[0] as AppRole | undefined;
  const initial = user?.email?.[0]?.toUpperCase() ?? "·";
  const label = pageLabel(pathname);
  // Telas que ocupam a área inteira (sem container centralizado), ex.: Chat.
  const fullBleed = pathname === "/chat";

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          {isPreview && (
            <div className="bg-amber-500/15 px-4 py-1.5 text-center text-xs font-medium text-amber-800 dark:text-amber-200">
              Modo preview — UI só. Sem Supabase: listas vazias e ações não gravam.
            </div>
          )}
          <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border/80 bg-background/85 px-6 backdrop-blur-md">
            <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
            <div className="hidden h-6 w-px bg-border sm:block" />
            <div className="hidden flex-col leading-none sm:flex">
              <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                CRM comercial
              </span>
              <span className="mt-1 text-sm font-medium text-foreground">{label}</span>
            </div>
            <div className="ml-auto flex items-center gap-3">
              <SinoLembretes />
              <div className="hidden text-right leading-tight md:block">
                <div className="max-w-[200px] truncate text-xs font-medium text-foreground">
                  {user?.email}
                </div>
                {role && (
                  <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {ROLE_LABEL[role]}
                  </div>
                )}
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground shadow-card">
                {initial}
              </div>
            </div>
          </header>
          {fullBleed ? (
            <main className="h-[calc(100dvh-4rem)] min-h-0 flex-1 overflow-hidden">
              <Outlet />
            </main>
          ) : (
            <main className="flex-1 px-6 py-8 xl:px-10">
              <div className="w-full animate-fade-in">
                <Outlet />
              </div>
            </main>
          )}
        </div>
      </div>
    </SidebarProvider>
  );
}
