import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDateTime } from "@/lib/format";

const FILTRO_TODOS = "__todos__";

// Mapa de ação → { label amigável, cor }. Acoes não mapeadas usam fallback.
const ACAO_META: Record<string, { label: string; tone: "verde" | "azul" | "vermelho" | "ambar" | "neutro" }> = {
  // Leads via API
  "lead.recebido": { label: "Lead recebido via webhook", tone: "verde" },

  // Contatos
  "contatos.criado": { label: "Contato criado", tone: "verde" },
  "contatos.editado": { label: "Contato editado", tone: "azul" },
  "contatos.excluido": { label: "Contato excluído", tone: "vermelho" },

  // Oportunidades
  "oportunidades.criado": { label: "Oportunidade criada", tone: "verde" },
  "oportunidades.editado": { label: "Oportunidade editada", tone: "azul" },
  "oportunidades.movida": { label: "Oportunidade movida de etapa", tone: "azul" },
  "oportunidades.excluido": { label: "Oportunidade excluída", tone: "vermelho" },

  // Calendário
  "calendario_eventos.criado": { label: "Evento de calendário criado", tone: "verde" },
  "calendario_eventos.editado": { label: "Evento de calendário editado", tone: "azul" },
  "calendario_eventos.excluido": { label: "Evento de calendário excluído", tone: "vermelho" },
  "google_calendar.conectado": { label: "Google Calendar conectado", tone: "verde" },

  // Tarefas
  "tarefas.criado": { label: "Tarefa criada", tone: "verde" },
  "tarefas.editado": { label: "Tarefa editada", tone: "azul" },
  "tarefas.excluido": { label: "Tarefa excluída", tone: "vermelho" },

  // Pipeline / etapas
  "etapas.criado": { label: "Etapa criada", tone: "verde" },
  "etapas.editado": { label: "Etapa editada", tone: "azul" },
  "etapas.excluido": { label: "Etapa excluída", tone: "vermelho" },

  // Acesso
  "acesso.login": { label: "Login no sistema", tone: "azul" },

  // Usuários
  "usuario.criado": { label: "Usuário criado", tone: "verde" },
  "usuario.papel_alterado": { label: "Papel de usuário alterado", tone: "ambar" },
  "user_roles.criado": { label: "Papel atribuído", tone: "verde" },
  "user_roles.editado": { label: "Papel atualizado", tone: "azul" },
  "user_roles.excluido": { label: "Papel removido", tone: "vermelho" },
};

const TONE_CLASS: Record<string, string> = {
  verde: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  azul: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  vermelho: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
  ambar: "bg-amber-500/10 text-amber-700 dark:text-amber-500 border-amber-500/20",
  neutro: "bg-muted text-muted-foreground border-border",
};

// Categorias pro dropdown de filtro. Cada uma mapeia pra um conjunto de entidades.
const CATEGORIAS: Array<{ value: string; label: string; entidades?: string[] }> = [
  { value: FILTRO_TODOS, label: "Todas as categorias" },
  { value: "acesso", label: "Acessos (login)" },
  { value: "leads", label: "Leads via API", entidades: ["oportunidades"] },
  { value: "calendario", label: "Calendário", entidades: ["calendario_eventos", "google_credentials"] },
  { value: "contatos", label: "Contatos", entidades: ["contatos"] },
  { value: "oportunidades", label: "Oportunidades (edições)", entidades: ["oportunidades"] },
  { value: "tarefas", label: "Tarefas", entidades: ["tarefas"] },
  { value: "usuarios", label: "Usuários", entidades: ["auth.users", "user_roles"] },
  { value: "pipeline", label: "Pipeline", entidades: ["etapas"] },
];

function metaParaAcao(acao: string) {
  if (ACAO_META[acao]) return ACAO_META[acao];
  // Fallback: deduz cor pelo sufixo
  if (acao.endsWith(".criado") || acao.endsWith(".conectado") || acao.endsWith(".recebido")) {
    return { label: acao, tone: "verde" as const };
  }
  if (acao.endsWith(".editado") || acao.endsWith(".movida") || acao.endsWith(".papel_alterado")) {
    return { label: acao, tone: "azul" as const };
  }
  if (acao.endsWith(".excluido")) {
    return { label: acao, tone: "vermelho" as const };
  }
  return { label: acao, tone: "neutro" as const };
}

type LogRow = {
  id: string;
  user_id: string | null;
  actor_email: string | null;
  actor_nome: string | null;
  acao: string;
  entidade: string | null;
  entidade_id: string | null;
  detalhes: Record<string, unknown> | null;
  criado_em: string;
};

export default function Logs() {
  const [q, setQ] = useState("");
  const [categoria, setCategoria] = useState<string>(FILTRO_TODOS);
  const [expandido, setExpandido] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["logs", q, categoria],
    queryFn: async () => {
      let query = supabase
        .from("audit_logs")
        .select("*")
        .order("criado_em", { ascending: false })
        .limit(500);
      if (q) {
        query = query.or(
          `acao.ilike.%${q}%,entidade.ilike.%${q}%,actor_email.ilike.%${q}%,actor_nome.ilike.%${q}%,entidade_id.ilike.%${q}%`,
        );
      }
      if (categoria !== FILTRO_TODOS) {
        const cat = CATEGORIAS.find((c) => c.value === categoria);
        if (cat?.entidades?.length) {
          query = query.in("entidade", cat.entidades);
        }
        // "leads via API" tem uma regra extra: precisa filtrar por actor_email começando com "webhook:"
        if (categoria === "leads") {
          query = query.ilike("actor_email", "webhook:%");
        }
        if (categoria === "oportunidades") {
          // Edições de oportunidade (exclui leads via webhook, que já estão na cat "leads")
          query = query.not("actor_email", "ilike", "webhook:%");
        }
        // "acessos" filtra diretamente pela ação de login
        if (categoria === "acesso") {
          query = query.eq("acao", "acesso.login");
        }
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as LogRow[];
    },
  });

  return (
    <div className="space-y-8">
      <header>
        <p className="page-eyebrow">Administração</p>
        <h1 className="page-title">Logs de auditoria</h1>
        <p className="page-subtitle">
          Toda alteração relevante registrada automaticamente — incluindo leads via API,
          eventos do calendário e modificações no CRM.
        </p>
      </header>

      <div className="surface-card divide-y divide-border/60">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por ação, entidade, usuário ou ID…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <Select value={categoria} onValueChange={setCategoria}>
            <SelectTrigger className="h-9 w-full sm:w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIAS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {data && (
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {data.length} registro(s)
            </span>
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Quando</TableHead>
              <TableHead>Ator</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Entidade</TableHead>
              <TableHead>ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-10 w-full" />
                </TableCell>
              </TableRow>
            )}
            {(data ?? []).map((l) => {
              const meta = metaParaAcao(l.acao);
              const aberto = expandido === l.id;
              const temDetalhes =
                l.detalhes && Object.keys(l.detalhes as Record<string, unknown>).length > 0;
              return (
                <Fragment key={l.id}>
                  <TableRow
                    className={temDetalhes ? "cursor-pointer hover:bg-muted/40" : ""}
                    onClick={() => temDetalhes && setExpandido(aberto ? null : l.id)}
                  >
                    <TableCell className="w-10 px-2 text-muted-foreground">
                      {temDetalhes ? (
                        aberto ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {fmtDateTime(l.criado_em)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {l.actor_nome ? (
                        <div className="flex flex-col leading-tight">
                          <span className="font-medium">{l.actor_nome}</span>
                          {l.actor_email && (
                            <span className="text-xs text-muted-foreground">{l.actor_email}</span>
                          )}
                        </div>
                      ) : (
                        l.actor_email ?? "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${TONE_CLASS[meta.tone]}`}
                      >
                        {meta.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {l.entidade ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {l.entidade_id?.slice(0, 8) ?? "—"}
                    </TableCell>
                  </TableRow>
                  {aberto && temDetalhes && (
                    <TableRow className="bg-muted/30">
                      <TableCell />
                      <TableCell colSpan={5} className="py-3">
                        <pre className="overflow-x-auto rounded-md border border-border/50 bg-background p-3 text-[11px] leading-relaxed">
                          <code>{JSON.stringify(l.detalhes, null, 2)}</code>
                        </pre>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
            {!isLoading && (data ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Sem registros nessa categoria.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
