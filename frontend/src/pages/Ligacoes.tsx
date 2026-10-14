import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Phone, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { RESPONSAVEIS_CRM } from "@/lib/constants";
import { fmtDateTime, fmtDuracao, fmtPhone } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ContatoCombobox } from "@/components/contatos/ContatoCombobox";
import { OportunidadeCombobox } from "@/components/oportunidades/OportunidadeCombobox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const ABAS = [
  { id: "todas", label: "Todas" },
  { id: "recebidas", label: "Recebidas" },
  { id: "feitas", label: "Feitas" },
  { id: "perdidas", label: "Perdidas" },
] as const;

type Ligacao = {
  id: string;
  titulo: string;
  status: string;
  direcao: string;
  duracao_seg: number | null;
  resultado: string | null;
  responsavel: string | null;
  notas: string | null;
  criado_em: string;
  contato_id: string | null;
  oportunidade_id: string | null;
  contato?: { id: string; nome: string; telefone?: string | null } | null;
  oportunidade?: { id: string; titulo: string | null } | null;
};

const RESULTADOS = [
  { value: "atendeu", label: "Atendeu" },
  { value: "nao_atendeu", label: "Não atendeu" },
  { value: "retornar", label: "Retornar" },
  { value: "sem_interesse", label: "Sem interesse" },
];

function rotuloResultado(v: string | null) {
  return RESULTADOS.find((r) => r.value === v)?.label ?? v ?? "—";
}

export default function Ligacoes() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<(typeof ABAS)[number]["id"]>("todas");
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    titulo: "",
    direcao: "saida",
    resultado: "atendeu",
    duracao: "",
    responsavel: "Comercial",
    notas: "",
    contatoId: null as string | null,
    oppId: null as string | null,
  });

  const { data = [], isLoading } = useQuery({
    queryKey: ["ligacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ligacoes")
        .select("*, contato:contatos(id, nome, telefone), oportunidade:oportunidades(id, titulo)")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Ligacao[];
    },
  });

  const hojeIso = new Date().toISOString().slice(0, 10);
  const deHoje = data.filter((l) => l.criado_em.slice(0, 10) === hojeIso);
  const stats = {
    recebidasHoje: deHoje.filter((l) => l.direcao === "entrada").length,
    atendidas: data.filter((l) => l.resultado === "atendeu").length,
    perdidas: data.filter((l) => l.resultado === "nao_atendeu").length,
    feitasHoje: deHoje.filter((l) => l.direcao === "saida").length,
    tempo: data.reduce((s, l) => s + Number(l.duracao_seg ?? 0), 0),
  };

  const visiveis = useMemo(() => {
    const t = q.trim().toLowerCase();
    return data.filter((l) => {
      if (aba === "recebidas" && l.direcao !== "entrada") return false;
      if (aba === "feitas" && l.direcao !== "saida") return false;
      if (aba === "perdidas" && l.resultado !== "nao_atendeu") return false;
      if (!t) return true;
      return `${l.titulo} ${l.contato?.nome ?? ""} ${l.contato?.telefone ?? ""}`.toLowerCase().includes(t);
    });
  }, [data, aba, q]);

  const criar = useMutation({
    mutationFn: async () => {
      if (!form.titulo.trim()) throw new Error("Assunto obrigatório");
      const { error } = await supabase.from("ligacoes").insert({
        titulo: form.titulo.trim(),
        status: form.resultado === "nao_atendeu" ? "perdida" : "registrada",
        direcao: form.direcao,
        resultado: form.resultado,
        duracao_seg: form.duracao ? Number(form.duracao) : null,
        responsavel: form.responsavel,
        notas: form.notas || null,
        contato_id: form.contatoId,
        oportunidade_id: form.oppId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ligação registrada neste CRM");
      setFormOpen(false);
      setForm({
        titulo: "",
        direcao: "saida",
        resultado: "atendeu",
        duracao: "",
        responsavel: "Comercial",
        notas: "",
        contatoId: null,
        oppId: null,
      });
      qc.invalidateQueries({ queryKey: ["ligacoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const kpis = [
    { l: "Recebidas hoje", v: String(stats.recebidasHoje) },
    { l: "Atendidas", v: String(stats.atendidas) },
    { l: "Perdidas", v: String(stats.perdidas) },
    { l: "Feitas hoje", v: String(stats.feitasHoje) },
    { l: "Tempo registrado", v: fmtDuracao(stats.tempo) },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="page-eyebrow">Comunicação</p>
          <h1 className="page-title">Ligações</h1>
          <p className="page-subtitle">
            Registro no CRM — resultado, duração e nota no contato. Sem discador neste corte.
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Registrar ligação
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.l} className="surface-card p-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{k.l}</p>
            <p className="mt-2 text-2xl font-medium tabular-nums">{k.v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {ABAS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAba(a.id)}
                className={`rounded-full px-3 py-1.5 text-sm ${
                  aba === a.id ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {a.label}
              </button>
            ))}
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Nome ou telefone" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>

          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && visiveis.length === 0 && (
            <p className="surface-card p-8 text-center text-sm text-muted-foreground">Nenhuma ligação neste recorte.</p>
          )}
          {visiveis.map((l) => {
            const expandido = aberto === l.id;
            return (
              <div key={l.id} className="surface-card">
                <div className="flex items-center gap-3 p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    <Phone className="h-4 w-4" />
                  </span>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setAberto(expandido ? null : l.id)}>
                    <p className="truncate font-medium">{l.contato?.nome ?? l.titulo}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {l.direcao === "entrada" ? "Recebida" : "Feita"}
                      {" · "}
                      {rotuloResultado(l.resultado)}
                      {" · "}
                      {fmtDuracao(l.duracao_seg)}
                      {" · "}
                      {fmtDateTime(l.criado_em)}
                      {l.responsavel ? ` · ${l.responsavel}` : ""}
                    </p>
                  </button>
                  {l.oportunidade_id && (
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/oportunidades/${l.oportunidade_id}`}>Card</Link>
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => setAberto(expandido ? null : l.id)}>
                    <ChevronDown className={`h-4 w-4 transition ${expandido ? "rotate-180" : ""}`} />
                  </Button>
                </div>
                {expandido && (
                  <div className="space-y-2 border-t border-border px-4 py-3 text-sm">
                    <p><span className="text-muted-foreground">Assunto</span> · {l.titulo}</p>
                    {l.contato?.telefone && (
                      <p><span className="text-muted-foreground">Telefone</span> · {fmtPhone(l.contato.telefone)}</p>
                    )}
                    {l.contato_id && (
                      <Link to={`/contatos/${l.contato_id}`} className="text-primary hover:underline">Abrir lead</Link>
                    )}
                    {l.notas ? (
                      <p className="whitespace-pre-wrap rounded-sm bg-muted/50 p-3">{l.notas}</p>
                    ) : (
                      <p className="text-muted-foreground">Sem nota nesta ligação.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <aside className="surface-card h-fit space-y-3 p-5">
          <p className="page-eyebrow">Registrar para</p>
          <p className="text-sm text-muted-foreground">
            Busque o contato e grave o resultado. A chamada em si fica fora do sistema.
          </p>
          <Button className="w-full" variant="outline" onClick={() => setFormOpen(true)}>
            Nova ligação
          </Button>
        </aside>
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar ligação</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Assunto *</Label>
              <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Contato</Label>
              <ContatoCombobox
                value={form.contatoId}
                onChange={(id) => setForm({ ...form, contatoId: id })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Negócio</Label>
              <OportunidadeCombobox
                value={form.oppId}
                contatoId={form.contatoId}
                onChange={(id) => setForm({ ...form, oppId: id })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Direção</Label>
              <Select value={form.direcao} onValueChange={(v) => setForm({ ...form, direcao: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="saida">Saída</SelectItem>
                  <SelectItem value="entrada">Entrada</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Resultado</Label>
              <Select value={form.resultado} onValueChange={(v) => setForm({ ...form, resultado: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESULTADOS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Duração (segundos)</Label>
              <Input type="number" min={0} value={form.duracao} onChange={(e) => setForm({ ...form, duracao: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={form.responsavel} onValueChange={(v) => setForm({ ...form, responsavel: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESPONSAVEIS_CRM.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>O que foi combinado</Label>
              <Textarea rows={3} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={() => criar.mutate()} disabled={criar.isPending}>Gravar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
