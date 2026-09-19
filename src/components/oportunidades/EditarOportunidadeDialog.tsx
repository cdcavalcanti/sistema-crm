import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MOTIVOS_PERDA,
  ORIGENS_OPORTUNIDADE,
  RESPONSAVEIS_CRM,
  SEGMENTOS_CRM,
  PORTES_CRM,
  composeInteresse,
  parseInteresse,
} from "@/lib/constants";

type Oportunidade = {
  id: string;
  titulo: string | null;
  interesse: string | null;
  nome_estabelecimento: string | null;
  anos_operacao: number | null;
  responsavel: string | null;
  origem: string;
  etapa_id: string | null;
  observacoes: string | null;
  data_visita: string | null;
  data_fechamento: string | null;
  motivo_perda: string | null;
};

type FormState = Omit<Oportunidade, "anos_operacao" | "interesse"> & {
  anos_operacao: string;
  segmento: string;
  porte: string;
};

function toFormState(o: Oportunidade | null): FormState | null {
  if (!o) return null;
  const { segmento, porte } = parseInteresse(o.interesse);
  return {
    ...o,
    anos_operacao: o.anos_operacao != null ? String(o.anos_operacao) : "",
    segmento,
    porte,
  };
}

export function EditarOportunidadeDialog({
  oportunidade,
  open,
  onOpenChange,
}: {
  oportunidade: Oportunidade | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState | null>(() => toFormState(oportunidade));

  useEffect(() => setForm(toFormState(oportunidade)), [oportunidade]);

  const { data: etapas } = useQuery({
    queryKey: ["etapas"],
    queryFn: async () => {
      const { data } = await supabase
        .from("etapas")
        .select("id, nome, cor, tipo, ordem")
        .order("ordem");
      return data ?? [];
    },
  });

  // Tipo da etapa selecionada — controla os campos condicionais (Ganho/Perdido).
  const etapaSelecionada = (etapas ?? []).find((e: any) => e.id === form?.etapa_id);
  const tipoEtapa = (etapaSelecionada as any)?.tipo as string | undefined;

  const mutation = useMutation({
    mutationFn: async (input: FormState) => {
      const idadeStr = input.anos_operacao?.trim();
      if (idadeStr && !/^\d+$/.test(idadeStr)) {
        throw new Error("Anos de operação inválidos");
      }
      if (idadeStr && (Number(idadeStr) < 0 || Number(idadeStr) > 100)) {
        throw new Error("Anos de operação inválidos");
      }
      const interesse = composeInteresse(input.segmento, input.porte);
      // Mantém data_fechamento só em etapa de Ganho e motivo_perda só em Perdido.
      const tipo = (etapas ?? []).find((e: any) => e.id === input.etapa_id)?.tipo as
        | string
        | undefined;
      const { error } = await supabase
        .from("oportunidades")
        .update({
          titulo: input.titulo || null,
          interesse: interesse || null,
          nome_estabelecimento: input.nome_estabelecimento || null,
          anos_operacao: idadeStr ? Number(idadeStr) : null,
          responsavel: input.responsavel || null,
          origem: input.origem,
          etapa_id: input.etapa_id || null,
          observacoes: input.observacoes || null,
          data_visita: input.data_visita || null,
          data_fechamento: tipo === "ganho" ? input.data_fechamento || null : null,
          motivo_perda: tipo === "perdido" ? input.motivo_perda || null : null,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Oportunidade atualizada");
      qc.invalidateQueries({ queryKey: ["oportunidades"] });
      qc.invalidateQueries({ queryKey: ["oportunidade"] });
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro ao atualizar"),
  });

  if (!form) return null;

  const interesseLegado =
    oportunidade?.interesse && !form.segmento && !form.porte ? oportunidade.interesse : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar oportunidade</DialogTitle>
          <DialogDescription>Atualize informações e mova etapas.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(form);
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input
              value={form.titulo ?? ""}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-[1fr,7rem] gap-3">
            <div className="space-y-1.5">
              <Label>Estabelecimento</Label>
              <Input
                value={form.nome_estabelecimento ?? ""}
                onChange={(e) => setForm({ ...form, nome_estabelecimento: e.target.value })}
                placeholder="Ex.: Empresa X"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Anos de operação</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={form.anos_operacao ?? ""}
                onChange={(e) => setForm({ ...form, anos_operacao: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Segmento</Label>
              <Select
                value={form.segmento}
                onValueChange={(v) => setForm({ ...form, segmento: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {SEGMENTOS_CRM.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Canal / porte</Label>
              <Select
                value={form.porte}
                onValueChange={(v) => setForm({ ...form, porte: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {PORTES_CRM.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {interesseLegado && (
            <p className="text-xs text-muted-foreground">
              Segmento anterior (não padronizado): <strong>{interesseLegado}</strong>. Selecione segmento
              e canal / porte para padronizar.
            </p>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select
                value={form.responsavel ?? ""}
                onValueChange={(v) => setForm({ ...form, responsavel: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {RESPONSAVEIS_CRM.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Origem</Label>
              <Select
                value={form.origem ?? ""}
                onValueChange={(v) => setForm({ ...form, origem: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {ORIGENS_OPORTUNIDADE.map((o) => (
                    <SelectItem key={o.value} value={o.label}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Etapa</Label>
              <Select
                value={form.etapa_id ?? ""}
                onValueChange={(v) => setForm({ ...form, etapa_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(etapas ?? []).map((e: any) => (
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
          <div className="space-y-1.5">
            <Label>Data da demo</Label>
            <Input
              type="datetime-local"
              value={form.data_visita ? form.data_visita.slice(0, 16) : ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  data_visita: e.target.value ? new Date(e.target.value).toISOString() : null,
                })
              }
            />
          </div>
          {tipoEtapa === "ganho" && (
            <div className="space-y-1.5">
              <Label>Data do fechamento</Label>
              <Input
                type="date"
                value={form.data_fechamento ? form.data_fechamento.slice(0, 10) : ""}
                onChange={(e) => setForm({ ...form, data_fechamento: e.target.value || null })}
              />
            </div>
          )}
          {tipoEtapa === "perdido" && (
            <div className="space-y-1.5">
              <Label>Motivo da perda</Label>
              <Select
                value={form.motivo_perda ?? ""}
                onValueChange={(v) => setForm({ ...form, motivo_perda: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o motivo" />
                </SelectTrigger>
                <SelectContent>
                  {MOTIVOS_PERDA.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea
              rows={3}
              value={form.observacoes ?? ""}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
