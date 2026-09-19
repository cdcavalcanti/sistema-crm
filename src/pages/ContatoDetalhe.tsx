import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Mail, Phone, Tags, Pencil, Calendar, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDateTime, fmtPhone } from "@/lib/format";
import { EditarContatoDialog } from "@/components/contatos/EditarContatoDialog";
import { displayOrigem } from "@/lib/origem";
import { SdrQualificacaoCard } from "@/components/chat/SdrQualificacaoCard";

export default function ContatoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [editando, setEditando] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["contato", id],
    enabled: !!id,
    queryFn: async () => {
      const [contato, opps, tarefas] = await Promise.all([
        supabase.from("contatos").select("*").eq("id", id!).maybeSingle(),
        supabase
          .from("oportunidades")
          .select("id, titulo, origem, criado_em, etapa:etapas(nome,cor)")
          .eq("contato_id", id!)
          .order("criado_em", { ascending: false }),
        supabase
          .from("tarefas")
          .select("id, titulo, status, due_date, prioridade")
          .eq("contato_id", id!)
          .order("criado_em", { ascending: false })
          .limit(20),
      ]);
      return {
        contato: contato.data,
        oportunidades: opps.data ?? [],
        tarefas: tarefas.data ?? [],
      };
    },
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!data?.contato) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <p className="text-sm text-muted-foreground">Contato não encontrado.</p>
      </div>
    );
  }

  const c = data.contato;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <Button variant="outline" onClick={() => setEditando(true)}>
          <Pencil className="mr-2 h-3.5 w-3.5" />
          Editar
        </Button>
      </div>

      <header className="space-y-1">
        <p className="page-eyebrow">Contato</p>
        <h1 className="page-title">{c.nome}</h1>
        <p className="page-subtitle">Cadastrado em {fmtDateTime(c.criado_em)}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="surface-card space-y-4 p-6 lg:col-span-1">
          <h2 className="page-eyebrow">Informações</h2>
          {c.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>
            </div>
          )}
          {c.telefone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              {fmtPhone(c.telefone)}
            </div>
          )}
          {c.nome_estabelecimento && (
            <div className="flex items-center gap-2 text-sm">
              <Store className="h-4 w-4 text-muted-foreground" />
              {c.nome_estabelecimento}
              {c.anos_operacao != null && (
                <span className="text-xs text-muted-foreground">· {c.anos_operacao} anos de operação</span>
              )}
            </div>
          )}
          {c.segmento && (
            <div className="flex items-center gap-2 text-sm">
              <Tags className="h-4 w-4 text-muted-foreground" />
              Segmento: {c.segmento}
            </div>
          )}
          {c.observacoes && (
            <div className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap">
              {c.observacoes}
            </div>
          )}
          {c.observacoes_internas && (
            <div className="space-y-1">
              <p className="page-eyebrow">Observações internas</p>
              <div className="rounded-md border border-dashed border-amber-300/60 bg-amber-50/50 p-3 text-sm whitespace-pre-wrap dark:border-amber-500/30 dark:bg-amber-500/10">
                {c.observacoes_internas}
              </div>
            </div>
          )}
          <div className="divider-rule" />
          <SdrQualificacaoCard telefone={c.telefone} contatoId={c.id} compact />
        </div>

        <div className="surface-card space-y-4 p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="page-eyebrow">Oportunidades ({data.oportunidades.length})</h2>
          </div>
          <ol className="divide-y divide-border/60">
            {data.oportunidades.map((o: any) => (
              <li key={o.id}>
                <Link
                  to={`/oportunidades/${o.id}`}
                  className="flex items-center justify-between gap-3 px-2 py-3 hover:bg-secondary/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ background: o.etapa?.cor || "hsl(var(--primary))" }}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{o.titulo ?? o.etapa?.nome ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {o.etapa?.nome ?? "—"} · {displayOrigem(o.origem)}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end leading-tight">
                    <span className="text-[10px] text-muted-foreground">{fmtDateTime(o.criado_em)}</span>
                  </div>
                </Link>
              </li>
            ))}
            {data.oportunidades.length === 0 && (
              <li className="py-6 text-center text-sm text-muted-foreground">
                Sem oportunidades vinculadas.
              </li>
            )}
          </ol>
        </div>

        <div className="surface-card space-y-4 p-6 lg:col-span-3">
          <h2 className="page-eyebrow">Tarefas</h2>
          <ol className="space-y-2">
            {data.tarefas.map((t: any) => (
              <li key={t.id} className="flex items-center justify-between gap-3 rounded-md border border-border/50 px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  {t.titulo}
                  <span className="text-xs text-muted-foreground">· {t.status}</span>
                </div>
                {t.due_date && <span className="text-xs text-muted-foreground">{fmtDateTime(t.due_date)}</span>}
              </li>
            ))}
            {data.tarefas.length === 0 && (
              <li className="py-4 text-center text-sm text-muted-foreground">Nenhuma tarefa.</li>
            )}
          </ol>
        </div>
      </div>

      <EditarContatoDialog contato={c} open={editando} onOpenChange={setEditando} />
    </div>
  );
}
