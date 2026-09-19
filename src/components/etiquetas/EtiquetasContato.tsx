import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tag, Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

export type Etiqueta = { id: string; nome: string; cor: string };

const CORES = ["#ef4444", "#f97316", "#f59e0b", "#10b981", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#64748b"];
export const corDaEtiqueta = (nome: string) =>
  CORES[[...(nome || "?")].reduce((a, c) => a + c.charCodeAt(0), 0) % CORES.length];

// Chip visual de etiqueta (usado no chat e, de forma sutil, na lista de contatos).
export function EtiquetaChip({ nome, cor, onRemover }: { nome: string; cor?: string | null; onRemover?: () => void }) {
  const c = cor || corDaEtiqueta(nome);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `${c}1f`, color: c }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: c }} />
      {nome}
      {onRemover && (
        <button type="button" onClick={onRemover} className="opacity-60 hover:opacity-100">
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

// Editor de etiquetas de um contato: mostra as atuais, permite adicionar uma
// existente ou criar nova (compartilhada com todos) e remover.
export function EtiquetasContato({ contatoId }: { contatoId: string }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");

  const { data: doContato } = useQuery({
    queryKey: ["etiquetas-contato", contatoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contato_etiquetas")
        .select("etiqueta:etiquetas(id, nome, cor)")
        .eq("contato_id", contatoId);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.etiqueta).filter(Boolean) as Etiqueta[];
    },
  });

  const { data: todas } = useQuery({
    queryKey: ["etiquetas-todas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("etiquetas").select("id, nome, cor").order("nome");
      if (error) throw error;
      return (data ?? []) as Etiqueta[];
    },
  });

  const jaTem = new Set((doContato ?? []).map((e) => e.id));
  const termo = busca.trim().toLowerCase();
  const disponiveis = useMemo(
    () => (todas ?? []).filter((e) => !jaTem.has(e.id) && (!termo || e.nome.toLowerCase().includes(termo))),
    [todas, doContato, termo],
  );
  const existeExata = (todas ?? []).some((e) => e.nome.toLowerCase() === termo);

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ["etiquetas-contato", contatoId] });
    qc.invalidateQueries({ queryKey: ["etiquetas-todas"] });
    qc.invalidateQueries({ queryKey: ["contatos"] });
  };

  const adicionar = useMutation({
    mutationFn: async (etiquetaId: string) => {
      const { error } = await supabase.from("contato_etiquetas").insert({ contato_id: contatoId, etiqueta_id: etiquetaId });
      if (error) throw error;
    },
    onSuccess: () => { invalidar(); setBusca(""); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao adicionar etiqueta"),
  });

  const criar = useMutation({
    mutationFn: async (nome: string) => {
      const n = nome.trim();
      const { data: et, error } = await supabase
        .from("etiquetas")
        .insert({ nome: n, cor: corDaEtiqueta(n) })
        .select("id")
        .single();
      if (error || !et) throw error ?? new Error("falha");
      const { error: e2 } = await supabase.from("contato_etiquetas").insert({ contato_id: contatoId, etiqueta_id: et.id });
      if (e2) throw e2;
    },
    onSuccess: () => { invalidar(); setBusca(""); toast.success("Etiqueta criada"); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao criar etiqueta"),
  });

  const remover = useMutation({
    mutationFn: async (etiquetaId: string) => {
      const { error } = await supabase.from("contato_etiquetas").delete()
        .eq("contato_id", contatoId).eq("etiqueta_id", etiquetaId);
      if (error) throw error;
    },
    onSuccess: invalidar,
    onError: (e: any) => toast.error(e?.message ?? "Erro ao remover etiqueta"),
  });

  const ocupado = adicionar.isPending || criar.isPending;

  return (
    <div className="space-y-2">
      <h3 className="page-eyebrow flex items-center gap-1.5">
        <Tag className="h-3.5 w-3.5" /> Etiquetas
      </h3>
      <div className="flex flex-wrap items-center gap-1.5">
        {(doContato ?? []).map((e) => (
          <EtiquetaChip key={e.id} nome={e.nome} cor={e.cor} onRemover={() => remover.mutate(e.id)} />
        ))}
        {(doContato ?? []).length === 0 && <span className="text-xs text-muted-foreground">Sem etiquetas</span>}
        <Popover open={aberto} onOpenChange={setAberto}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
            >
              {ocupado ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} etiqueta
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-60 p-2">
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar ou criar…"
              className="mb-2 h-8"
              autoFocus
            />
            <div className="max-h-48 space-y-0.5 overflow-y-auto">
              {disponiveis.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => adicionar.mutate(e.id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted"
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: e.cor || corDaEtiqueta(e.nome) }} />
                  {e.nome}
                </button>
              ))}
              {termo && !existeExata && (
                <button
                  type="button"
                  onClick={() => criar.mutate(termo)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm text-primary hover:bg-muted"
                >
                  <Plus className="h-3.5 w-3.5" /> Criar “{busca.trim()}”
                </button>
              )}
              {!termo && disponiveis.length === 0 && (
                <p className="px-2 py-1 text-xs text-muted-foreground">Digite para criar uma etiqueta.</p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
