import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const TIPOS = [
  { value: "inicial", label: "Inicial" },
  { value: "andamento", label: "Em andamento" },
  { value: "ganho", label: "Ganho" },
  { value: "perdido", label: "Perdido" },
];

type Etapa = { id: string; nome: string; ordem: number; cor: string | null; tipo: string | null };

export default function Pipeline() {
  const qc = useQueryClient();
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState("andamento");
  const [novaCor, setNovaCor] = useState("#3b82f6");
  const [removendo, setRemovendo] = useState<Etapa | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["etapas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etapas")
        .select("*")
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as Etapa[];
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      const proximaOrdem = (data?.length ?? 0) + 1;
      const { error } = await supabase
        .from("etapas")
        .insert({ nome: novoNome, cor: novaCor, ordem: proximaOrdem, tipo: novoTipo });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Etapa criada");
      setNovoNome("");
      qc.invalidateQueries({ queryKey: ["etapas"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro"),
  });

  const atualizar = useMutation({
    mutationFn: async (etapa: Etapa) => {
      const { error } = await supabase
        .from("etapas")
        .update({ nome: etapa.nome, cor: etapa.cor, ordem: etapa.ordem, tipo: etapa.tipo })
        .eq("id", etapa.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["etapas"] }),
    onError: (err: any) => toast.error(err?.message ?? "Erro"),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("etapas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Etapa removida");
      qc.invalidateQueries({ queryKey: ["etapas"] });
      setRemovendo(null);
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro"),
  });

  const mover = (etapa: Etapa, direcao: -1 | 1) => {
    if (!data) return;
    const idx = data.findIndex((e) => e.id === etapa.id);
    const swap = data[idx + direcao];
    if (!swap) return;
    Promise.all([
      atualizar.mutateAsync({ ...etapa, ordem: swap.ordem }),
      atualizar.mutateAsync({ ...swap, ordem: etapa.ordem }),
    ]);
  };

  return (
    <div className="space-y-8">
      <header>
        <p className="page-eyebrow">Administração</p>
        <h1 className="page-title">Pipeline</h1>
        <p className="page-subtitle">Configure as etapas que aparecem no kanban e nos relatórios.</p>
      </header>

      <div className="surface-card space-y-4 p-6">
        <h2 className="page-eyebrow">Nova etapa</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!novoNome.trim()) return;
            criar.mutate();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px_180px_auto] sm:items-end"
        >
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <Input type="color" value={novaCor} onChange={(e) => setNovaCor(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={novoTipo} onValueChange={setNovoTipo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={criar.isPending}>
            <Plus className="mr-2 h-4 w-4" />
            Criar
          </Button>
        </form>
      </div>

      <div className="surface-card divide-y divide-border/60">
        {isLoading && <div className="p-6"><Skeleton className="h-24 w-full" /></div>}
        {(data ?? []).map((e, idx) => (
          <div key={e.id} className="flex items-center gap-3 p-4">
            <span className="font-mono text-xs text-muted-foreground">#{idx + 1}</span>
            <Input
              type="color"
              value={e.cor ?? "#888"}
              onChange={(ev) => atualizar.mutate({ ...e, cor: ev.target.value })}
              className="h-8 w-12 p-0"
            />
            <Input
              value={e.nome}
              onChange={(ev) => atualizar.mutate({ ...e, nome: ev.target.value })}
              className="max-w-sm"
            />
            <Select
              value={e.tipo ?? "andamento"}
              onValueChange={(v) => atualizar.mutate({ ...e, tipo: v })}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => mover(e, -1)} disabled={idx === 0}>
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => mover(e, 1)}
                disabled={idx === (data?.length ?? 0) - 1}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setRemovendo(e)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={!!removendo} onOpenChange={(v) => !v && setRemovendo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover etapa?</AlertDialogTitle>
            <AlertDialogDescription>
              Oportunidades nessa etapa ficarão sem etapa atribuída.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removendo && remover.mutate(removendo.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
