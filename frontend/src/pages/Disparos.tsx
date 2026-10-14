import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AbaDisparos } from "@/components/meta/AbaDisparos";
import { loadDisparoConfig, saveDisparoConfig } from "@/lib/disparo-config";

export default function Disparos() {
  const [config, setConfig] = useState(loadDisparoConfig);
  const [min, setMin] = useState(String(config.intervalo_min_s));
  const [max, setMax] = useState(String(config.intervalo_max_s));

  const salvar = () => {
    const next = saveDisparoConfig({
      intervalo_min_s: Number(min),
      intervalo_max_s: Number(max),
    });
    setConfig(next);
    setMin(String(next.intervalo_min_s));
    setMax(String(next.intervalo_max_s));
    toast.success(`Intervalo gravado: ${next.intervalo_min_s}–${next.intervalo_max_s}s entre envios.`);
  };

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          Campanhas
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Disparos</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Planilha → rascunho → envio espaçado pela API oficial. Templates se criam e aprovam em{" "}
          <Link to="/meta" className="underline-offset-2 hover:underline">
            Meta
          </Link>
          .
        </p>
      </header>

      <section className="rounded-sm border border-border bg-card p-5">
        <h2 className="mb-1 font-display text-sm font-semibold">Configuração do disparo</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Vale para campanhas novas. A Meta penaliza rajada: mantenha um intervalo humano.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="int-min">Intervalo mínimo (s)</Label>
            <Input
              id="int-min"
              className="w-28"
              type="number"
              min={1}
              value={min}
              onChange={(e) => setMin(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="int-max">Intervalo máximo (s)</Label>
            <Input
              id="int-max"
              className="w-28"
              type="number"
              min={1}
              value={max}
              onChange={(e) => setMax(e.target.value)}
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={salvar}>
            Salvar intervalo
          </Button>
          <p className="text-xs text-muted-foreground">
            Ativo: {config.intervalo_min_s}–{config.intervalo_max_s}s
          </p>
        </div>
      </section>

      <AbaDisparos />
    </div>
  );
}
