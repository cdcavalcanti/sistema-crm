import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { CrudModulo } from "@/components/modulos/CrudModulo";
import { RESPONSAVEIS_CRM } from "@/lib/constants";
import { fmtDateTime } from "@/lib/format";

export default function Planning() {
  const { data: tarefas = [] } = useQuery({
    queryKey: ["planning-tarefas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tarefas")
        .select("id, titulo, due_date, status, prioridade")
        .order("due_date")
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
  const abertas = tarefas.filter((t: { status: string }) => t.status !== "concluida");
  const feitas = tarefas.filter((t: { status: string }) => t.status === "concluida");
  const atrasadas = abertas.filter(
    (t: { due_date: string | null }) => t.due_date && t.due_date < new Date().toISOString(),
  );
  const pct = tarefas.length ? Math.round((feitas.length / tarefas.length) * 100) : 0;

  return (
    <div className="space-y-10">
      <header>
        <p className="page-eyebrow">Planning comercial</p>
        <h1 className="page-title">Seu cockpit da semana</h1>
        <p className="page-subtitle">Rotina do closer neste CRM — tarefas, agenda e meta da semana.</p>
      </header>
      <div className="surface-card p-5">
        <div className="flex items-center justify-between text-sm">
          <span>{feitas.length}/{tarefas.length} tarefas no recorte</span>
          <span className="text-muted-foreground">{atrasadas.length} em atraso</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="surface-card p-5">
        <p className="page-eyebrow">Hoje · rotina</p>
        <ul className="mt-3 space-y-2 text-sm">
          {abertas.length === 0 && <li className="text-muted-foreground">Nenhuma tarefa aberta.</li>}
          {abertas.map((t: { id: string; titulo: string; due_date: string | null; status: string }) => (
            <li key={t.id} className="flex justify-between gap-4 border-b border-border/60 py-2 last:border-0">
              <span>{t.titulo}</span>
              <span className="text-muted-foreground">{fmtDateTime(t.due_date)} · {t.status}</span>
            </li>
          ))}
        </ul>
        <Link to="/calendario" className="mt-3 inline-block text-sm text-primary hover:underline">
          Abrir calendário
        </Link>
      </div>
      <CrudModulo
        tabela="planejamento"
        eyebrow="Secretária IA"
        titulo="Planning"
        subtitulo="Meta da semana neste CRM. Combina com tarefas e calendário — não é um quadro à parte."
        campos={[
          { key: "titulo", label: "Título", tipo: "text", obrigatorio: true },
          { key: "semana_inicio", label: "Semana (início)", tipo: "date" },
          { key: "meta", label: "Meta", tipo: "text" },
          { key: "status", label: "Status", tipo: "select", opcoes: [
            { value: "planejado", label: "Planejado" },
            { value: "em_curso", label: "Em curso" },
            { value: "feito", label: "Feito" },
          ]},
          { key: "responsavel", label: "Responsável", tipo: "select", opcoes: RESPONSAVEIS_CRM.map((r) => ({ value: r, label: r })) },
          { key: "notas", label: "Notas", tipo: "textarea" },
        ]}
        colunas={[
          { key: "titulo", label: "Título" },
          { key: "semana_inicio", label: "Semana" },
          { key: "meta", label: "Meta" },
          { key: "status", label: "Status" },
          { key: "responsavel", label: "Responsável" },
        ]}
      />
    </div>
  );
}
