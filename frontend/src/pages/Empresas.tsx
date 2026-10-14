import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, GitMerge, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { fmtMoney, iniciais } from "@/lib/format";
import { PORTES_CRM } from "@/lib/constants";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type EmpresaRow = {
  id: string;
  nome: string;
  cnpj: string | null;
  tamanho: string | null;
  faturamento_mensal: number | null;
  leads: number;
};

const VAZIO = { nome: "", cnpj: "", tamanho: "", faturamento: "" };

export default function Empresas() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [form, setForm] = useState(VAZIO);
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [keeper, setKeeper] = useState<string>("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["empresas"],
    queryFn: async () => {
      const { data: empresas, error } = await supabase.from("empresas").select("*").order("nome");
      if (error) throw error;
      const { data: contatos } = await supabase.from("contatos").select("id, empresa_id");
      const count = new Map<string, number>();
      for (const c of contatos ?? []) {
        if (!c.empresa_id) continue;
        count.set(c.empresa_id, (count.get(c.empresa_id) ?? 0) + 1);
      }
      return (empresas ?? []).map((e) => ({ ...e, leads: count.get(e.id) ?? 0 })) as EmpresaRow[];
    },
  });

  const filtradas = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return data;
    return data.filter(
      (e) => e.nome.toLowerCase().includes(t) || (e.cnpj ?? "").replace(/\D/g, "").includes(t.replace(/\D/g, "")),
    );
  }, [data, q]);

  const criar = useMutation({
    mutationFn: async () => {
      if (!form.nome.trim()) throw new Error("Nome obrigatório");
      const { error } = await supabase.from("empresas").insert({
        nome: form.nome.trim(),
        cnpj: form.cnpj.trim() || null,
        tamanho: form.tamanho || null,
        faturamento_mensal: form.faturamento ? Number(form.faturamento) : null,
        situacao_cadastral: "Ativa",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Empresa gravada");
      setOpen(false);
      setForm(VAZIO);
      qc.invalidateQueries({ queryKey: ["empresas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mesclar = useMutation({
    mutationFn: async () => {
      const ids = selecionadas.filter((id) => id !== keeper);
      if (!keeper || ids.length === 0) throw new Error("Escolha a empresa que permanece");
      for (const id of ids) {
        const { error: cErr } = await supabase.from("contatos").update({ empresa_id: keeper }).eq("empresa_id", id);
        if (cErr) throw cErr;
        const { error: oErr } = await supabase.from("oportunidades").update({ empresa_id: keeper }).eq("empresa_id", id);
        if (oErr) throw oErr;
        const { error: dErr } = await supabase.from("empresas").delete().eq("id", id);
        if (dErr) throw dErr;
      }
    },
    onSuccess: () => {
      toast.success("Duplicatas mescladas neste CRM");
      setMergeOpen(false);
      setSelecionadas([]);
      setKeeper("");
      qc.invalidateQueries({ queryKey: ["empresas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportar = () => {
    const header = "nome,cnpj,tamanho,faturamento_mensal,leads";
    const lines = filtradas.map((e) =>
      [e.nome, e.cnpj ?? "", e.tamanho ?? "", e.faturamento_mensal ?? "", e.leads].join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "empresas.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const toggle = (id: string) => {
    setSelecionadas((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="page-eyebrow">Cadastro</p>
          <h1 className="page-title">Empresas</h1>
          <p className="page-subtitle">
            {data.length} {data.length === 1 ? "empresa cadastrada" : "empresas cadastradas"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            disabled={selecionadas.length < 2}
            onClick={() => {
              setKeeper(selecionadas[0] ?? "");
              setMergeOpen(true);
            }}
          >
            <GitMerge className="mr-2 h-4 w-4" />
            Mesclar duplicadas
          </Button>
          <Button variant="outline" onClick={exportar} disabled={!filtradas.length}>
            <Download className="mr-2 h-4 w-4" />
            Exportar
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nova empresa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova empresa</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Nome *</Label>
                  <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>CNPJ</Label>
                  <Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0001-00" />
                </div>
                <div className="space-y-1.5">
                  <Label>Tamanho</Label>
                  <Select value={form.tamanho} onValueChange={(v) => setForm({ ...form, tamanho: v })}>
                    <SelectTrigger><SelectValue placeholder="Porte" /></SelectTrigger>
                    <SelectContent>
                      {PORTES_CRM.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Faturamento mensal (R$)</Label>
                  <Input type="number" min={0} value={form.faturamento} onChange={(e) => setForm({ ...form, faturamento: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={() => criar.mutate()} disabled={criar.isPending}>Gravar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome ou CNPJ" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {selecionadas.length > 0 && (
          <p className="text-xs text-muted-foreground">{selecionadas.length} selecionada{selecionadas.length === 1 ? "" : "s"}</p>
        )}
      </div>

      <div className="surface-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10" />
              <TableHead className="text-[10px] uppercase tracking-[0.18em]">Nome</TableHead>
              <TableHead className="text-[10px] uppercase tracking-[0.18em]">CNPJ</TableHead>
              <TableHead className="text-[10px] uppercase tracking-[0.18em]">Tamanho</TableHead>
              <TableHead className="text-[10px] uppercase tracking-[0.18em]">Faturamento mensal</TableHead>
              <TableHead className="text-right text-[10px] uppercase tracking-[0.18em]">Nº de leads</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6}><Skeleton className="h-10 w-full" /></TableCell>
              </TableRow>
            )}
            {!isLoading && filtradas.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  Nenhuma empresa neste recorte.
                </TableCell>
              </TableRow>
            )}
            {filtradas.map((e) => (
              <TableRow
                key={e.id}
                className="cursor-pointer"
                onClick={() => navigate(`/empresas/${e.id}`)}
              >
                <TableCell onClick={(ev) => ev.stopPropagation()}>
                  <Checkbox checked={selecionadas.includes(e.id)} onCheckedChange={() => toggle(e.id)} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium tracking-wide">
                      {iniciais(e.nome)}
                    </span>
                    <Link
                      to={`/empresas/${e.id}`}
                      className="font-medium hover:underline"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      {e.nome}
                    </Link>
                  </div>
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{e.cnpj ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{e.tamanho ?? "—"}</TableCell>
                <TableCell className="tabular-nums">{fmtMoney(e.faturamento_mensal)}</TableCell>
                <TableCell className="text-right tabular-nums">{e.leads}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={mergeOpen} onOpenChange={setMergeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mesclar duplicadas</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Leads e negócios das demais passam para a empresa que permanece. As outras são excluídas.
          </p>
          <div className="space-y-1.5">
            <Label>Empresa que permanece</Label>
            <Select value={keeper} onValueChange={setKeeper}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {data.filter((e) => selecionadas.includes(e.id)).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeOpen(false)}>Cancelar</Button>
            <Button onClick={() => mesclar.mutate()} disabled={mesclar.isPending}>Mesclar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
