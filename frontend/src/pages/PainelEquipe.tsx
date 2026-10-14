import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { npsFaixa } from "@/lib/nps";
import { fmtDate } from "@/lib/format";
import { RESPONSAVEIS_CRM } from "@/lib/constants";
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
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const FILTROS = [
  { id: "todos", label: "Todos" },
  { id: "critico", label: "Crítico" },
  { id: "risco", label: "Em risco" },
  { id: "atencao", label: "Em atenção" },
  { id: "saudavel", label: "Saudável" },
  { id: "defensor", label: "Defensor" },
  { id: "pendente", label: "Pendente" },
];

type NpsRow = {
  id: string;
  titulo: string;
  score: number | null;
  status: string;
  canal: string | null;
  notas: string | null;
  responsavel: string | null;
  criado_em: string;
  contato_id: string | null;
  oportunidade_id: string | null;
  contato?: { id: string; nome: string; email?: string | null; nome_estabelecimento?: string | null } | null;
  oportunidade?: { id: string; titulo: string | null } | null;
};

export default function PainelEquipe() {
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const faixaUrl = params.get("faixa");
  const [filtro, setFiltro] = useState(
    FILTROS.some((f) => f.id === faixaUrl) ? faixaUrl! : "todos",
  );
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState<NpsRow | null>(null);
  const [novoOpen, setNovoOpen] = useState(false);
  const [score, setScore] = useState<string>("");
  const [status, setStatus] = useState("respondido");
  const [responsavel, setResponsavel] = useState("");
  const [notas, setNotas] = useState("");
  const [contatoId, setContatoId] = useState<string | null>(null);
  const [oppId, setOppId] = useState<string | null>(null);
  const [tituloNovo, setTituloNovo] = useState("");

  const { data: rows = [] } = useQuery({
    queryKey: ["nps-lista"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nps_respostas")
        .select("*, contato:contatos(id, nome, email, nome_estabelecimento), oportunidade:oportunidades(id, titulo)")
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NpsRow[];
    },
  });

  const visiveis = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => {
      const faixa = npsFaixa(r.score);
      if (filtro !== "todos" && faixa.id !== filtro) return false;
      if (!t) return true;
      const blob = `${r.titulo} ${r.contato?.nome ?? ""} ${r.contato?.nome_estabelecimento ?? ""}`.toLowerCase();
      return blob.includes(t);
    });
  }, [rows, filtro, q]);

  const contagem = (id: string) =>
    id === "todos" ? rows.length : rows.filter((r) => npsFaixa(r.score).id === id).length;

  const abrir = (r: NpsRow) => {
    setAberto(r);
    setScore(r.score == null ? "" : String(r.score));
    setStatus(r.status);
    setResponsavel(r.responsavel ?? "");
    setNotas(r.notas ?? "");
  };

  const salvar = useMutation({
    mutationFn: async () => {
      if (!aberto) return;
      const nota = score === "" ? null : Number(score);
      if (nota != null && (nota < 0 || nota > 10)) throw new Error("Nota de 0 a 10");
      const { error } = await supabase.from("nps_respostas").update({
        score: nota,
        status: nota != null ? "respondido" : status,
        responsavel: responsavel || null,
        notas: notas || null,
      }).eq("id", aberto.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("NPS atualizado");
      qc.invalidateQueries({ queryKey: ["nps-lista"] });
      qc.invalidateQueries({ queryKey: ["indicadores-ads"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const criarTarefa = useMutation({
    mutationFn: async () => {
      if (!aberto) return;
      const { error } = await supabase.from("tarefas").insert({
        titulo: `Follow-up NPS — ${aberto.contato?.nome ?? aberto.titulo}`,
        descricao: aberto.score != null ? `Nota ${aberto.score}. ${aberto.notas ?? ""}`.trim() : "Resposta pendente.",
        status: "aberta",
        prioridade: (aberto.score ?? 10) <= 6 ? "alta" : "media",
        contato_id: aberto.contato_id,
        oportunidade_id: aberto.oportunidade_id,
        atribuido_para: aberto.responsavel ?? "CS",
        due_date: new Date(Date.now() + 86_400_000).toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa de follow-up criada");
      qc.invalidateQueries({ queryKey: ["tarefas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const criar = useMutation({
    mutationFn: async () => {
      if (!tituloNovo.trim()) throw new Error("Título obrigatório");
      const nota = score === "" ? null : Number(score);
      const { error } = await supabase.from("nps_respostas").insert({
        titulo: tituloNovo.trim(),
        status: nota != null ? "respondido" : "enviado",
        score: nota,
        canal: "manual",
        contato_id: contatoId,
        oportunidade_id: oppId,
        responsavel: responsavel || "CS",
        notas: notas || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Resposta registrada");
      setNovoOpen(false);
      setTituloNovo("");
      setScore("");
      setContatoId(null);
      setOppId(null);
      setNotas("");
      qc.invalidateQueries({ queryKey: ["nps-lista"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="page-eyebrow">NPS</p>
          <h1 className="page-title">NPS dos clientes</h1>
          <p className="page-subtitle">Respostas da carteira. Abra o card para anotar, atribuir e criar follow-up.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link to="/indicadores">Ver indicadores</Link>
          </Button>
          <Button onClick={() => { setScore(""); setNotas(""); setResponsavel("CS"); setNovoOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Registrar resposta
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            className={`rounded-full border px-3 py-1.5 text-sm ${
              filtro === f.id ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label} {contagem(f.id)}
          </button>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por empresa ou contato" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="space-y-2">
        {visiveis.length === 0 && (
          <p className="surface-card p-8 text-center text-sm text-muted-foreground">Nenhuma resposta neste recorte.</p>
        )}
        {visiveis.map((r) => {
          const faixa = npsFaixa(r.score);
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => abrir(r)}
              className="surface-card flex w-full items-center justify-between gap-4 p-4 text-left hover:shadow-elegant"
            >
              <div className="flex min-w-0 items-center gap-4">
                <span className="w-10 text-center font-display text-2xl tabular-nums">{r.score ?? "—"}</span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.contato?.nome_estabelecimento || r.titulo}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {r.contato?.nome ?? "—"} · {r.responsavel ?? "sem dono"} · {fmtDate(r.criado_em)}
                  </p>
                </div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${faixa.cls}`}>{faixa.label}</span>
            </button>
          );
        })}
      </div>

      <Sheet open={!!aberto} onOpenChange={(v) => !v && setAberto(null)}>
        <SheetContent className="overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{aberto?.contato?.nome_estabelecimento || aberto?.titulo}</SheetTitle>
          </SheetHeader>
          {aberto && (
            <div className="mt-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                {aberto.contato?.nome ?? "Sem contato"} · {fmtDate(aberto.criado_em)}
              </p>
              <div className="space-y-1.5">
                <Label>Nota (0–10)</Label>
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: 11 }, (_, n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setScore(String(n))}
                      className={`h-8 w-8 rounded-sm text-xs ${
                        score === String(n) ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enviado">Enviado</SelectItem>
                    <SelectItem value="respondido">Respondido</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Responsável</Label>
                <Select value={responsavel} onValueChange={setResponsavel}>
                  <SelectTrigger><SelectValue placeholder="Atribuir" /></SelectTrigger>
                  <SelectContent>
                    {RESPONSAVEIS_CRM.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Notas da conversa</Label>
                <Textarea rows={4} value={notas} onChange={(e) => setNotas(e.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>Salvar no CRM</Button>
                <Button variant="outline" onClick={() => criarTarefa.mutate()} disabled={criarTarefa.isPending}>
                  Criar follow-up
                </Button>
                {aberto.contato_id && (
                  <Button variant="ghost" asChild>
                    <Link to={`/contatos/${aberto.contato_id}`}>Abrir lead</Link>
                  </Button>
                )}
                {aberto.oportunidade_id && (
                  <Button variant="ghost" asChild>
                    <Link to={`/oportunidades/${aberto.oportunidade_id}`}>Abrir negócio</Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registrar resposta NPS</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input value={tituloNovo} onChange={(e) => setTituloNovo(e.target.value)} placeholder="NPS Empresa…" />
            </div>
            <div className="space-y-1.5">
              <Label>Contato</Label>
              <ContatoCombobox value={contatoId} onChange={(id) => setContatoId(id)} />
            </div>
            <div className="space-y-1.5">
              <Label>Negócio</Label>
              <OportunidadeCombobox value={oppId} contatoId={contatoId} onChange={(id) => setOppId(id)} />
            </div>
            <div className="space-y-1.5">
              <Label>Nota (opcional)</Label>
              <Input type="number" min={0} max={10} value={score} onChange={(e) => setScore(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={responsavel} onValueChange={setResponsavel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESPONSAVEIS_CRM.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoOpen(false)}>Cancelar</Button>
            <Button onClick={() => criar.mutate()} disabled={criar.isPending}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
