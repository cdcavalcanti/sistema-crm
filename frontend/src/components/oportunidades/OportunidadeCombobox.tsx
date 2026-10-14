import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export function OportunidadeCombobox({
  value,
  contatoId,
  onChange,
  placeholder = "Selecione uma oportunidade",
}: {
  value: string | null;
  /** Quando passado, filtra apenas oportunidades desse contato */
  contatoId?: string | null;
  onChange: (
    id: string | null,
    opp: { id: string; titulo: string | null; contato_id: string } | null,
  ) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const { data } = useQuery({
    queryKey: ["opps-combobox", q, contatoId],
    queryFn: async () => {
      let query = supabase
        .from("oportunidades")
        .select("id, titulo, contato_id, contato:contatos(nome), etapa:etapas(nome)")
        .order("criado_em", { ascending: false })
        .limit(50);
      if (contatoId) query = query.eq("contato_id", contatoId);
      if (q) query = query.ilike("titulo", `%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const selected = data?.find((o: any) => o.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between">
          {selected ? (
            <span className="truncate">
              {(selected as any).titulo ?? (selected as any).contato?.nome ?? "—"}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar oportunidade…" value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>Nenhuma oportunidade encontrada.</CommandEmpty>
            <CommandGroup>
              {(data ?? []).map((o: any) => (
                <CommandItem
                  key={o.id}
                  value={o.id}
                  onSelect={() => {
                    onChange(o.id, o);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === o.id ? "opacity-100" : "opacity-0")} />
                  <div className="flex flex-col">
                    <span className="text-sm">{o.titulo ?? o.contato?.nome ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">
                      {o.contato?.nome ?? "—"} · {o.etapa?.nome ?? "—"}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
