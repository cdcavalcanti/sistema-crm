import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Search, Mail, Phone, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { toast } from "sonner";
import { fmtDate, fmtPhone } from "@/lib/format";
import { NovoContatoDialog } from "@/components/contatos/NovoContatoDialog";
import { EditarContatoDialog } from "@/components/contatos/EditarContatoDialog";
import { useAuth } from "@/hooks/useAuth";

import { EtiquetaChip } from "@/components/etiquetas/EtiquetasContato";

type Contato = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  nome_estabelecimento: string | null;
  anos_operacao: number | null;
  segmento: string | null;
  observacoes: string | null;
  criado_em: string;
  contato_etiquetas?: { etiqueta: { id: string; nome: string; cor: string } | null }[];
};

const PAGE_SIZE = 50;

export default function Contatos() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [editando, setEditando] = useState<Contato | null>(null);
  const [removendo, setRemovendo] = useState<Contato | null>(null);
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["contatos", q, page],
    queryFn: async () => {
      let query = supabase
        .from("contatos")
        .select(
          "id, nome, email, telefone, nome_estabelecimento, anos_operacao, segmento, observacoes, criado_em, contato_etiquetas(etiqueta:etiquetas(id, nome, cor))",
          { count: "exact" },
        )
        .order("criado_em", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (q)
        query = query.or(
          `nome.ilike.%${q}%,email.ilike.%${q}%,telefone.ilike.%${q}%,nome_estabelecimento.ilike.%${q}%`,
        );
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data ?? []) as Contato[], total: count ?? 0 };
    },
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const inicio = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const fim = Math.min((page + 1) * PAGE_SIZE, total);

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("contatos").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contato removido");
      qc.invalidateQueries({ queryKey: ["contatos"] });
      setRemovendo(null);
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro ao remover"),
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="page-eyebrow">Base de leads</p>
          <h1 className="page-title">Contatos</h1>
          <p className="page-subtitle">Leads e estabelecimentos B2B em todas as etapas do funil.</p>
        </div>
        <NovoContatoDialog />
      </header>

      <div className="surface-card divide-y divide-border/60">
        <div className="flex items-center gap-3 p-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, e-mail, celular ou estabelecimento…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            className="border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          />
          {data && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {inicio}–{fim} de {total}
            </span>
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Estabelecimento</TableHead>
              <TableHead>Segmento</TableHead>
              <TableHead>Criado</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-10 w-full" />
                </TableCell>
              </TableRow>
            )}
            {!isLoading && (data?.rows ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum estabelecimento ainda. Cadastre o primeiro lead B2B para começar o funil.
                </TableCell>
              </TableRow>
            )}
            {(data?.rows ?? []).map((c: Contato) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link to={`/contatos/${c.id}`} className="font-medium hover:underline">
                    {c.nome}
                  </Link>
                  {(c.contato_etiquetas ?? []).some((e) => e.etiqueta) && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(c.contato_etiquetas ?? []).map(
                        (e) => e.etiqueta && <EtiquetaChip key={e.etiqueta.id} nome={e.etiqueta.nome} cor={e.etiqueta.cor} />,
                      )}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    {c.email && (
                      <div className="flex items-center gap-1.5">
                        <Mail className="h-3 w-3" /> {c.email}
                      </div>
                    )}
                    {c.telefone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3" /> {fmtPhone(c.telefone)}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {c.nome_estabelecimento ? (
                    <span>
                      {c.nome_estabelecimento}
                      {c.anos_operacao != null && (
                        <span className="ml-1 text-xs text-muted-foreground/70">· {c.anos_operacao} anos de operação</span>
                      )}
                    </span>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{c.segmento ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{fmtDate(c.criado_em)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditando(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setRemovendo(c)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-2 p-3">
            <span className="text-xs text-muted-foreground">
              Página {page + 1} de {totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                Próxima
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <EditarContatoDialog
        contato={editando}
        open={!!editando}
        onOpenChange={(v) => !v && setEditando(null)}
      />

      <AlertDialog open={!!removendo} onOpenChange={(v) => !v && setRemovendo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover contato?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação também remove todas as oportunidades vinculadas a <strong>{removendo?.nome}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removendo && remover.mutate(removendo.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
