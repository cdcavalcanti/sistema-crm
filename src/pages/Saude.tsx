import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, RefreshCw, Activity } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtRelative } from "@/lib/format";

type Auditoria = {
  id: string;
  tipo: string;
  status: string;
  resumo: string | null;
  detalhes: Record<string, unknown>;
  criado_em: string;
};

const ROTULOS: Record<string, { titulo: string; desc: string }> = {
  site: { titulo: "Site no ar", desc: "Páginas do site respondendo (HTTP 200)" },
  entradas: { titulo: "Formulários / Entradas", desc: "Leads do site chegando no CRM" },
  instagram: { titulo: "Instagram", desc: "Leads do Instagram (Linktree → WhatsApp) entrando no CRM" },
  meta: { titulo: "Meta vs CRM", desc: "Leads do Meta sincronizados com o CRM" },
  agendamento: { titulo: "Agendamentos", desc: "Demos da agenda do Google entrando no CRM" },
  avisos: { titulo: "Avisos comerciais", desc: "Equipe avisada no WhatsApp quando entra lead/demo" },
  movimentacoes: { titulo: "Movimentações", desc: "Atividade do pipeline" },
  whatsapp: { titulo: "WhatsApp comercial", desc: "Sessão do chat do dia a dia online" },
  disparos: { titulo: "Templates / Disparos", desc: "API oficial Meta + falhas de campanha" },
};

export default function Saude() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["auditorias"],
    queryFn: async () => {
      // últimas auditorias; pegamos a mais recente por tipo
      const { data, error } = await supabase
        .from("auditorias")
        .select("id, tipo, status, resumo, detalhes, criado_em")
        .order("criado_em", { ascending: false })
        .limit(40);
      if (error) throw error;
      const porTipo: Record<string, Auditoria> = {};
      for (const a of (data ?? []) as Auditoria[]) if (!porTipo[a.tipo]) porTipo[a.tipo] = a;
      return porTipo;
    },
    refetchInterval: 60_000,
  });

  const rodar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke("auditoria", { method: "POST" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Auditoria executada");
      setTimeout(() => qc.invalidateQueries({ queryKey: ["auditorias"] }), 1500);
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro ao rodar auditoria"),
  });

  const tipos = ["whatsapp", "disparos", "site", "entradas", "instagram", "meta", "agendamento", "avisos", "movimentacoes"];
  const algumAlerta = data && Object.values(data).some((a) => a.status === "alerta");

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="page-eyebrow">Operação · Monitoramento</p>
          <h1 className="page-title flex items-center gap-2">
            <Activity className="h-6 w-6" /> Saúde da Plataforma
          </h1>
          <p className="page-subtitle">
            WhatsApp, templates, site, Meta e pipeline — o que o comercial depende no dia a dia.
          </p>
        </div>
        <Button variant="outline" disabled={rodar.isPending} onClick={() => rodar.mutate()}>
          <RefreshCw className={`mr-2 h-4 w-4 ${rodar.isPending ? "animate-spin" : ""}`} />
          Rodar agora
        </Button>
      </header>

      {algumAlerta && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          Há alertas abertos. Confira abaixo — um aviso também foi enviado no WhatsApp.
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {tipos.map((t) => {
            const a = data?.[t];
            const rotulo = ROTULOS[t];
            const alerta = a?.status === "alerta";
            return (
              <div key={t} className={`surface-card p-5 ${alerta ? "ring-1 ring-amber-300" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-semibold">{rotulo.titulo}</h2>
                    <p className="text-xs text-muted-foreground">{rotulo.desc}</p>
                  </div>
                  {a ? (
                    alerta ? (
                      <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5" /> Alerta
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> OK
                      </span>
                    )
                  ) : (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">sem dados</span>
                  )}
                </div>
                <p className="mt-3 text-sm">{a?.resumo ?? "Aguardando primeira checagem…"}</p>
                {a && (
                  <p className="mt-2 text-[11px] text-muted-foreground">Checado {fmtRelative(a.criado_em)}</p>
                )}
                {a && Object.keys(a.detalhes ?? {}).length > 0 && (
                  <pre className="mt-2 max-h-32 overflow-auto rounded bg-muted/40 p-2 text-[10px] leading-relaxed">
                    {JSON.stringify(a.detalhes, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
