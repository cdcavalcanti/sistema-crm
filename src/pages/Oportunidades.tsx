import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  X,
  Trash2,
  FileSpreadsheet,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { fmtDateTime } from "@/lib/format";
import { NovaOportunidadeDialog } from "@/components/oportunidades/NovaOportunidadeDialog";
import { KanbanView } from "@/components/oportunidades/KanbanView";
import { displayOrigem, ORIGENS_DESTAQUE, OUTRAS_ORIGENS_LABEL } from "@/lib/origem";
import { exportarOportunidadesXlsx } from "@/lib/exportar-oportunidades";
import { useAuth } from "@/hooks/useAuth";
import {
  FILTROS_VAZIOS,
  FILTRO_TODOS,
  applyOportunidadeFiltros,
  fetchContatoIdsForSearch,
  fetchResponsaveisDisponiveis,
  temFiltrosAtivos,
  type OportunidadeFilters,
} from "@/lib/oportunidades-filtros";

const PAGE_SIZE = 50;

export default function Oportunidades() {
  const [params, setParams] = useSearchParams();
  // Default agora é kanban (passa view=lista pra ir pra lista)
  const view = (params.get("view") === "lista" ? "lista" : "kanban") as "kanban" | "lista";
  const [page, setPage] = useState(0);
  const [filters, setFilters] = useState<OportunidadeFilters>(FILTROS_VAZIOS);
  const [exportando, setExportando] = useState(false);
  const [removendo, setRemovendo] = useState<{ id: string; titulo: string | null } | null>(null);
  const { isAdmin, responsavelCrm } = useAuth();
  const qc = useQueryClient();
  const [minhaCarteira, setMinhaCarteira] = useState(false);

  const setFilter = <K extends keyof OportunidadeFilters>(
    key: K,
    value: OportunidadeFilters[K],
  ) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  };

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("oportunidades").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead excluído");
      qc.invalidateQueries({ queryKey: ["oportunidades"] });
      setRemovendo(null);
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro ao excluir"),
  });

  const gerarRelatorio = async () => {
    setExportando(true);
    try {
      const n = await exportarOportunidadesXlsx(filters);
      toast.success(`Relatório gerado (${n} oportunidade${n === 1 ? "" : "s"})`);
    } catch (err: any) {
      toast.error(err?.message ?? "Erro ao gerar relatório");
    } finally {
      setExportando(false);
    }
  };

  // Lista de responsáveis distintos pra popular o dropdown
  const { data: responsaveis = [] } = useQuery({
    queryKey: ["responsaveis-distintos"],
    queryFn: fetchResponsaveisDisponiveis,
    staleTime: 60_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["oportunidades", "lista", filters, page],
    enabled: view === "lista",
    queryFn: async () => {
      const contatoIds = await fetchContatoIdsForSearch(filters.searchText);
      let query = supabase
        .from("oportunidades")
        .select(
          "id, titulo, interesse, nome_estabelecimento, anos_operacao, responsavel, origem, criado_em, contato:contatos(id, nome, email, telefone), etapa:etapas(nome, cor)",
          { count: "exact" },
        )
        .order("criado_em", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      query = applyOportunidadeFiltros(query, filters, contatoIds);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const inicio = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const fim = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="page-eyebrow">Pipeline comercial</p>
          <h1 className="page-title">Oportunidades</h1>
          <p className="page-subtitle">Acompanhe cada lead do primeiro contato até o fechamento.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border bg-card p-0.5">
            <Button
              variant={view === "kanban" ? "default" : "ghost"}
              size="sm"
              onClick={() => setParams({})}
            >
              <LayoutGrid className="mr-2 h-3.5 w-3.5" />
              Kanban
            </Button>
            <Button
              variant={view === "lista" ? "default" : "ghost"}
              size="sm"
              onClick={() => setParams({ view: "lista" })}
            >
              <List className="mr-2 h-3.5 w-3.5" />
              Lista
            </Button>
          </div>
          <Button variant="outline" onClick={gerarRelatorio} disabled={exportando}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            {exportando ? "Gerando…" : "Gerar Relatório"}
          </Button>
          <NovaOportunidadeDialog />
        </div>
      </header>

      {/* Barra de filtros — comum às duas views */}
      <div className="surface-card space-y-3 p-4">
        <div className="flex items-center gap-3">
          <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <Input
            placeholder="Buscar por qualquer dado: nome, telefone, email, empresa, segmento, observações, motivo…"
            value={filters.searchText}
            onChange={(e) => setFilter("searchText", e.target.value)}
            className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
          {view === "lista" && data && (
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {inicio}–{fim} de {total}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Origem</label>
            <Select value={filters.origem} onValueChange={(v) => setFilter("origem", v)}>
              <SelectTrigger className="h-9 w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTRO_TODOS}>Todas</SelectItem>
                {ORIGENS_DESTAQUE.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
                <SelectItem value={OUTRAS_ORIGENS_LABEL}>{OUTRAS_ORIGENS_LABEL}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Responsável</label>
            <Select
              value={filters.responsavel}
              onValueChange={(v) => {
                setMinhaCarteira(false);
                setFilter("responsavel", v);
              }}
            >
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FILTRO_TODOS}>Todos</SelectItem>
                {responsaveis.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {responsavelCrm && (
            <Button
              type="button"
              size="sm"
              variant={minhaCarteira ? "default" : "outline"}
              className="h-9"
              onClick={() => {
                const next = !minhaCarteira;
                setMinhaCarteira(next);
                setFilter("responsavel", next ? responsavelCrm : FILTRO_TODOS);
              }}
            >
              Minha carteira
            </Button>
          )}
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Criado de</label>
            <Input
              type="date"
              value={filters.criadoDe}
              onChange={(e) => setFilter("criadoDe", e.target.value)}
              className="h-9 w-[150px]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Até</label>
            <Input
              type="date"
              value={filters.criadoAte}
              onChange={(e) => setFilter("criadoAte", e.target.value)}
              className="h-9 w-[150px]"
            />
          </div>
          {temFiltrosAtivos(filters) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 self-end text-muted-foreground"
              onClick={() => {
                setFilters(FILTROS_VAZIOS);
                setPage(0);
              }}
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {view === "kanban" ? (
        <KanbanView filters={filters} />
      ) : (
        <div className="surface-card divide-y divide-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Oportunidade</TableHead>
                <TableHead>Estabelecimento</TableHead>
                <TableHead>Segmento</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Criado</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={8}><Skeleton className="h-10 w-full" /></TableCell>
                </TableRow>
              )}
              {!isLoading && (data?.rows ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">
                    Sem oportunidades. Crie a primeira a partir de um contato ou lead do site.
                  </TableCell>
                </TableRow>
              )}
              {(data?.rows ?? []).map((o: any) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link
                      to={`/oportunidades/${o.id}`}
                      state={{ ids: (data?.rows ?? []).map((r: any) => r.id) }}
                      className="font-medium hover:underline"
                    >
                      {o.titulo ?? "—"}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      <Badge variant="secondary" className="font-normal">
                        {displayOrigem(o.origem)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {o.nome_estabelecimento ? (
                      <span>
                        {o.nome_estabelecimento}
                        {o.anos_operacao != null && (
                          <span className="ml-1 text-xs text-muted-foreground/70">
                            · {o.anos_operacao} anos de operação
                          </span>
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {o.interesse ?? "—"}
                  </TableCell>
                  <TableCell>
                    {o.contato ? (
                      <Link
                        to={`/contatos/${o.contato.id}`}
                        className="text-sm hover:underline"
                      >
                        {o.contato.nome}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: o.etapa?.cor || "hsl(var(--primary))" }}
                      />
                      {o.etapa?.nome ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {o.responsavel ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmtDateTime(o.criado_em)}
                  </TableCell>
                  <TableCell>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Excluir lead"
                        onClick={() => setRemovendo({ id: o.id, titulo: o.titulo })}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-2 border-t border-border/60 p-3">
              <span className="text-xs text-muted-foreground">
                Página {page + 1} de {totalPages}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Próxima
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <AlertDialog open={!!removendo} onOpenChange={(v) => !v && setRemovendo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A oportunidade
              {removendo?.titulo ? ` “${removendo.titulo}”` : ""} e seus comentários serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removendo && remover.mutate(removendo.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
