import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot } from "lucide-react";
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
import { carregarIaConfig, salvarIaConfig, type IaTenantConfig } from "@/lib/crm-ia";
import { RESPONSAVEIS_CRM } from "@/lib/constants";

export default function IaConfig() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["ia-tenant-config"],
    queryFn: carregarIaConfig,
  });
  const [form, setForm] = useState<IaTenantConfig | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const salvar = useMutation({
    mutationFn: () => salvarIaConfig(form!),
    onSuccess: () => {
      toast.success("Configuração da IA deste tenant salva");
      qc.invalidateQueries({ queryKey: ["ia-tenant-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !form) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="page-eyebrow flex items-center gap-2">
          <Bot className="h-4 w-4" /> IA do CRM
        </p>
        <h1 className="page-title">Persona e regras do tenant</h1>
        <p className="page-subtitle max-w-2xl">
          Um mecanismo só. A persona vale para leitura e para sugestão na ficha. O que ela pode
          prometer não autoriza envio de mensagem sozinha neste corte.
        </p>
      </header>

      <form
        className="surface-card max-w-2xl space-y-5 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label>Persona</Label>
          <Textarea
            rows={4}
            value={form.persona}
            onChange={(e) => setForm({ ...form, persona: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>O que pode prometer</Label>
          <Textarea
            rows={3}
            value={form.o_que_pode_prometer}
            onChange={(e) => setForm({ ...form, o_que_pode_prometer: e.target.value })}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Atribuição de lead novo</Label>
            <Select
              value={form.regra_atribuicao}
              onValueChange={(v) => setForm({ ...form, regra_atribuicao: v as IaTenantConfig["regra_atribuicao"] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixo">Fixo (responsável padrão)</SelectItem>
                <SelectItem value="round_robin">Round-robin entre carteiras</SelectItem>
                <SelectItem value="origem">Por origem (usa o padrão neste corte)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Responsável padrão</Label>
            <Select
              value={form.responsavel_padrao}
              onValueChange={(v) => setForm({ ...form, responsavel_padrao: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESPONSAVEIS_CRM.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Prazo sem resposta (horas)</Label>
            <Input
              type="number"
              min={1}
              max={720}
              value={form.prazo_sem_resposta_horas}
              onChange={(e) => setForm({ ...form, prazo_sem_resposta_horas: Number(e.target.value) })}
            />
            <p className="text-[11px] text-muted-foreground">Cria tarefa de follow-up. Não envia mensagem.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Dias sem atividade (esfriou)</Label>
            <Input
              type="number"
              min={1}
              max={365}
              value={form.dias_sem_atividade}
              onChange={(e) => setForm({ ...form, dias_sem_atividade: Number(e.target.value) })}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.campanha_fria_aprovada}
            onChange={(e) => setForm({ ...form, campanha_fria_aprovada: e.target.checked })}
          />
          Campanha de esfriados aprovada neste tenant (só fila — sem disparo automático)
        </label>
        <Button type="submit" disabled={salvar.isPending}>
          Salvar
        </Button>
      </form>
    </div>
  );
}
