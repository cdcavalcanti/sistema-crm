import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Tabela = keyof Database["public"]["Tables"];
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { fmtDate, fmtMoney } from "@/lib/format";

export type CampoModulo = {
  key: string;
  label: string;
  tipo: "text" | "number" | "textarea" | "select" | "date" | "oportunidade" | "contato";
  opcoes?: { value: string; label: string }[];
  obrigatorio?: boolean;
};

type Row = Record<string, unknown> & { id: string };

function cell(row: Row, key: string) {
  const v = row[key];
  if (v == null || v === "") return "—";
  if (key === "valor") return fmtMoney(v as number);
  if (key.includes("data") || key === "validade" || key === "semana_inicio" || key === "criado_em") {
    return fmtDate(String(v));
  }
  if (key === "status") {
    return (
      <Badge variant="outline" className="rounded-sm font-normal">
        {String(v)}
      </Badge>
    );
  }
  if (typeof v === "object") {
    const o = v as { titulo?: string; nome?: string };
    return o.titulo ?? o.nome ?? "—";
  }
  return String(v);
}

export function CrudModulo({
  tabela,
  titulo,
  eyebrow,
  subtitulo,
  campos,
  colunas,
  aviso,
  vincular = true,
}: {
  tabela: Tabela;
  titulo: string;
  eyebrow: string;
  subtitulo: string;
  campos: CampoModulo[];
  colunas: { key: string; label: string }[];
  aviso?: string;
  vincular?: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const { data: rows = [], isLoading } = useQuery({
    queryKey: [tabela],
    queryFn: async () => {
      const select = vincular
        ? "*, contato:contatos(id, nome, nome_estabelecimento), oportunidade:oportunidades(id, titulo)"
        : "*";
      const { data, error } = await supabase
        .from(tabela)
        .select(select)
        .order("criado_em", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: opps = [] } = useQuery({
    queryKey: ["modulos-opps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("oportunidades")
        .select("id, titulo, contato:contatos(nome)")
        .order("criado_em", { ascending: false })
        .limit(80);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: contatos = [] } = useQuery({
    queryKey: ["modulos-contatos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contatos")
        .select("id, nome, nome_estabelecimento")
        .order("nome")
        .limit(80);
      if (error) throw error;
      return data ?? [];
    },
  });

  const criar = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {};
      for (const c of campos) {
        const raw = form[c.key]?.trim() ?? "";
        if (c.obrigatorio && !raw) throw new Error(`${c.label} é obrigatório`);
        if (!raw) {
          payload[c.key] = c.tipo === "number" ? null : null;
          continue;
        }
        payload[c.key] = c.tipo === "number" ? Number(raw) : raw;
      }
      const { error } = await supabase.from(tabela).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registrado neste CRM");
      setOpen(false);
      setForm({});
      qc.invalidateQueries({ queryKey: [tabela] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="page-eyebrow">{eyebrow}</p>
          <h1 className="page-title">{titulo}</h1>
          <p className="page-subtitle max-w-2xl">{subtitulo}</p>
          {aviso && <p className="mt-2 text-xs text-muted-foreground">{aviso}</p>}
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Novo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Novo registro</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              {campos.map((c) => (
                <div key={c.key} className="space-y-1.5">
                  <Label>{c.label}</Label>
                  {c.tipo === "textarea" ? (
                    <Textarea
                      rows={3}
                      value={form[c.key] ?? ""}
                      onChange={(e) => setForm({ ...form, [c.key]: e.target.value })}
                    />
                  ) : c.tipo === "select" ? (
                    <Select
                      value={form[c.key] ?? ""}
                      onValueChange={(v) => setForm({ ...form, [c.key]: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {(c.opcoes ?? []).map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : c.tipo === "oportunidade" ? (
                    <Select
                      value={form[c.key] ?? ""}
                      onValueChange={(v) => setForm({ ...form, [c.key]: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Negócio (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {opps.map((o: { id: string; titulo: string | null }) => (
                          <SelectItem key={o.id} value={o.id}>
                            {o.titulo ?? o.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : c.tipo === "contato" ? (
                    <Select
                      value={form[c.key] ?? ""}
                      onValueChange={(v) => setForm({ ...form, [c.key]: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Contato (opcional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {contatos.map((ct: { id: string; nome: string }) => (
                          <SelectItem key={ct.id} value={ct.id}>
                            {ct.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={c.tipo === "number" ? "number" : c.tipo === "date" ? "date" : "text"}
                      value={form[c.key] ?? ""}
                      onChange={(e) => setForm({ ...form, [c.key]: e.target.value })}
                    />
                  )}
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button onClick={() => criar.mutate()} disabled={criar.isPending}>
                Gravar neste CRM
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <div className="surface-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {colunas.map((c) => (
                <TableHead key={c.key}>{c.label}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={colunas.length} className="text-muted-foreground">
                  Carregando…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colunas.length} className="text-muted-foreground">
                  Nenhum registro neste tenant.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  {colunas.map((c) => (
                    <TableCell key={c.key}>
                      {c.key === "oportunidade" && (row.oportunidade as { id?: string } | null)?.id ? (
                        <Link
                          to={`/oportunidades/${(row.oportunidade as { id: string }).id}`}
                          className="text-primary hover:underline"
                        >
                          {cell(row, "oportunidade")}
                        </Link>
                      ) : (
                        cell(row, c.key)
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
