import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  CheckSquare,
  MessageCircle,
  RefreshCw,
  Megaphone,
  Bot,
  BarChart3,
  CalendarDays,
  Settings2,
  Shield,
  ClipboardList,
  Webhook,
  Activity,
  Sparkles,
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
    "group/item relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-card"
      : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
  ].join(" ");
}

export function AppSidebar() {
  const { isAdmin, canEditPipeline, canManageUsers, canViewLogs, signOut } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const [passwordOpen, setPasswordOpen] = useState(false);

  const operacoes = [
    { titulo: "Dashboard", url: "/", icon: LayoutDashboard, exact: true },
    { titulo: "Contatos", url: "/contatos", icon: Users },
    { titulo: "Oportunidades", url: "/oportunidades", icon: Briefcase },
    { titulo: "Chat", url: "/chat", icon: MessageCircle },
    { titulo: "Remarketing", url: "/remarketing", icon: RefreshCw },
    { titulo: "Meta / Disparos", url: "/meta", icon: Megaphone },
    { titulo: "Assistente IA (GPT)", url: "/assistente", icon: Bot },
    { titulo: "Tarefas", url: "/tarefas", icon: CheckSquare },
    { titulo: "Calendário", url: "/calendario", icon: CalendarDays },
    // Relatórios só para admin
    ...(isAdmin ? [{ titulo: "Relatórios", url: "/relatorios", icon: BarChart3 }] : []),
  ];

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
        {!collapsed ? (
          <div className="flex flex-col items-center gap-1">
            <CrmLogo className="h-16 -my-2" />
            <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              CRM comercial
            </span>
          </div>
        ) : (
          <div className="flex items-center justify-center">
            <CrmMark className="h-10 w-10" />
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        <SidebarGroup>
          <SidebarGroupLabel className="px-2 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Operações
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {operacoes.map((item) => (
                <SidebarMenuItem key={item.url}>
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

        {(canEditPipeline || canManageUsers || canViewLogs) && (
          <SidebarGroup>
            <SidebarGroupLabel className="px-2 text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Administração
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {canEditPipeline && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/pipeline" className={navClass}>
                        <Settings2 className="h-4 w-4" />
                        <span>Pipeline</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {canManageUsers && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/admin/usuarios" className={navClass}>
                        <Shield className="h-4 w-4" />
                        <span>Usuários</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {canViewLogs && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/admin/api" className={navClass}>
                        <Webhook className="h-4 w-4" />
                        <span>API · Webhook</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {canViewLogs && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/admin/saude" className={navClass}>
                        <Activity className="h-4 w-4" />
                        <span>Saúde</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {canViewLogs && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/admin/logs" className={navClass}>
                        <ClipboardList className="h-4 w-4" />
                        <span>Logs</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {canViewLogs && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/melhorias" className={navClass}>
                        <Sparkles className="h-4 w-4" />
                        <span>Melhorias internas</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border bg-sidebar/60">
        {!collapsed ? (
          <div className="space-y-2 px-3 pb-3 pt-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 bg-card/60 hover:bg-card"
              onClick={() => setPasswordOpen(true)}
            >
              <KeyRound className="h-3.5 w-3.5" />
              Alterar senha
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 bg-card/60 hover:bg-card"
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
