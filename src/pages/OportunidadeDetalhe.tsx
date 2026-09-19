import { useState } from "react";
import { useNavigate, useParams, useLocation, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  User,
  UserCog,
  Calendar,
  CalendarCheck,
  Ban,
  Tag,
  Store,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import { fmtDate, fmtDateTime } from "@/lib/format";
import { displayOrigem } from "@/lib/origem";
import { EditarOportunidadeDialog } from "@/components/oportunidades/EditarOportunidadeDialog";
import { ComentariosOportunidade } from "@/components/oportunidades/ComentariosOportunidade";
import {
  MudancaEtapaDialog,
  exigeConfirmacao,
  type EtapaAlvo,
  type DadosMudancaEtapa,
} from "@/components/oportunidades/MudancaEtapaDialog";
import { useAuth } from "@/hooks/useAuth";
import { SdrQualificacaoCard } from "@/components/chat/SdrQualificacaoCard";

export default function OportunidadeDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [editando, setEditando] = useState(false);
  const [removendo, setRemovendo] = useState(false);
  const [etapaPendente, setEtapaPendente] = useState<EtapaAlvo | null>(null);

  // Sequência de IDs vinda da lista/kanban (para navegar Anterior/Próximo).
  const idsSequencia = (location.state as { ids?: string[] } | null)?.ids ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["oportunidade", id],
    enabled: !!id,
    queryFn: async () => {
      const [opp, etapas] = await Promise.all([
        supabase
          .from("oportunidades")
          .select(
            "*, contato:contatos(id, nome, email, telefone), etapa:etapas(id, nome, cor, tipo)",
          )
          .eq("id", id!)
          .maybeSingle(),
        supabase.from("etapas").select("id, nome, cor, tipo, ordem").order("ordem"),
      ]);
      return { oportunidade: opp.data, etapas: etapas.data ?? [] };
    },
  });

  const aplicarEtapa = useMutation({
    mutationFn: async ({
      etapaId,
      dados,
    }: {
      etapaId: string;
      dados?: DadosMudancaEtapa;
    }) => {
      const patch: Record<string, unknown> = { etapa_id: etapaId };
      if (dados) {
        if (dados.data_fechamento !== undefined) patch.data_fechamento = dados.data_fechamento;
        if (dados.motivo_perda !== undefined) patch.motivo_perda = dados.motivo_perda;
      }
      const { error } = await supabase.from("oportunidades").update(patch).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Etapa atualizada");
      qc.invalidateQueries({ queryKey: ["oportunidade", id] });
      qc.invalidateQueries({ queryKey: ["oportunidades"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro"),
  });

  // Intercepta a escolha de etapa: ganho/perdido abrem o pop-up; demais trocam direto.
  const onSelecionarEtapa = (etapaId: string) => {
    const etapa = (data?.etapas ?? []).find((e: any) => e.id === etapaId) as EtapaAlvo | undefined;
    if (etapa && exigeConfirmacao(etapa.tipo)) {
      setEtapaPendente(etapa);
      return;
    }
    aplicarEtapa.mutate({ etapaId });
  };

  const remover = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("oportunidades").delete().eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead excluído");
      navigate("/oportunidades");
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro"),
  });

  // Navegação Anterior/Próximo dentro da sequência da lista.
  const posAtual = idsSequencia && id ? idsSequencia.indexOf(id) : -1;
  const idAnterior = posAtual > 0 ? idsSequencia![posAtual - 1] : null;
  const idProximo =
    posAtual >= 0 && idsSequencia && posAtual < idsSequencia.length - 1
      ? idsSequencia[posAtual + 1]
      : null;
  const irPara = (alvo: string) =>
    navigate(`/oportunidades/${alvo}`, { state: { ids: idsSequencia } });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!data?.oportunidade) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <p className="text-sm text-muted-foreground">Oportunidade não encontrada.</p>
      </div>
    );
  }

  const o = data.oportunidade;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <div className="flex items-center gap-2">
          {idsSequencia && (
            <div className="mr-1 flex items-center rounded-lg border border-border bg-card p-0.5">
              <Button
                variant="ghost"
                size="sm"
                disabled={!idAnterior}
                onClick={() => idAnterior && irPara(idAnterior)}
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" />
                Anterior
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={!idProximo}
                onClick={() => idProximo && irPara(idProximo)}
              >
                Próximo
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          <Button variant="outline" onClick={() => setEditando(true)}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Editar
          </Button>
          <Button variant="outline" onClick={() => setRemovendo(true)}>
            <Trash2 className="mr-2 h-3.5 w-3.5 text-destructive" />
            Excluir Lead
          </Button>
        </div>
      </div>

      <header className="space-y-2">
        <p className="page-eyebrow flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: o.etapa?.cor || "hsl(var(--primary))" }}
          />
          {o.etapa?.nome ?? "—"}
        </p>
        <h1 className="page-title">{o.titulo ?? `Oportunidade · ${o.contato?.nome ?? "—"}`}</h1>
        <p className="page-subtitle">Criada em {fmtDateTime(o.criado_em)} · {displayOrigem(o.origem)}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="surface-card space-y-4 p-6 lg:col-span-1">
          <h2 className="page-eyebrow">Resumo</h2>
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            {o.contato ? (
              <Link to={`/contatos/${o.contato.id}`} className="hover:underline">
                {o.contato.nome}
              </Link>
            ) : (
              "—"
            )}
          </div>
          {o.contato?.email && (
            <div className="text-xs text-muted-foreground">{o.contato.email}</div>
          )}
          {o.contato?.telefone && (
            <div className="text-xs text-muted-foreground">{o.contato.telefone}</div>
          )}
          <div className="divider-rule" />
          {o.nome_estabelecimento && (
            <div className="flex items-center gap-2 text-sm">
              <Store className="h-4 w-4 text-muted-foreground" />
              {o.nome_estabelecimento}
              {o.anos_operacao != null && (
                <span className="text-xs text-muted-foreground">· {o.anos_operacao} anos de operação</span>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 text-sm">
            <Tag className="h-4 w-4 text-muted-foreground" />
            Segmento: {o.interesse ?? "—"}
          </div>
          {o.responsavel && (
            <div className="flex items-center gap-2 text-sm">
              <UserCog className="h-4 w-4 text-muted-foreground" />
              Responsável: {o.responsavel}
            </div>
          )}
          {o.data_visita && (
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Demo: {fmtDateTime(o.data_visita)}
            </div>
          )}
          {o.data_fechamento && (
            <div className="flex items-center gap-2 text-sm">
              <CalendarCheck className="h-4 w-4 text-emerald-600" />
              Fechamento: {fmtDate(o.data_fechamento)}
            </div>
          )}
          {o.motivo_perda && (
            <div className="flex items-center gap-2 text-sm">
              <Ban className="h-4 w-4 text-destructive" />
              Motivo da perda: {o.motivo_perda}
            </div>
          )}
          <Badge variant="secondary" className="font-normal">{displayOrigem(o.origem)}</Badge>

          <div className="divider-rule" />
          <SdrQualificacaoCard
            telefone={o.contato?.telefone}
            contatoId={o.contato?.id}
            oportunidadeId={o.id}
            compact
          />

          <div className="divider-rule" />
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Mover para etapa</label>
            <Select value={o.etapa_id ?? ""} onValueChange={onSelecionarEtapa}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {data.etapas.map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: e.cor }} />
                      {e.nome}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="surface-card space-y-6 p-6 lg:col-span-2">
          {o.descricao && (
            <div>
              <h2 className="page-eyebrow mb-2">Descrição</h2>
              <p className="whitespace-pre-wrap text-sm">{o.descricao}</p>
            </div>
          )}
          {o.observacoes && (
            <div>
              <h2 className="page-eyebrow mb-2">Observações</h2>
              <p className="whitespace-pre-wrap text-sm">{o.observacoes}</p>
            </div>
          )}
          <div>
            <h2 className="page-eyebrow mb-3">Comentários</h2>
            <ComentariosOportunidade oportunidadeId={o.id} />
          </div>
        </div>
      </div>

      <EditarOportunidadeDialog
        oportunidade={o}
        open={editando}
        onOpenChange={setEditando}
      />

      <MudancaEtapaDialog
        etapa={etapaPendente}
        open={!!etapaPendente}
        onOpenChange={(v) => !v && setEtapaPendente(null)}
        onConfirm={(dados) => {
          if (etapaPendente) aplicarEtapa.mutate({ etapaId: etapaPendente.id, dados });
          setEtapaPendente(null);
        }}
      />

      <AlertDialog open={removendo} onOpenChange={setRemovendo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lead?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Os comentários vinculados também serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => remover.mutate()}
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
