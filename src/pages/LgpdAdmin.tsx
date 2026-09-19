import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Shield, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { LGPD_POLITICA, LGPD_VERSAO_PADRAO } from "@/lib/lgpd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link } from "react-router-dom";

type Solicitacao = {
  id: string;
  tipo: string;
  status: string;
  titular_nome: string | null;
  titular_email: string | null;
  titular_telefone: string | null;
  contato_id: string | null;
  motivo: string | null;
  criado_em: string;
};

type Config = {
  versao_politica: string;
  dpo_email: string | null;
  dpo_nome: string | null;
  retencao_leads_dias: number;
  analytics_ativo: boolean;
};

const TIPOS = [
  { value: "acesso", label: "Acesso / confirmação" },
  { value: "portabilidade", label: "Portabilidade (exportar)" },
  { value: "correcao", label: "Correção" },
  { value: "exclusao", label: "Exclusão / anonimização" },
  { value: "oposicao", label: "Oposição" },
];

export default function LgpdAdmin() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [contatoIdExport, setContatoIdExport] = useState("");
  const [anonId, setAnonId] = useState<string | null>(null);
  const [anonSolicitacaoId, setAnonSolicitacaoId] = useState<string | null>(null);
  const [novaOpen, setNovaOpen] = useState(false);
  const [form, setForm] = useState({
    tipo: "acesso",
    titular_nome: "",
    titular_email: "",
    titular_telefone: "",
    contato_id: "",
    motivo: "",
  });

  const { data: config } = useQuery({
    queryKey: ["lgpd-config"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("lgpd_config")
        .select("*")
        .eq("id", true)
        .maybeSingle();
      if (error) throw error;
      return (data ?? {
        versao_politica: LGPD_VERSAO_PADRAO,
        dpo_email: null,
        dpo_nome: null,
        retencao_leads_dias: 1825,
        analytics_ativo: true,
      }) as Config;
    },
  });

  const { data: solicitacoes = [], isLoading } = useQuery({
    queryKey: ["lgpd-solicitacoes"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("lgpd_solicitacoes")
        .select(
          "id, tipo, status, titular_nome, titular_email, titular_telefone, contato_id, motivo, criado_em",
        )
        .order("criado_em", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Solicitacao[];
    },
  });

  const salvarConfig = useMutation({
    mutationFn: async (patch: Partial<Config>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from("lgpd_config")
        .update({ ...patch, atualizado_em: new Date().toISOString() })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração LGPD salva");
      qc.invalidateQueries({ queryKey: ["lgpd-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const criarSolicitacao = useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("lgpd_solicitacoes").insert({
        tipo: form.tipo,
        titular_nome: form.titular_nome || null,
        titular_email: form.titular_email || null,
        titular_telefone: form.titular_telefone || null,
        contato_id: form.contato_id || null,
        motivo: form.motivo || null,
        criado_por: user?.id ?? null,
        status: "aberta",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitação registrada");
      setNovaOpen(false);
      qc.invalidateQueries({ queryKey: ["lgpd-solicitacoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportar = useMutation({
    mutationFn: async (contatoId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("lgpd_exportar_contato", {
        _contato_id: contatoId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lgpd-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exportação baixada (portabilidade / acesso)");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const anonimizar = useMutation({
    mutationFn: async ({
      contatoId,
      solicitacaoId,
    }: {
      contatoId: string;
      solicitacaoId?: string | null;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("lgpd_anonimizar_contato", {
        _contato_id: contatoId,
        _solicitacao_id: solicitacaoId ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Contato anonimizado (LGPD)");
      setAnonId(null);
      setAnonSolicitacaoId(null);
      qc.invalidateQueries({ queryKey: ["lgpd-solicitacoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="page-eyebrow">Conformidade</p>
        <h1 className="page-title flex items-center gap-2">
          <Shield className="h-6 w-6" /> LGPD
        </h1>
        <p className="page-subtitle max-w-2xl">
          Política, DPO, solicitações do titular, exportação e anonimização.{" "}
          <Link to="/privacidade" className="font-medium text-primary hover:underline">
            Ver política pública
          </Link>
        </p>
      </header>

      <section className="surface-card space-y-4 p-6">
        <h2 className="font-display text-lg font-semibold">Configuração</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Versão da política</Label>
            <Input
              defaultValue={config?.versao_politica ?? LGPD_VERSAO_PADRAO}
              key={config?.versao_politica}
              id="lgpd-versao"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Retenção de leads (dias)</Label>
            <Input
              type="number"
              min={30}
              max={3650}
              defaultValue={config?.retencao_leads_dias ?? 1825}
              id="lgpd-retencao"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Nome do DPO / Encarregado</Label>
            <Input defaultValue={config?.dpo_nome ?? ""} id="lgpd-dpo-nome" />
          </div>
          <div className="space-y-1.5">
            <Label>E-mail do DPO</Label>
            <Input type="email" defaultValue={config?.dpo_email ?? ""} id="lgpd-dpo-email" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              defaultChecked={config?.analytics_ativo ?? true}
              id="lgpd-analytics"
            />
            Analytics (Vercel) ativo — trate como cookie/telemetria não essencial se desmarcar e pedir consentimento
          </label>
          <Button
            size="sm"
            disabled={salvarConfig.isPending}
            onClick={() => {
              const versao = (document.getElementById("lgpd-versao") as HTMLInputElement)?.value;
              const retencao = Number(
                (document.getElementById("lgpd-retencao") as HTMLInputElement)?.value,
              );
              const dpo_nome = (document.getElementById("lgpd-dpo-nome") as HTMLInputElement)?.value;
              const dpo_email = (document.getElementById("lgpd-dpo-email") as HTMLInputElement)
                ?.value;
              const analytics_ativo = (document.getElementById("lgpd-analytics") as HTMLInputElement)
                ?.checked;
              salvarConfig.mutate({
                versao_politica: versao || LGPD_VERSAO_PADRAO,
                retencao_leads_dias: retencao || 1825,
                dpo_nome: dpo_nome || null,
                dpo_email: dpo_email || null,
                analytics_ativo: !!analytics_ativo,
              });
            }}
          >
            Salvar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Texto da política embutido (v{LGPD_POLITICA.versao}). Atualize{" "}
          <code className="rounded bg-muted px-1">src/lib/lgpd.ts</code> e a versão acima juntos.
        </p>
      </section>

      <section className="surface-card space-y-4 p-6">
        <h2 className="font-display text-lg font-semibold">Operações no contato</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label>ID do contato (UUID)</Label>
            <Input
              className="w-[320px] font-mono text-xs"
              value={contatoIdExport}
              onChange={(e) => setContatoIdExport(e.target.value.trim())}
              placeholder="uuid do contato"
            />
          </div>
          <Button
            variant="outline"
            disabled={!contatoIdExport || exportar.isPending}
            onClick={() => exportar.mutate(contatoIdExport)}
          >
            <Download className="mr-1.5 h-4 w-4" /> Exportar JSON
          </Button>
          <Button
            variant="destructive"
            disabled={!contatoIdExport}
            onClick={() => {
              setAnonSolicitacaoId(null);
              setAnonId(contatoIdExport);
            }}
          >
            <Trash2 className="mr-1.5 h-4 w-4" /> Anonimizar
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">Solicitações do titular</h2>
          <Dialog open={novaOpen} onOpenChange={setNovaOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1.5 h-4 w-4" /> Nova solicitação
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Registrar solicitação LGPD</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select
                    value={form.tipo}
                    onValueChange={(v) => setForm((f) => ({ ...f, tipo: v }))}
                  >
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
                <div className="space-y-1.5">
                  <Label>Nome do titular</Label>
                  <Input
                    value={form.titular_nome}
                    onChange={(e) => setForm((f) => ({ ...f, titular_nome: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail</Label>
                  <Input
                    value={form.titular_email}
                    onChange={(e) => setForm((f) => ({ ...f, titular_email: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Telefone</Label>
                  <Input
                    value={form.titular_telefone}
                    onChange={(e) => setForm((f) => ({ ...f, titular_telefone: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Contato CRM (UUID, opcional)</Label>
                  <Input
                    className="font-mono text-xs"
                    value={form.contato_id}
                    onChange={(e) => setForm((f) => ({ ...f, contato_id: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Motivo / detalhes</Label>
                  <Textarea
                    rows={3}
                    value={form.motivo}
                    onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNovaOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  disabled={criarSolicitacao.isPending}
                  onClick={() => criarSolicitacao.mutate()}
                >
                  Registrar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="surface-card overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Titular</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Criado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">
                    Carregando…
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && solicitacoes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-sm text-muted-foreground">
                    Nenhuma solicitação ainda.
                  </TableCell>
                </TableRow>
              )}
              {solicitacoes.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-sm">{s.tipo}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{s.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div>{s.titular_nome ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{s.titular_email}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {s.contato_id ? (
                      <Link className="text-primary hover:underline" to={`/contatos/${s.contato_id}`}>
                        {s.contato_id.slice(0, 8)}…
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(s.criado_em).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="space-x-1 whitespace-nowrap">
                    {s.contato_id && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => exportar.mutate(s.contato_id!)}
                        >
                          Exportar
                        </Button>
                        {s.tipo === "exclusao" && s.status !== "concluida" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => {
                              setAnonSolicitacaoId(s.id);
                              setAnonId(s.contato_id);
                            }}
                          >
                            Anonimizar
                          </Button>
                        )}
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <AlertDialog
        open={!!anonId}
        onOpenChange={(o) => {
          if (!o) {
            setAnonId(null);
            setAnonSolicitacaoId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Anonimizar contato?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove nome, e-mail, telefone e estabelecimento. Mantém o registro comercial marcado
              como anonimizado. Ação auditada e irreversível para os dados pessoais.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                anonId &&
                anonimizar.mutate({
                  contatoId: anonId,
                  solicitacaoId: anonSolicitacaoId,
                })
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirmar anonimização
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
