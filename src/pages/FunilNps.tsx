import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, List, Search, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NovaOportunidadeDialog } from "@/components/oportunidades/NovaOportunidadeDialog";
import { KanbanView } from "@/components/oportunidades/KanbanView";
import {
  FILTROS_VAZIOS,
  applyOportunidadeFiltros,
  fetchContatoIdsForSearch,
  type OportunidadeFilters,
} from "@/lib/oportunidades-filtros";
import { fmtDateTime } from "@/lib/format";
import { useAuth } from "@/hooks/useAuth";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default function FunilNps() {
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") === "lista" ? "lista" : "kanban";
  const [filters, setFilters] = useState<OportunidadeFilters>(FILTROS_VAZIOS);

  const { data: funil } = useQuery({
    queryKey: ["funil-nps"],
    queryFn: async () => {
      const { data } = await supabase.from("funis").select("id, nome").eq("slug", "nps").maybeSingle();
      return data;
    },
  });

  const { data: lista } = useQuery({
    queryKey: ["nps-funil-lista", filters, funil?.id],
    enabled: view === "lista" && !!funil?.id,
    queryFn: async () => {
      const contatoIds = await fetchContatoIdsForSearch(filters.searchText);
      let query = supabase
        .from("oportunidades")
        .select("id, titulo, criado_em, contato:contatos(nome), etapa:etapas(nome, cor)")
        .eq("funil_id", funil!.id)
        .order("criado_em", { ascending: false });
      query = applyOportunidadeFiltros(query, filters, contatoIds);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="page-eyebrow">NPS · CS</p>
          <h1 className="page-title">Funil de NPS</h1>
          <p className="page-subtitle">Onboarding até a pesquisa. Arraste o card, abra o negócio ou crie um novo.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Button variant="outline" asChild>
              <Link to="/pipeline">
                <Settings2 className="mr-2 h-4 w-4" />
                Configurar etapas
              </Link>
            </Button>
          )}
          <div className="flex rounded-lg border border-border bg-card p-0.5">
            <Button variant={view === "kanban" ? "default" : "ghost"} size="sm" onClick={() => setParams({})}>
              <LayoutGrid className="mr-2 h-3.5 w-3.5" />
              Kanban
            </Button>
            <Button variant={view === "lista" ? "default" : "ghost"} size="sm" onClick={() => setParams({ view: "lista" })}>
              <List className="mr-2 h-3.5 w-3.5" />
              Lista
            </Button>
          </div>
          <NovaOportunidadeDialog funilId={funil?.id ?? null} />
        </div>
      </header>

      <div className="surface-card flex items-center gap-3 p-4">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar oportunidades deste funil"
          value={filters.searchText}
          onChange={(e) => setFilters((f) => ({ ...f, searchText: e.target.value }))}
          className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
      </div>

      {view === "kanban" ? (
        <KanbanView filters={filters} funilId={funil?.id ?? null} />
      ) : (
        <div className="surface-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Negócio</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Criado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(lista ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum negócio neste funil. Crie com Nova oportunidade.
                  </TableCell>
                </TableRow>
              )}
              {(lista ?? []).map((o: { id: string; titulo: string | null; criado_em: string; contato?: { nome?: string } | null; etapa?: { nome?: string; cor?: string | null } | null }) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link to={`/oportunidades/${o.id}`} className="font-medium hover:underline">{o.titulo ?? o.id}</Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{o.contato?.nome ?? "—"}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: o.etapa?.cor ?? "#999" }} />
                      {o.etapa?.nome ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fmtDateTime(o.criado_em)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
