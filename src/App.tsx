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
            <Route path="/oportunidades" element={<Oportunidades />} />
            <Route path="/oportunidades/:id" element={<OportunidadeDetalhe />} />
            <Route path="/kanban" element={<Navigate to="/oportunidades?view=kanban" replace />} />
            <Route path="/tarefas" element={<Tarefas />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/remarketing" element={<Remarketing />} />
            <Route path="/meta" element={<Meta />} />
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
