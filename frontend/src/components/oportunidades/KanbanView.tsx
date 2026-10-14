import { useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  applyOportunidadeFiltros,
  fetchContatoIdsForSearch,
  FILTROS_VAZIOS,
  type OportunidadeFilters,
} from "@/lib/oportunidades-filtros";
import {
  MudancaEtapaDialog,
  exigeConfirmacao,
  type EtapaAlvo,
  type DadosMudancaEtapa,
} from "@/components/oportunidades/MudancaEtapaDialog";

type Etapa = { id: string; nome: string; cor: string | null; ordem: number; tipo: string | null; funil_id?: string | null };
type Oportunidade = {
  id: string;
  titulo: string | null;
  interesse: string | null;
  origem?: string | null;
  valor?: number | null;
  etapa_id: string | null;
  funil_id?: string | null;
  contato: { id: string; nome: string; telefone?: string | null } | null;
};

function Card({
  o,
  ids,
  onRemove,
}: {
  o: Oportunidade;
  ids?: string[];
  onRemove?: (o: Oportunidade) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: o.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`group/card relative rounded-lg border border-border bg-card p-3 shadow-card ${isDragging ? "opacity-40" : ""}`}
    >
      {onRemove && (
        <button
          type="button"
          title="Excluir lead"
          className="absolute right-1.5 top-1.5 z-10 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover/card:opacity-100"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove(o);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      <Link
        to={`/oportunidades/${o.id}`}
        state={ids ? { ids } : undefined}
        onClick={(e) => e.stopPropagation()}
        className="block pr-5"
      >
        <div className="truncate text-sm font-medium">{o.titulo ?? o.contato?.nome ?? "—"}</div>
        {o.contato?.nome && o.titulo && (
          <div className="truncate text-xs text-muted-foreground">{o.contato.nome}</div>
        )}
        {o.contato?.telefone && (
          <div className="mt-1 truncate text-xs text-primary">{o.contato.telefone}</div>
        )}
        <div className="mt-2 text-[11px] text-muted-foreground">
          {o.origem ? `Origem: ${o.origem}` : o.interesse ?? "—"}
        </div>
      </Link>
    </div>
  );
}

function Coluna({
  etapa,
  opps,
  onRemove,
}: {
  etapa: Etapa;
  opps: Oportunidade[];
  onRemove?: (o: Oportunidade) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 flex-shrink-0 flex-col rounded-sm border border-border bg-muted/30 ${
        isOver ? "ring-2 ring-primary/40" : ""
      }`}
    >
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: etapa.cor ?? "#999" }} />
          <span className="text-sm font-medium">{etapa.nome}</span>
          <span className="rounded-full bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {opps.length}
          </span>
        </div>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {opps.reduce((s, o) => s + Number(o.valor ?? 0), 0)
            ? `R$ ${opps.reduce((s, o) => s + Number(o.valor ?? 0), 0).toLocaleString("pt-BR")}`
            : "R$ 0"}
        </span>
      </div>
      <div className="flex max-h-[calc(100vh-260px)] flex-col gap-2 overflow-y-auto p-3">
        {opps.map((o) => (
          <Card key={o.id} o={o} ids={opps.map((x) => x.id)} onRemove={onRemove} />
        ))}
        {opps.length === 0 && (
          <div className="min-h-[7rem] rounded-sm border border-dashed border-border/80 bg-background/40" />
        )}
      </div>
    </div>
  );
}

export function KanbanView({
  filters = FILTROS_VAZIOS,
  funilId = null,
}: {
  filters?: OportunidadeFilters;
  funilId?: string | null;
} = {}) {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<Oportunidade | null>(null);

  const removerMutation = useMutation({
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

  const { data, isLoading } = useQuery({
    queryKey: ["oportunidades", "kanban", filters, funilId],
    queryFn: async () => {
      // Kanban precisa do estado COMPLETO (filtrado) para o DnD funcionar.
      // PostgREST default max-rows=1000 trunca queries grandes — então paginamos manualmente.
      const contatoIds = await fetchContatoIdsForSearch(filters.searchText);
      const PAGE = 1000;
      const opps: any[] = [];
      let offset = 0;
      while (true) {
        let query = supabase
          .from("oportunidades")
          .select("id, titulo, interesse, origem, valor, etapa_id, funil_id, contato:contatos(id, nome, telefone)")
          .order("criado_em", { ascending: false })
          .range(offset, offset + PAGE - 1);
        query = applyOportunidadeFiltros(query, filters, contatoIds);
        const { data, error } = await query;
        if (error) throw error;
        if (!data?.length) break;
        opps.push(...data);
        if (data.length < PAGE) break;
        offset += PAGE;
      }
      let etapasQ = supabase.from("etapas").select("*").order("ordem");
      if (funilId) etapasQ = etapasQ.eq("funil_id", funilId);
      const { data: etapas, error: etapasErr } = await etapasQ;
      const etapasOk = (!etapasErr ? etapas : (await supabase.from("etapas").select("*").order("ordem")).data) ?? [];
      const etapaIds = new Set(etapasOk.map((e: Etapa) => e.id));
      const oppsFunil = funilId
        ? (opps as Oportunidade[]).filter(
            (o) => o.funil_id === funilId || (!o.funil_id && etapaIds.has(o.etapa_id ?? "")),
          )
        : (opps as Oportunidade[]);
      return {
        etapas: etapasOk as Etapa[],
        opps: oppsFunil,
      };
    },
  });

  // Etapa de Ganho/Perdido pendente de confirmação (pop-up) + a oportunidade arrastada.
  const [pendente, setPendente] = useState<{ oppId: string; etapa: EtapaAlvo } | null>(null);

  const moveMutation = useMutation({
    mutationFn: async ({
      id,
      etapaId,
      dados,
    }: {
      id: string;
      etapaId: string;
      dados?: DadosMudancaEtapa;
    }) => {
      const patch: Record<string, unknown> = { etapa_id: etapaId };
      if (dados) {
        if (dados.data_fechamento !== undefined) patch.data_fechamento = dados.data_fechamento;
        if (dados.motivo_perda !== undefined) patch.motivo_perda = dados.motivo_perda;
      }
      const { error } = await supabase.from("oportunidades").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oportunidades"] }),
    onError: (err: any) => toast.error(err?.message ?? "Erro ao mover"),
  });

  const grupos = useMemo(() => {
    const map: Record<string, Oportunidade[]> = {};
    for (const e of data?.etapas ?? []) map[e.id] = [];
    for (const o of data?.opps ?? []) {
      if (o.etapa_id && map[o.etapa_id]) map[o.etapa_id].push(o);
    }
    return map;
  }, [data]);

  const activeOpp = data?.opps.find((o) => o.id === activeId);

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={(e: DragEndEvent) => {
        setActiveId(null);
        if (!e.over) return;
        const oppId = String(e.active.id);
        const etapaId = String(e.over.id);
        const opp = data?.opps.find((o) => o.id === oppId);
        if (!opp || opp.etapa_id === etapaId) return;
        const etapaDestino = data?.etapas.find((et) => et.id === etapaId);
        if (etapaDestino && exigeConfirmacao(etapaDestino.tipo)) {
          setPendente({ oppId, etapa: etapaDestino });
          return;
        }
        moveMutation.mutate({ id: oppId, etapaId });
      }}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {(data?.etapas ?? []).map((e) => (
          <Coluna
            key={e.id}
            etapa={e}
            opps={grupos[e.id] ?? []}
            onRemove={setRemovendo}
          />
        ))}
      </div>
      <DragOverlay>{activeOpp && <Card o={activeOpp} />}</DragOverlay>

      <MudancaEtapaDialog
        etapa={pendente?.etapa ?? null}
        open={!!pendente}
        onOpenChange={(v) => !v && setPendente(null)}
        onConfirm={(dados) => {
          if (pendente) moveMutation.mutate({ id: pendente.oppId, etapaId: pendente.etapa.id, dados });
          setPendente(null);
        }}
      />

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
              onClick={() => removendo && removerMutation.mutate(removendo.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DndContext>
  );
}
