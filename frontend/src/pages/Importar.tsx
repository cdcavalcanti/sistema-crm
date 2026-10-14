import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const PASSOS = ["Arquivo", "O que criar", "Validação", "Execução"];

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const idx = (n: string) => header.indexOf(n);
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    return {
      nome: cols[idx("nome")] || cols[0],
      email: cols[idx("email")] || null,
      telefone: cols[idx("telefone")] || null,
      nome_estabelecimento: cols[idx("empresa")] || cols[idx("estabelecimento")] || null,
      segmento: cols[idx("segmento")] || null,
    };
  }).filter((r) => r.nome);
}

export default function Importar() {
  const qc = useQueryClient();
  const [passo, setPasso] = useState(0);
  const [preview, setPreview] = useState<ReturnType<typeof parseCsv>>([]);
  const [alvo, setAlvo] = useState<"leads" | "empresas">("leads");
  const [gravando, setGravando] = useState(false);

  const onFile = async (file: File) => {
    const text = await file.text();
    setPreview(parseCsv(text));
    setPasso(1);
  };

  const gravar = async () => {
    if (!preview.length) return;
    setGravando(true);
    try {
      if (alvo === "empresas") {
        const { error } = await supabase.from("empresas").insert(
          preview.map((r) => ({ nome: r.nome_estabelecimento || r.nome })),
        );
        if (error) throw error;
        toast.success(`${preview.length} empresas gravadas neste CRM`);
      } else {
        const { error } = await supabase.from("contatos").insert(preview);
        if (error) throw error;
        toast.success(`${preview.length} leads gravados neste CRM`);
      }
      setPreview([]);
      setPasso(0);
      qc.invalidateQueries({ queryKey: ["contatos"] });
      qc.invalidateQueries({ queryKey: ["empresas"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Falha ao importar");
    } finally {
      setGravando(false);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <p className="page-eyebrow">Administração</p>
        <h1 className="page-title">Importar</h1>
        <p className="page-subtitle max-w-2xl">
          CSV ou mapeamento simples. Entra como lead ou empresa neste tenant — uma única passada.
        </p>
      </header>
      <div className="flex flex-wrap gap-2">
        {PASSOS.map((p, i) => (
          <span
            key={p}
            className={`rounded-full px-3 py-1 text-xs ${i === passo ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {i + 1}. {p}
          </span>
        ))}
      </div>
      <div className="surface-card space-y-4 p-6">
        {passo === 0 && (
          <>
            <p className="text-sm">1. Envie o arquivo. Primeira linha = cabeçalho.</p>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            <p className="text-xs text-muted-foreground">Exemplo: nome,email,telefone,empresa,segmento</p>
          </>
        )}
        {passo >= 1 && (
          <>
            <p className="text-sm">2. O que criar</p>
            <div className="flex gap-2">
              <Button variant={alvo === "leads" ? "default" : "outline"} size="sm" onClick={() => setAlvo("leads")}>Leads</Button>
              <Button variant={alvo === "empresas" ? "default" : "outline"} size="sm" onClick={() => setAlvo("empresas")}>Empresas</Button>
            </div>
            <p className="text-sm">{preview.length} linhas prontas.</p>
            <ul className="max-h-48 overflow-auto text-sm text-muted-foreground">
              {preview.slice(0, 12).map((r, i) => (
                <li key={i}>{r.nome} · {r.email ?? "sem e-mail"} · {r.nome_estabelecimento ?? "—"}</li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setPreview([]); setPasso(0); }}>Voltar</Button>
              <Button disabled={gravando || !preview.length} onClick={() => void gravar()}>
                Executar importação
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
