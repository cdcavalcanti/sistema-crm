import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContatoCombobox } from "@/components/contatos/ContatoCombobox";
import {
  ORIGENS_OPORTUNIDADE,
  RESPONSAVEIS_CRM,
  SEGMENTOS_CRM,
  PORTES_CRM,
  composeInteresse,
} from "@/lib/constants";
import { Briefcase } from "lucide-react";

const schema = z.object({
  contato_id: z.string().uuid().optional().or(z.literal("")),
  titulo: z.string().max(200).optional(),
  segmento: z.string().optional(),
  porte: z.string().optional(),
  nome_estabelecimento: z.string().max(200).optional(),
  anos_operacao: z
    .string()
    .optional()
    .refine((v) => !v || (/^\d+$/.test(v) && Number(v) >= 0 && Number(v) <= 100), {
      message: "Anos de operação inválidos",
    }),
  responsavel: z.string().optional(),
  origem: z.string().min(1, "Selecione a origem"),
  etapa_id: z.string().uuid().optional().or(z.literal("")),
  observacoes: z.string().optional(),
});

export function NovaOportunidadeDialog({
  trigger,
  contatoIdPadrao,
  etapaIdPadrao,
}: {
  trigger?: React.ReactNode;
  contatoIdPadrao?: string;
  etapaIdPadrao?: string;
}) {
  const [open, setOpen] = useState(false);
  const [contatoId, setContatoId] = useState<string | null>(contatoIdPadrao ?? null);
  const [novoModo, setNovoModo] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoTelefone, setNovoTelefone] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [etapaId, setEtapaId] = useState<string>(etapaIdPadrao ?? "");
  const [segmento, setSegmento] = useState<string>("");
  const [porte, setPorte] = useState<string>("");
  const [responsavel, setResponsavel] = useState<string>("");
  const [origem, setOrigem] = useState<string>("manual");
  const { responsavelCrm } = useAuth();

  // Default da carteira do usuário logado
  const responsavelEfetivo = responsavel || responsavelCrm || "";
  const qc = useQueryClient();

  const { data: etapas } = useQuery({
    queryKey: ["etapas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etapas")
        .select("id, nome, cor, ordem")
        .order("ordem");
      if (error) throw error;
      return data ?? [];
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof schema>) => {
      // criação inline de contato: cria o contato e usa o id na oportunidade
      let contatoIdFinal = data.contato_id ?? "";
      if (novoModo) {
        const { data: novoC, error: cErr } = await supabase
          .from("contatos")
          .insert({
            nome: novoNome.trim(),
            telefone: novoTelefone.trim() || null,
            email: novoEmail.trim() || null,
          })
          .select("id")
          .single();
        if (cErr) throw cErr;
        contatoIdFinal = novoC.id;
      }
      const interesse = composeInteresse(data.segmento ?? "", data.porte ?? "");
      // Sem etapa escolhida, cai na primeira etapa (Lead novo). Sem isso a opp
      // fica com etapa_id null e NÃO aparece em nenhuma coluna do kanban.
      let etapaFinal = data.etapa_id || null;
      if (!etapaFinal) {
        const { data: e1 } = await supabase
          .from("etapas").select("id").order("ordem", { ascending: true }).limit(1).maybeSingle();
        etapaFinal = e1?.id ?? null;
      }
      const { data: opp, error } = await supabase
        .from("oportunidades")
        .insert({
          contato_id: contatoIdFinal,
          titulo: data.titulo || null,
          interesse: interesse || null,
          nome_estabelecimento: data.nome_estabelecimento || null,
          anos_operacao: data.anos_operacao ? Number(data.anos_operacao) : null,
          responsavel: data.responsavel || null,
          origem: data.origem,
          etapa_id: etapaFinal,
          observacoes: data.observacoes || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return opp;
    },
    onSuccess: () => {
      toast.success("Oportunidade criada");
      qc.invalidateQueries({ queryKey: ["oportunidades"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["contato"] });
      qc.invalidateQueries({ queryKey: ["contatos"] });
      setOpen(false);
      setNovoModo(false); setNovoNome(""); setNovoTelefone(""); setNovoEmail("");
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro ao criar oportunidade"),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (novoModo) {
      if (!novoNome.trim()) {
        toast.error("Informe o nome do novo contato");
        return;
      }
    } else if (!contatoId) {
      toast.error("Selecione um contato");
      return;
    }
    const parsed = schema.safeParse({
      contato_id: novoModo ? "" : (contatoId ?? ""),
      titulo: fd.get("titulo"),
      segmento,
      porte,
      nome_estabelecimento: fd.get("nome_estabelecimento"),
      anos_operacao: fd.get("anos_operacao"),
      responsavel: responsavelEfetivo || undefined,
      origem,
      etapa_id: etapaId,
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
        if (o && !responsavel && responsavelCrm) setResponsavel(responsavelCrm);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Briefcase className="mr-2 h-4 w-4" />
            Nova oportunidade
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova oportunidade</DialogTitle>
          <DialogDescription>Crie uma oportunidade vinculada a um contato.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Contato *</Label>
              <button
                type="button"
                onClick={() => setNovoModo((v) => !v)}
                className="text-xs font-medium text-primary hover:underline"
              >
                {novoModo ? "Selecionar existente" : "＋ Novo contato"}
              </button>
            </div>
            {novoModo ? (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <Input placeholder="Nome do contato *" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="Telefone" value={novoTelefone} onChange={(e) => setNovoTelefone(e.target.value)} />
                  <Input placeholder="E-mail" value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} />
                </div>
              </div>
            ) : (
              <ContatoCombobox value={contatoId} onChange={(id) => setContatoId(id)} />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título</Label>
            <Input id="titulo" name="titulo" placeholder="Ex.: Demo — Empresa X" />
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Segmento</Label>
              <Select value={segmento} onValueChange={setSegmento}>
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
              <Select value={porte} onValueChange={setPorte}>
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
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={responsavelEfetivo || undefined} onValueChange={setResponsavel}>
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
              <Select value={origem} onValueChange={setOrigem}>
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
              <Select value={etapaId} onValueChange={setEtapaId}>
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
