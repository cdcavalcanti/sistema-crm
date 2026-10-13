import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function Atendimento() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["atendimento-fila"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversas")
        .select("id, wa_chat_id, atualizado_em, contato:contatos(id, nome, telefone)")
        .order("atualizado_em", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-8">
      <header>
        <p className="page-eyebrow">Comunicação</p>
        <h1 className="page-title">Atendimento</h1>
        <p className="page-subtitle">Fila humana do chat deste tenant. Handoff continua no WhatsApp do CRM.</p>
      </header>
      <div className="surface-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contato</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>Atualizado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4}>Carregando…</TableCell>
              </TableRow>
            ) : data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  Nenhuma conversa na fila.
                </TableCell>
              </TableRow>
            ) : (
              data.map((c: { id: string; atualizado_em: string; contato?: { nome?: string; telefone?: string } | null }) => (
                <TableRow key={c.id}>
                  <TableCell>{c.contato?.nome ?? "—"}</TableCell>
                  <TableCell>{c.contato?.telefone ?? "—"}</TableCell>
                  <TableCell>{fmtDateTime(c.atualizado_em)}</TableCell>
                  <TableCell>
                    <Link to="/chat" className="text-primary hover:underline">
                      Abrir chat
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
