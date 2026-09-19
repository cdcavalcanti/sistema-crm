import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, ExternalLink, MessageSquarePlus, UserPlus, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MudancaEtapaDialog,
  exigeConfirmacao,
  type EtapaAlvo,
  type DadosMudancaEtapa,
} from "@/components/oportunidades/MudancaEtapaDialog";
import { NovaOportunidadeDialog } from "@/components/oportunidades/NovaOportunidadeDialog";
import { EtiquetasContato } from "@/components/etiquetas/EtiquetasContato";
import { fmtWhats, tituloConversa, type ConversaResumo } from "./ConversaList";
import { SdrQualificacaoCard } from "./SdrQualificacaoCard";

// Painel lateral do chat: vincula a conversa a um contato/oportunidade do CRM,
// permite criar contato e oportunidade, mudar a etapa e comentar.
export function ChatCrmPanel({ conversa }: { conversa: ConversaResumo }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [comentario, setComentario] = useState("");
  const [etapaPendente, setEtapaPendente] = useState<EtapaAlvo | null>(null);
  const contatoId = conversa.contato_id ?? conversa.contato?.id ?? null;

  const { data, isLoading } = useQuery({
    // chave dentro do namespace "oportunidades" pra refrescar quando criar/editar
    queryKey: ["oportunidades", "chat-crm", contatoId],
    enabled: !!contatoId,
    queryFn: async () => {
      const [opp, etapas, contato] = await Promise.all([
        supabase
          .from("oportunidades")
          .select("id, titulo, etapa_id, etapa:etapas(id, nome, cor, tipo)")
          .eq("contato_id", contatoId!)
          .order("criado_em", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from("etapas").select("id, nome, cor, tipo, ordem").order("ordem"),
        supabase.from("contatos").select("id, nome").eq("id", contatoId!).maybeSingle(),
      ]);
      return { oportunidade: opp.data, etapas: etapas.data ?? [], contato: contato.data };
    },
  });

  const oportunidade = data?.oportunidade;

  // ---- criar contato a partir da conversa ----
  const criarContato = useMutation({
    mutationFn: async () => {
      const nome = conversa.nome_whatsapp || fmtWhats(conversa.telefone) || "Contato WhatsApp";
      const { data: novo, error } = await supabase
        .from("contatos")
        .insert({ nome, telefone: conversa.telefone })
        .select("id")
        .single();
      if (error || !novo) throw error ?? new Error("falha");
      await supabase.from("conversas").update({ contato_id: novo.id }).eq("id", conversa.id);
    },
    onSuccess: () => {
      toast.success("Contato criado e vinculado");
      qc.invalidateQueries({ queryKey: ["conversas"] });
      qc.invalidateQueries({ queryKey: ["oportunidades"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro ao criar contato"),
  });

  const aplicarEtapa = useMutation({
    mutationFn: async ({ etapaId, dados }: { etapaId: string; dados?: DadosMudancaEtapa }) => {
      if (!oportunidade) throw new Error("Sem oportunidade");
      const patch: Record<string, unknown> = { etapa_id: etapaId };
      if (dados) {
        if (dados.data_fechamento !== undefined) patch.data_fechamento = dados.data_fechamento;
        if (dados.motivo_perda !== undefined) patch.motivo_perda = dados.motivo_perda;
      }
      const { error } = await supabase.from("oportunidades").update(patch).eq("id", oportunidade.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Etapa atualizada no CRM");
      qc.invalidateQueries({ queryKey: ["oportunidades"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro"),
  });

  const onSelecionarEtapa = (etapaId: string) => {
    const etapa = (data?.etapas ?? []).find((e: any) => e.id === etapaId) as EtapaAlvo | undefined;
    if (etapa && exigeConfirmacao(etapa.tipo)) { setEtapaPendente(etapa); return; }
    aplicarEtapa.mutate({ etapaId });
  };

  const comentar = useMutation({
    mutationFn: async () => {
      if (!oportunidade || !user) throw new Error("Sem oportunidade");
      const { error } = await supabase.from("oportunidade_comentarios").insert({
        oportunidade_id: oportunidade.id, user_id: user.id, autor_email: user.email, conteudo: comentario.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setComentario("");
      toast.success("Comentário adicionado ao CRM");
      qc.invalidateQueries({ queryKey: ["comentarios", oportunidade?.id] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro ao comentar"),
  });

  // ---- Sem contato vinculado: oferecer criação ----
  if (!contatoId) {
    return (
      <div className="space-y-4 p-4">
        <SdrQualificacaoCard telefone={conversa.telefone} />
        <div className="divider-rule" />
        <div>
          <h3 className="page-eyebrow mb-1">Contato do WhatsApp</h3>
          <div className="text-sm font-medium">{tituloConversa(conversa)}</div>
          <div className="text-xs text-muted-foreground">{fmtWhats(conversa.telefone)}</div>
        </div>
        <p className="text-sm text-muted-foreground">
          Esta conversa ainda não está no CRM. Crie um contato para registrar e abrir oportunidades.
        </p>
        <Button className="w-full" disabled={criarContato.isPending} onClick={() => criarContato.mutate()}>
          <UserPlus className="mr-2 h-4 w-4" /> Criar contato
        </Button>
      </div>
    );
  }

  if (isLoading) return <div className="p-4"><Skeleton className="h-40 w-full" /></div>;

  return (
    <div className="space-y-5 p-4">
      <SdrQualificacaoCard
        telefone={conversa.telefone}
        contatoId={contatoId}
        oportunidadeId={oportunidade?.id}
      />

      <div className="divider-rule" />

      <div>
        <h3 className="page-eyebrow mb-1">Contato</h3>
        <Link to={`/contatos/${contatoId}`} className="text-sm font-medium hover:underline">
          {data?.contato?.nome ?? tituloConversa(conversa)}
        </Link>
        <div className="text-xs text-muted-foreground">{fmtWhats(conversa.telefone)}</div>
      </div>

      <div className="divider-rule" />

      <EtiquetasContato contatoId={contatoId} />

      <div className="divider-rule" />

      {!oportunidade ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Nenhuma oportunidade para este contato.</p>
          <NovaOportunidadeDialog
            contatoIdPadrao={contatoId}
            trigger={
              <Button size="sm" className="w-full">
                <Plus className="mr-2 h-3.5 w-3.5" /> Criar oportunidade
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <h3 className="page-eyebrow flex items-center gap-1.5">
              <Briefcase className="h-3.5 w-3.5" /> Oportunidade
            </h3>
            <Link to={`/oportunidades/${oportunidade.id}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:underline">
              Abrir <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          <div className="text-sm">{oportunidade.titulo ?? "Oportunidade"}</div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Mover para etapa</label>
            <Select value={oportunidade.etapa_id ?? ""} onValueChange={onSelecionarEtapa}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {(data?.etapas ?? []).map((e: any) => (
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

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Comentar no CRM</label>
            <Textarea rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Registre uma atualização…" />
            <Button size="sm" className="w-full" disabled={!comentario.trim() || comentar.isPending} onClick={() => comentar.mutate()}>
              <MessageSquarePlus className="mr-2 h-3.5 w-3.5" /> Adicionar comentário
            </Button>
          </div>
        </>
      )}

      <MudancaEtapaDialog
        etapa={etapaPendente}
        open={!!etapaPendente}
        onOpenChange={(v) => !v && setEtapaPendente(null)}
        onConfirm={(dados) => {
          if (etapaPendente) aplicarEtapa.mutate({ etapaId: etapaPendente.id, dados });
          setEtapaPendente(null);
        }}
      />
    </div>
  );
}
