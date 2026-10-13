import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { RequireAuth, RequireRole } from "@/components/auth/Guards";
import Auth from "./pages/Auth";
import AprovarMelhoria from "./pages/AprovarMelhoria";
import Dashboard from "./pages/Dashboard";
import Contatos from "./pages/Contatos";
import ContatoDetalhe from "./pages/ContatoDetalhe";
import Oportunidades from "./pages/Oportunidades";
import OportunidadeDetalhe from "./pages/OportunidadeDetalhe";
import Pipeline from "./pages/Pipeline";
import Tarefas from "./pages/Tarefas";
import Relatorios from "./pages/Relatorios";
import Calendario from "./pages/Calendario";
import Chat from "./pages/Chat";
import Remarketing from "./pages/Remarketing";
import Meta from "./pages/Meta";
import Assistente from "./pages/Assistente";
import PedirMelhoria from "./pages/PedirMelhoria";
import Usuarios from "./pages/Usuarios";
import Logs from "./pages/Logs";
import Saude from "./pages/Saude";
import RecursosDev from "./pages/RecursosDev";
import Privacidade from "./pages/Privacidade";
import LgpdAdmin from "./pages/LgpdAdmin";
import IaConfig from "./pages/IaConfig";
import Empresas from "./pages/Empresas";
import EmpresaDetalhe from "./pages/EmpresaDetalhe";
import Pedidos from "./pages/Pedidos";
import Orcamentos from "./pages/Orcamentos";
import Propostas from "./pages/Propostas";
import PainelIndice from "./pages/PainelIndice";
import Diagnosticos from "./pages/Diagnosticos";
import PainelEquipe from "./pages/PainelEquipe";
import FunilNps from "./pages/FunilNps";
import Indicadores from "./pages/Indicadores";
import Planning from "./pages/Planning";
import Ligacoes from "./pages/Ligacoes";
import Atendimento from "./pages/Atendimento";
import EmailMarketing from "./pages/EmailMarketing";
import CentralGestao from "./pages/CentralGestao";
import AuditoriaReunioes from "./pages/AuditoriaReunioes";
import Prospeccao from "./pages/Prospeccao";
import Importar from "./pages/Importar";
import CamposPersonalizados from "./pages/CamposPersonalizados";
import Automacoes from "./pages/Automacoes";
import Papeis from "./pages/Papeis";
import NotFound from "./pages/NotFound";
import { LgpdAnalyticsBanner, LgpdConsentGate, lgpdAnalyticsPermitido } from "./components/lgpd/LgpdConsent";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/privacidade" element={<Privacidade />} />
          <Route path="/aprovar" element={<AprovarMelhoria />} />
          <Route
            element={
              <RequireAuth>
                <>
                  <LgpdConsentGate />
                  <AppLayout />
                </>
              </RequireAuth>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/contatos" element={<Contatos />} />
            <Route path="/contatos/:id" element={<ContatoDetalhe />} />
            <Route path="/empresas" element={<Empresas />} />
            <Route path="/empresas/:id" element={<EmpresaDetalhe />} />
            <Route path="/orcamentos" element={<Orcamentos />} />
            <Route path="/propostas" element={<Propostas />} />
            <Route path="/pedidos" element={<Pedidos />} />
            <Route path="/oportunidades" element={<Oportunidades />} />
            <Route path="/oportunidades/:id" element={<OportunidadeDetalhe />} />
            <Route path="/kanban" element={<Navigate to="/oportunidades?view=kanban" replace />} />
            <Route path="/indice" element={<PainelIndice />} />
            <Route path="/diagnosticos" element={<Diagnosticos />} />
            <Route
              path="/equipe"
              element={
                <RequireRole role="admin">
                  <PainelEquipe />
                </RequireRole>
              }
            />
            <Route
              path="/nps"
              element={
                <RequireRole role="admin">
                  <FunilNps />
                </RequireRole>
              }
            />
            <Route
              path="/indicadores"
              element={
                <RequireRole role="admin">
                  <Indicadores />
                </RequireRole>
              }
            />
            <Route path="/planning" element={<Planning />} />
            <Route path="/tarefas" element={<Tarefas />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/ligacoes" element={<Ligacoes />} />
            <Route path="/atendimento" element={<Atendimento />} />
            <Route path="/email" element={<EmailMarketing />} />
            <Route path="/remarketing" element={<Remarketing />} />
            <Route path="/meta" element={<Meta />} />
            <Route path="/gestao" element={<CentralGestao />} />
            <Route path="/reunioes" element={<AuditoriaReunioes />} />
            <Route path="/outbound" element={<Prospeccao />} />
            <Route path="/assistente" element={<Assistente />} />
            <Route
              path="/melhorias"
              element={
                <RequireRole role="super_admin">
                  <PedirMelhoria />
                </RequireRole>
              }
            />
            <Route
              path="/relatorios"
              element={
                <RequireRole role="admin">
                  <Relatorios />
                </RequireRole>
              }
            />
            <Route path="/calendario" element={<Calendario />} />
            <Route
              path="/pipeline"
              element={
                <RequireRole role="admin">
                  <Pipeline />
                </RequireRole>
              }
            />
            <Route
              path="/importar"
              element={
                <RequireRole role="admin">
                  <Importar />
                </RequireRole>
              }
            />
            <Route
              path="/campos"
              element={
                <RequireRole role="admin">
                  <CamposPersonalizados />
                </RequireRole>
              }
            />
            <Route
              path="/automacoes"
              element={
                <RequireRole role="admin">
                  <Automacoes />
                </RequireRole>
              }
            />
            <Route
              path="/papeis"
              element={
                <RequireRole role="admin">
                  <Papeis />
                </RequireRole>
              }
            />
            <Route
              path="/admin/usuarios"
              element={
                <RequireRole role="admin">
                  <Usuarios />
                </RequireRole>
              }
            />
            <Route
              path="/admin/lgpd"
              element={
                <RequireRole role="admin">
                  <LgpdAdmin />
                </RequireRole>
              }
            />
            <Route
              path="/admin/ia"
              element={
                <RequireRole role="admin">
                  <IaConfig />
                </RequireRole>
              }
            />
            <Route
              path="/admin/api"
              element={
                <RequireRole role="super_admin">
                  <RecursosDev />
                </RequireRole>
              }
            />
            <Route
              path="/admin/logs"
              element={
                <RequireRole role="super_admin">
                  <Logs />
                </RequireRole>
              }
            />
            <Route
              path="/admin/saude"
              element={
                <RequireRole role="super_admin">
                  <Saude />
                </RequireRole>
              }
            />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
        <LgpdAnalyticsBanner />
        {lgpdAnalyticsPermitido() ? <Analytics /> : null}
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
