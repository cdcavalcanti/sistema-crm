import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  GitFork,
  Users,
  Building2,
  FileSpreadsheet,
  FileCheck,
  Package,
  Sparkles,
  Gauge,
  Stethoscope,
  UsersRound,
  Smile,
  LineChart,
  BarChart3,
  CalendarDays,
  CalendarRange,
  Bot,
  CheckSquare,
  MessageCircle,
  Phone,
  Headphones,
  Mail,
  RefreshCw,
  Megaphone,
  Landmark,
  ClipboardCheck,
  Radar,
  FileText,
  Settings2,
  Upload,
  Link2,
  Puzzle,
  Workflow,
  Shield,
  ShieldCheck,
  Scale,
  ClipboardList,
  Activity,
  LogOut,
  KeyRound,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { CrmLogo, CrmMark } from "@/components/branding/Logos";
import { ChangePasswordDialog } from "@/components/account/ChangePasswordDialog";

function navClass({ isActive }: { isActive: boolean }) {
  return [
    "group/item relative flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm transition-colors",
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-[inset_2px_0_0_hsl(var(--brand))]"
      : "text-sidebar-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground",
  ].join(" ");
}

type Item = {
  titulo: string;
  url: string;
  icon: LucideIcon;
  exact?: boolean;
};

function Grupo({ label, itens }: { label: string; itens: Item[] }) {
  if (!itens.length) return null;
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="px-2 text-[10px] font-medium uppercase tracking-[0.32em] text-[hsl(var(--steel))]">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {itens.map((item) => (
            <SidebarMenuItem key={`${item.url}-${item.titulo}`}>
              <SidebarMenuButton asChild>
                <NavLink to={item.url} end={item.exact} className={navClass}>
                  <item.icon className="h-4 w-4" />
                  <span>{item.titulo}</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { isAdmin, canEditPipeline, canManageUsers, canViewLogs, signOut } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const [passwordOpen, setPasswordOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
        {!collapsed ? (
          <div className="flex flex-col items-center gap-2 py-1 text-[hsl(var(--silver))] [&_.text-foreground]:text-[hsl(var(--silver))] [&_.text-muted-foreground]:text-[hsl(var(--steel))]">
            <CrmLogo mark="chrome" />
          </div>
        ) : (
          <div className="flex items-center justify-center py-1 text-[hsl(var(--silver))]">
            <CrmMark variant="chrome" className="h-8 w-10" />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <Grupo
          label="Operação"
          itens={[
            { titulo: "Dashboard", url: "/", icon: LayoutDashboard, exact: true },
            { titulo: "Funis", url: "/oportunidades", icon: GitFork },
            { titulo: "Leads", url: "/contatos", icon: Users },
            { titulo: "Empresas", url: "/empresas", icon: Building2 },
            { titulo: "Orçamentos", url: "/orcamentos", icon: FileSpreadsheet },
            { titulo: "Propostas", url: "/propostas", icon: FileCheck },
            { titulo: "Pedidos", url: "/pedidos", icon: Package },
            ...(canViewLogs ? [{ titulo: "Melhorias", url: "/melhorias", icon: Sparkles }] : []),
          ]}
        />
        <Grupo
          label="Diagnóstico"
          itens={[
            { titulo: "Painel índice", url: "/indice", icon: Gauge },
            { titulo: "Diagnósticos", url: "/diagnosticos", icon: Stethoscope },
          ]}
        />
        {isAdmin && (
          <Grupo
            label="NPS"
            itens={[
              { titulo: "Painel da equipe", url: "/equipe", icon: UsersRound },
              { titulo: "Funil de NPS", url: "/nps", icon: Smile },
              { titulo: "Indicadores", url: "/indicadores", icon: LineChart },
              { titulo: "Relatórios", url: "/relatorios", icon: BarChart3 },
            ]}
          />
        )}
        <Grupo
          label="Secretária IA"
          itens={[
            { titulo: "Agenda", url: "/calendario", icon: CalendarDays },
            { titulo: "Planning", url: "/planning", icon: CalendarRange },
            { titulo: "Assistente IA", url: "/assistente", icon: Bot },
            { titulo: "Tarefas", url: "/tarefas", icon: CheckSquare },
          ]}
        />
        <Grupo
          label="Comunicação"
          itens={[
            { titulo: "Mensagens", url: "/chat", icon: MessageCircle },
            { titulo: "Ligações", url: "/ligacoes", icon: Phone },
            { titulo: "Atendimento", url: "/atendimento", icon: Headphones },
            { titulo: "E-mail marketing", url: "/email", icon: Mail },
            { titulo: "Remarketing", url: "/remarketing", icon: RefreshCw },
            { titulo: "Meta / Disparos", url: "/meta", icon: Megaphone },
          ]}
        />
        <Grupo
          label="Gestão autônoma"
          itens={[
            { titulo: "Central de gestão", url: "/gestao", icon: Landmark },
            ...(canManageUsers ? [{ titulo: "Auditoria IA comercial", url: "/admin/ia", icon: Bot }] : []),
            { titulo: "Auditoria de reuniões", url: "/reunioes", icon: ClipboardCheck },
            { titulo: "Prospecção outbound", url: "/outbound", icon: Radar },
            { titulo: "Templates WhatsApp", url: "/meta", icon: FileText },
          ]}
        />
        {(canEditPipeline || canManageUsers || canViewLogs) && (
          <Grupo
            label="Administração"
            itens={[
              ...(canEditPipeline ? [{ titulo: "Etapas", url: "/pipeline", icon: Settings2 }] : []),
              ...(canManageUsers
                ? [
                    { titulo: "Importar", url: "/importar", icon: Upload },
                    { titulo: "Campos personalizados", url: "/campos", icon: Puzzle },
                    { titulo: "Automações", url: "/automacoes", icon: Workflow },
                    { titulo: "Usuários", url: "/admin/usuarios", icon: Shield },
                    { titulo: "Papéis", url: "/papeis", icon: ShieldCheck },
                    { titulo: "LGPD", url: "/admin/lgpd", icon: Scale },
                  ]
                : []),
              ...(canViewLogs
                ? [
                    { titulo: "Blueprint (links)", url: "/admin/api", icon: Link2 },
                    { titulo: "Saúde", url: "/admin/saude", icon: Activity },
                    { titulo: "Logs", url: "/admin/logs", icon: ClipboardList },
                  ]
                : []),
            ]}
          />
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border bg-sidebar/60">
        {!collapsed ? (
          <div className="space-y-2 px-3 pb-3 pt-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={() => setPasswordOpen(true)}
            >
              <KeyRound className="h-3.5 w-3.5" />
              Alterar senha
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 border-sidebar-border bg-transparent text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={handleLogout}
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 px-2 pb-3 pt-3">
            <Button variant="ghost" size="icon" title="Alterar senha" onClick={() => setPasswordOpen(true)}>
              <KeyRound className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" title="Sair" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        )}
      </SidebarFooter>
      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </Sidebar>
  );
}
