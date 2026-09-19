import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
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
import { SEGMENTOS_CRM } from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const schema = z.object({
  nome: z.string().min(1).max(200),
  email: z.string().email("E-mail inválido").max(255).optional().or(z.literal("")),
  telefone: z.string().optional(),
  nome_estabelecimento: z.string().max(200).optional(),
  anos_operacao: z
    .string()
    .optional()
    .refine((v) => !v || (/^\d+$/.test(v) && Number(v) >= 0 && Number(v) <= 100), {
      message: "Anos de operação inválidos",
    }),
  segmento: z.string().optional(),
  observacoes: z.string().optional(),
  observacoes_internas: z.string().optional(),
});

type Contato = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  nome_estabelecimento: string | null;
  anos_operacao: number | null;
  segmento: string | null;
  observacoes: string | null;
  observacoes_internas: string | null;
};

type FormState = Omit<Contato, "anos_operacao"> & { anos_operacao: string };

function toFormState(c: Contato | null): FormState | null {
  if (!c) return null;
  return { ...c, anos_operacao: c.anos_operacao != null ? String(c.anos_operacao) : "" };
}

export function EditarContatoDialog({
  contato,
  open,
  onOpenChange,
}: {
  contato: Contato | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState | null>(() => toFormState(contato));

  useEffect(() => setForm(toFormState(contato)), [contato]);

  const mutation = useMutation({
    mutationFn: async (input: { id: string; data: z.infer<typeof schema> }) => {
      const { error } = await supabase
        .from("contatos")
        .update({
          nome: input.data.nome,
          email: input.data.email || null,
          telefone: input.data.telefone || null,
          nome_estabelecimento: input.data.nome_estabelecimento || null,
          anos_operacao: input.data.anos_operacao ? Number(input.data.anos_operacao) : null,
          segmento: input.data.segmento || null,
          observacoes: input.data.observacoes || null,
          observacoes_internas: input.data.observacoes_internas || null,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contato atualizado");
      qc.invalidateQueries({ queryKey: ["contatos"] });
      qc.invalidateQueries({ queryKey: ["contato"] });
      onOpenChange(false);
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro ao atualizar"),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form) return;
    const parsed = schema.safeParse({
      nome: form.nome ?? "",
      email: form.email ?? "",
      telefone: form.telefone ?? "",
      nome_estabelecimento: form.nome_estabelecimento ?? "",
      anos_operacao: form.anos_operacao ?? "",
      segmento: form.segmento ?? "",
      observacoes: form.observacoes ?? "",
      observacoes_internas: form.observacoes_internas ?? "",
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    mutation.mutate({ id: form.id, data: parsed.data });
  };

  if (!form) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar contato</DialogTitle>
          <DialogDescription>Atualize os dados do contato.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input
              value={form.nome ?? ""}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Responsável que entrou em contato"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Celular</Label>
              <Input
                value={form.telefone ?? ""}
                onChange={(e) => setForm({ ...form, telefone: e.target.value })}
              />
            </div>
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
          <div className="space-y-1.5">
            <Label>Segmento</Label>
            <Select
              value={form.segmento || undefined}
              onValueChange={(v) => setForm({ ...form, segmento: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Ex.: Varejo" />
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
            <Label>Observações</Label>
            <Textarea
              rows={3}
              value={form.observacoes ?? ""}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Observações internas</Label>
            <Textarea
              rows={3}
              value={form.observacoes_internas ?? ""}
              onChange={(e) => setForm({ ...form, observacoes_internas: e.target.value })}
              placeholder="Anotações internas da equipe (não compartilhadas)"
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
