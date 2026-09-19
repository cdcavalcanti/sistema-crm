import { useState } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { UserPlus } from "lucide-react";
import { SEGMENTOS_CRM } from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const schema = z.object({
  nome: z.string().min(1, "Informe o nome").max(200),
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
});

export function NovoContatoDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [segmento, setSegmento] = useState("");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: z.infer<typeof schema>) => {
      const { data, error } = await supabase
        .from("contatos")
        .insert({
          nome: input.nome,
          email: input.email || null,
          telefone: input.telefone || null,
          nome_estabelecimento: input.nome_estabelecimento || null,
          anos_operacao: input.anos_operacao ? Number(input.anos_operacao) : null,
          segmento: input.segmento || null,
          observacoes: input.observacoes || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Contato criado");
      qc.invalidateQueries({ queryKey: ["contatos"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setOpen(false);
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro ao criar contato"),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({
      nome: fd.get("nome"),
      email: fd.get("email"),
      telefone: fd.get("telefone"),
      nome_estabelecimento: fd.get("nome_estabelecimento"),
      anos_operacao: fd.get("anos_operacao"),
      segmento: segmento || undefined,
      observacoes: fd.get("observacoes"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    mutation.mutate(parsed.data);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setSegmento("");
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <UserPlus className="mr-2 h-4 w-4" />
            Novo contato
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo contato</DialogTitle>
          <DialogDescription>Cadastre um novo contato no CRM.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome *</Label>
            <Input id="nome" name="nome" placeholder="Responsável que entrou em contato" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" name="email" type="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="telefone">Celular</Label>
              <Input id="telefone" name="telefone" />
            </div>
          </div>
          <div className="grid grid-cols-[1fr,7rem] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="nome_estabelecimento">Estabelecimento</Label>
              <Input id="nome_estabelecimento" name="nome_estabelecimento" placeholder="Ex.: Empresa X" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="anos_operacao">Anos de operação</Label>
              <Input id="anos_operacao" name="anos_operacao" type="number" min={0} max={100} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Segmento</Label>
            <Select value={segmento || undefined} onValueChange={setSegmento}>
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
            <Label htmlFor="observacoes">Observações</Label>
            <Textarea id="observacoes" name="observacoes" rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Salvando…" : "Criar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
