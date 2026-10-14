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
import { PergunteAoCrm } from "@/components/ia/PergunteAoCrm";
import { IaAcaoFicha } from "@/components/ia/IaAcaoFicha";

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
            "*, contato:contatos(id, nome, email, telefone, cargo, empresa_id), etapa:etapas(id, nome, cor, tipo, funil_id), empresa:empresas(id, nome)",
          )
          .eq("id", id!)
          .maybeSingle(),
        supabase.from("etapas").select("id, nome, cor, tipo, ordem, funil_id").order("ordem"),
      ]);
      const contatoId = opp.data?.contato_id as string | undefined;
      const [tarefas, orcs, reunioes, conv] = await Promise.all([
        supabase.from("tarefas").select("id, titulo, status, due_date").eq("oportunidade_id", id!).limit(8),
        supabase.from("orcamentos").select("id, titulo, status, valor").eq("oportunidade_id", id!).limit(8),
        supabase.from("reuniao_notas").select("id, titulo, status, data_reuniao, notas").eq("oportunidade_id", id!).limit(8),
        contatoId
          ? supabase.from("conversas").select("id, wa_chat_id, telefone").eq("contato_id", contatoId).limit(1).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      let msgs: { id: string; direcao: string; corpo: string | null; criado_em: string }[] = [];
      if (conv.data?.id) {
        const m = await supabase
          .from("mensagens")
          .select("id, direcao, corpo, criado_em")
          .eq("conversa_id", conv.data.id)
          .order("criado_em", { ascending: false })
          .limit(8);
        msgs = (m.data ?? []).reverse();
      }
      return {
        oportunidade: opp.data,
        etapas: etapas.data ?? [],
        tarefas: tarefas.data ?? [],
        orcamentos: orcs.data ?? [],
        reunioes: reunioes.data ?? [],
        conversa: conv.data,
        mensagens: msgs,
      };
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
  const funilId = o.funil_id ?? o.etapa?.funil_id;
  const etapasFunil = (data.etapas as { id: string; funil_id?: string | null }[]).filter(
    (e) => !funilId || !e.funil_id || e.funil_id === funilId,
  );
  const diasFunil = Math.max(
    0,
    Math.floor((Date.now() - new Date(o.criado_em).getTime()) / 86_400_000),
  );

  return (
    <div className="space-y-6">
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
        <p className="page-subtitle">
          Criada em {fmtDateTime(o.criado_em)} · no funil há {diasFunil} {diasFunil === 1 ? "dia" : "dias"} · {displayOrigem(o.origem)}
        </p>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-2">
        {etapasFunil.map((e: { id: string; nome: string; cor: string | null }) => {
          const ativa = e.id === o.etapa_id;
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => onSelecionarEtapa(e.id)}
              className={`min-w-[9rem] rounded-sm border px-3 py-2 text-left text-xs ${
                ativa ? "border-primary bg-primary/10 font-medium" : "border-border bg-card text-muted-foreground"
              }`}
            >
              <span className="mb-1 block h-1.5 w-1.5 rounded-full" style={{ background: e.cor ?? "#999" }} />
              {e.nome}
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card space-y-4 p-6">
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
          {(o.empresa || o.nome_estabelecimento) && (
            <div className="flex items-center gap-2 text-sm">
              <Store className="h-4 w-4 text-muted-foreground" />
              {o.empresa?.id ? (
                <Link to={`/empresas/${o.empresa.id}`} className="hover:underline">{o.empresa.nome}</Link>
              ) : (
                o.nome_estabelecimento
              )}
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

        <div className="surface-card space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="page-eyebrow">Ações rápidas</h2>
            <Button variant="outline" size="sm" onClick={() => setEditando(true)}>Editar</Button>
          </div>
          <p className="text-sm"><span className="text-muted-foreground">Valor</span> · {o.valor != null ? o.valor : "—"}</p>
          <p className="text-sm"><span className="text-muted-foreground">Responsável</span> · {o.responsavel ?? "—"}</p>
          {o.dor_cliente && <p className="text-sm"><span className="text-muted-foreground">Dor</span> · {o.dor_cliente}</p>}
        </div>
        </div>

        <div className="surface-card space-y-3 p-5">
          <h2 className="page-eyebrow">Relacionamento</h2>
          <p className="text-sm"><span className="text-muted-foreground">Cargo</span> · {o.cargo_contato ?? o.contato?.cargo ?? "—"}</p>
          <p className="text-sm"><span className="text-muted-foreground">Dor do cliente</span> · {o.dor_cliente ?? "—"}</p>
          <p className="text-sm"><span className="text-muted-foreground">Impacto no negócio</span> · {o.impacto_negocio ?? "—"}</p>
        </div>

        <div className="surface-card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="page-eyebrow">Tarefas</h2>
            <Link to="/tarefas" className="text-xs text-primary hover:underline">Nova tarefa</Link>
          </div>
          {(data.tarefas as { id: string; titulo: string; status: string }[]).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma tarefa neste negócio.</p>
          )}
          {(data.tarefas as { id: string; titulo: string; status: string; due_date: string | null }[]).map((t) => (
            <p key={t.id} className="text-sm">{t.titulo} · <span className="text-muted-foreground">{t.status}</span></p>
          ))}
        </div>
        <div className="surface-card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="page-eyebrow">Reuniões</h2>
            <Link to="/reunioes" className="text-xs text-primary hover:underline">Agendar</Link>
          </div>
          {(data.reunioes as { id: string; titulo: string; data_reuniao: string | null; notas: string | null }[]).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma reunião. Agenda no calendário deste CRM.</p>
          )}
          {(data.reunioes as { id: string; titulo: string; data_reuniao: string | null; notas: string | null }[]).map((r) => (
            <div key={r.id} className="text-sm">
              <p className="font-medium">{r.titulo} · {fmtDate(r.data_reuniao)}</p>
              {r.notas && <p className="mt-1 text-muted-foreground">{r.notas}</p>}
            </div>
          ))}
        </div>
        <div className="surface-card space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h2 className="page-eyebrow">Orçamentos</h2>
            <Link to="/orcamentos" className="text-xs text-primary hover:underline">Novo orçamento</Link>
          </div>
          {(data.orcamentos as { id: string; titulo: string; status: string; valor: number | null }[]).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum orçamento neste negócio.</p>
          )}
          {(data.orcamentos as { id: string; titulo: string; status: string; valor: number | null }[]).map((r) => (
            <p key={r.id} className="text-sm">{r.titulo} · {r.status} · {r.valor ?? "—"}</p>
          ))}
        </div>

        <div className="surface-card space-y-6 p-6">
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
          <PergunteAoCrm oportunidadeId={o.id ?? id} />
          <IaAcaoFicha oportunidadeId={o.id ?? id!} />
          <div>
            <h2 className="page-eyebrow mb-3">Linha do tempo · comentários</h2>
            <ComentariosOportunidade oportunidadeId={o.id} />
          </div>
        </div>
        </div>

        <aside className="surface-card flex max-h-[80vh] flex-col p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="page-eyebrow">Conversa</p>
            {data.conversa?.id && (
              <Link to="/chat" className="text-xs text-primary hover:underline">Abrir chat</Link>
            )}
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            {(data.mensagens as { id: string; direcao: string; corpo: string | null; criado_em: string }[]).length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma mensagem vinculada a este contato.</p>
            )}
            {(data.mensagens as { id: string; direcao: string; corpo: string | null; criado_em: string }[]).map((m) => (
              <div
                key={m.id}
                className={`rounded-sm px-3 py-2 text-sm ${
                  m.direcao === "out" || m.direcao === "saida"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <p>{m.corpo ?? "—"}</p>
                <p className="mt-1 text-[10px] opacity-70">{fmtDateTime(m.criado_em)}</p>
              </div>
            ))}
          </div>
        </aside>
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
