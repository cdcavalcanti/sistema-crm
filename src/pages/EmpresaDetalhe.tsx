import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtMoney, fmtPhone, iniciais } from "@/lib/format";
import { PORTES_CRM } from "@/lib/constants";
import { ContatoCombobox } from "@/components/contatos/ContatoCombobox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

function Campo({ label, value, href }: { label: string; value: string; href?: string | null }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      {href && value !== "—" ? (
        <a href={href} target="_blank" rel="noreferrer" className="mt-1 block text-sm font-medium text-primary hover:underline">
          {value}
        </a>
      ) : (
        <p className="mt-1 text-sm font-medium">{value}</p>
      )}
    </div>
  );
}

export default function EmpresaDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [vincular, setVincular] = useState(false);
  const [contatoId, setContatoId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["empresa", id],
    enabled: !!id,
    queryFn: async () => {
      const [emp, leads, opps] = await Promise.all([
        supabase.from("empresas").select("*").eq("id", id!).maybeSingle(),
        supabase.from("contatos").select("id, nome, cargo, email, telefone").eq("empresa_id", id!).order("nome"),
        supabase.from("oportunidades").select("id, titulo, valor, etapa:etapas(nome, cor)").eq("empresa_id", id!),
      ]);
      return { empresa: emp.data, leads: leads.data ?? [], opps: opps.data ?? [] };
    },
  });

  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("empresas").update({
        nome: form.nome?.trim(),
        cnpj: form.cnpj?.trim() || null,
        tamanho: form.tamanho || null,
        faturamento_mensal: form.faturamento ? Number(form.faturamento) : null,
        situacao_cadastral: form.situacao || null,
        atividade_principal: form.atividade || null,
        atividade_secundaria: form.atividade2 || null,
        site: form.site || null,
        instagram: form.instagram || null,
        linkedin: form.linkedin || null,
      }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Empresa atualizada");
      setEditando(false);
      qc.invalidateQueries({ queryKey: ["empresa", id] });
      qc.invalidateQueries({ queryKey: ["empresas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async () => {
      const { error: cErr } = await supabase.from("contatos").update({ empresa_id: null }).eq("empresa_id", id!);
      if (cErr) throw cErr;
      const { error: oErr } = await supabase.from("oportunidades").update({ empresa_id: null }).eq("empresa_id", id!);
      if (oErr) throw oErr;
      const { error } = await supabase.from("empresas").delete().eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Empresa excluída");
      navigate("/empresas");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ligarLead = useMutation({
    mutationFn: async () => {
      if (!contatoId) throw new Error("Escolha um lead");
      const { error } = await supabase.from("contatos").update({ empresa_id: id }).eq("id", contatoId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lead vinculado");
      setVincular(false);
      setContatoId(null);
      qc.invalidateQueries({ queryKey: ["empresa", id] });
      qc.invalidateQueries({ queryKey: ["empresas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!data?.empresa) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/empresas")}>Voltar</Button>
        <p className="text-sm text-muted-foreground">Empresa não encontrada.</p>
      </div>
    );
  }
  const e = data.empresa;
  const abrirEdicao = () => {
    setForm({
      nome: e.nome ?? "",
      cnpj: e.cnpj ?? "",
      tamanho: e.tamanho ?? "",
      faturamento: e.faturamento_mensal != null ? String(e.faturamento_mensal) : "",
      situacao: e.situacao_cadastral ?? "",
      atividade: e.atividade_principal ?? "",
      atividade2: e.atividade_secundaria ?? "",
      site: e.site ?? "",
      instagram: e.instagram ?? "",
      linkedin: e.linkedin ?? "",
    });
    setEditando(true);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
            <Link to="/empresas">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Empresas
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted font-medium tracking-wide">
              {iniciais(e.nome)}
            </span>
            <div>
              <p className="page-eyebrow">Empresa</p>
              <h1 className="page-title">{e.nome}</h1>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={abrirEdicao}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Editar
          </Button>
          <Button variant="outline" onClick={() => setExcluindo(true)}>
            <Trash2 className="mr-2 h-3.5 w-3.5 text-destructive" />
            Excluir
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card grid gap-6 p-6 sm:grid-cols-2">
          <p className="page-eyebrow sm:col-span-2">Identificação</p>
          <Campo label="Nome" value={e.nome} />
          <Campo label="CNPJ" value={e.cnpj ?? "—"} />
          <Campo label="Situação cadastral" value={e.situacao_cadastral ?? "—"} />
        </div>
        <div className="surface-card grid gap-6 p-6 sm:grid-cols-2">
          <p className="page-eyebrow sm:col-span-2">Qualificação</p>
          <Campo label="Faturamento mensal" value={fmtMoney(e.faturamento_mensal)} />
          <Campo label="Tamanho" value={e.tamanho ?? "—"} />
        </div>
        <div className="surface-card grid gap-6 p-6 sm:grid-cols-2">
          <p className="page-eyebrow sm:col-span-2">Atividade</p>
          <Campo label="Atividade principal" value={e.atividade_principal ?? "—"} />
          <Campo label="Atividade secundária" value={e.atividade_secundaria ?? "—"} />
        </div>
        <div className="surface-card grid gap-6 p-6 sm:grid-cols-2">
          <p className="page-eyebrow sm:col-span-2">Presença</p>
          <Campo label="Site" value={e.site ?? "—"} href={e.site} />
          <Campo label="Instagram" value={e.instagram ?? "—"} href={e.instagram ? `https://instagram.com/${e.instagram.replace(/^@/, "")}` : null} />
          <Campo label="LinkedIn" value={e.linkedin ?? "—"} href={e.linkedin} />
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <p className="page-eyebrow">Oportunidades</p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/oportunidades">Nova no funil</Link>
          </Button>
        </div>
        {data.opps.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">Nenhuma oportunidade registrada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-[0.18em]">Negócio</TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.18em]">Etapa</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-[0.18em]">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.opps.map((o: { id: string; titulo: string | null; valor?: number | null; etapa?: { nome?: string; cor?: string | null } | null }) => (
                <TableRow key={o.id} className="cursor-pointer" onClick={() => navigate(`/oportunidades/${o.id}`)}>
                  <TableCell className="font-medium">{o.titulo ?? o.id}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: o.etapa?.cor ?? "#999" }} />
                      {o.etapa?.nome ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(o.valor)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <div className="surface-card overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <p className="page-eyebrow">Leads vinculados · {data.leads.length}</p>
          <Button variant="outline" size="sm" onClick={() => setVincular(true)}>Vincular lead</Button>
        </div>
        {data.leads.length === 0 ? (
          <p className="px-5 py-8 text-sm text-muted-foreground">Nenhum lead nesta empresa.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-[0.18em]">Nome</TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.18em]">Cargo</TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.18em]">E-mail</TableHead>
                <TableHead className="text-[10px] uppercase tracking-[0.18em]">Telefone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.leads.map((l: { id: string; nome: string; cargo: string | null; email: string | null; telefone: string | null }) => (
                <TableRow key={l.id} className="cursor-pointer" onClick={() => navigate(`/contatos/${l.id}`)}>
                  <TableCell className="font-medium">{l.nome}</TableCell>
                  <TableCell className="text-muted-foreground">{l.cargo ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{l.email ?? "—"}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{fmtPhone(l.telefone)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={editando} onOpenChange={setEditando}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>Editar empresa</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Nome</Label>
              <Input value={form.nome ?? ""} onChange={(ev) => setForm({ ...form, nome: ev.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>CNPJ</Label>
              <Input value={form.cnpj ?? ""} onChange={(ev) => setForm({ ...form, cnpj: ev.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Situação</Label>
              <Input value={form.situacao ?? ""} onChange={(ev) => setForm({ ...form, situacao: ev.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Tamanho</Label>
              <Select value={form.tamanho ?? ""} onValueChange={(v) => setForm({ ...form, tamanho: v })}>
                <SelectTrigger><SelectValue placeholder="Porte" /></SelectTrigger>
                <SelectContent>
                  {PORTES_CRM.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Faturamento mensal</Label>
              <Input type="number" value={form.faturamento ?? ""} onChange={(ev) => setForm({ ...form, faturamento: ev.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Atividade principal</Label>
              <Input value={form.atividade ?? ""} onChange={(ev) => setForm({ ...form, atividade: ev.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Atividade secundária</Label>
              <Input value={form.atividade2 ?? ""} onChange={(ev) => setForm({ ...form, atividade2: ev.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Site</Label>
              <Input value={form.site ?? ""} onChange={(ev) => setForm({ ...form, site: ev.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Instagram</Label>
              <Input value={form.instagram ?? ""} onChange={(ev) => setForm({ ...form, instagram: ev.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>LinkedIn</Label>
              <Input value={form.linkedin ?? ""} onChange={(ev) => setForm({ ...form, linkedin: ev.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(false)}>Cancelar</Button>
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={vincular} onOpenChange={setVincular}>
        <DialogContent>
          <DialogHeader><DialogTitle>Vincular lead</DialogTitle></DialogHeader>
          <ContatoCombobox value={contatoId} onChange={(cid) => setContatoId(cid)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setVincular(false)}>Cancelar</Button>
            <Button onClick={() => ligarLead.mutate()} disabled={ligarLead.isPending}>Vincular</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={excluindo} onOpenChange={setExcluindo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              Leads e negócios continuam no CRM, sem este vínculo de empresa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => excluir.mutate()} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
