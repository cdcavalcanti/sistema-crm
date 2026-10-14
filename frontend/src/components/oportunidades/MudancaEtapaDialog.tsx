import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MOTIVOS_PERDA } from "@/lib/constants";

export type EtapaAlvo = {
  id: string;
  nome: string;
  tipo: string | null;
};

// Campos extras coletados conforme o tipo da etapa de destino.
export type DadosMudancaEtapa = {
  data_fechamento?: string | null;
  motivo_perda?: string | null;
};

// Decide se mover para `tipo` exige o pop-up. Ganho → Data do fechamento;
// Perdido → Motivo da perda. Demais etapas trocam direto, sem dialog.
export function exigeConfirmacao(tipo: string | null | undefined): boolean {
  return tipo === "ganho" || tipo === "perdido";
}

function hojeISO(): string {
  // YYYY-MM-DD no fuso local (para <input type="date">)
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

/**
 * Dialog que coleta os dados extras ao mover uma oportunidade para uma
 * etapa de Ganho (Data do fechamento) ou Perdido (Motivo da perda).
 * Use junto com `exigeConfirmacao(etapa.tipo)`: só abra quando true.
 */
export function MudancaEtapaDialog({
  etapa,
  open,
  onOpenChange,
  onConfirm,
}: {
  etapa: EtapaAlvo | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (dados: DadosMudancaEtapa) => void;
}) {
  const isGanho = etapa?.tipo === "ganho";
  const [dataMatricula, setDataMatricula] = useState(hojeISO());
  const [motivo, setMotivo] = useState<string>("");

  // Reseta os campos sempre que o dialog (re)abre.
  useEffect(() => {
    if (open) {
      setDataMatricula(hojeISO());
      setMotivo("");
    }
  }, [open]);

  if (!etapa) return null;

  const podeConfirmar = isGanho ? !!dataMatricula : !!motivo;

  const confirmar = () => {
    if (isGanho) {
      onConfirm({ data_fechamento: dataMatricula, motivo_perda: null });
    } else {
      onConfirm({ motivo_perda: motivo, data_fechamento: null });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isGanho ? "Registrar fechamento" : "Motivo da perda"}
          </DialogTitle>
          <DialogDescription>
            {isGanho
              ? `Movendo para “${etapa.nome}”. Informe a data do fechamento.`
              : `Movendo para “${etapa.nome}”. Selecione o motivo da perda.`}
          </DialogDescription>
        </DialogHeader>

        {isGanho ? (
          <div className="space-y-1.5">
            <Label htmlFor="data_fechamento">Data do fechamento</Label>
            <Input
              id="data_fechamento"
              type="date"
              value={dataMatricula}
              onChange={(e) => setDataMatricula(e.target.value)}
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o motivo" />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS_PERDA.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!podeConfirmar} onClick={confirmar}>
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
