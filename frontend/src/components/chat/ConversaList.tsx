import { useState } from "react";
import { Search, Users, Pin, MoreVertical, MailMinus } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fmtRelative } from "@/lib/format";
import { EtiquetaChip } from "@/components/etiquetas/EtiquetasContato";

export type Canal = "whatsapp" | "instagram";

export type ConversaResumo = {
  id: string;
  wa_chat_id: string | null;
  telefone: string | null;
  nome_whatsapp: string | null;
  foto_url: string | null;
  nao_lidas: number;
  ultimo_em: string;
  ultima_msg?: string | null;
  contato_id?: string | null;
  eh_grupo?: boolean;
  fixada?: boolean;
  nao_lida_manual?: boolean;
  canal?: Canal;
  chatwoot_conversation_id?: number | null;
  instagram_username?: string | null;
  contato: {
    id: string;
    nome: string;
    contato_etiquetas?: { etiqueta: { id: string; nome: string; cor: string } | null }[];
  } | null;
};

// Formata telefone BR removendo o 55 inicial: 5548999990000 -> (48) 99999-0000
export function fmtWhats(tel: string | null | undefined): string {
  if (!tel) return "";
  let d = tel.replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel;
}

// Ignora nomes-lixo (formato de e-mail / "sememail…") vindos de importações antigas.
function nomeValido(n?: string | null): string | null {
  const t = (n ?? "").trim();
  if (!t || /@/.test(t) || /^sememail/i.test(t)) return null;
  return t;
}

export function tituloConversa(c: ConversaResumo): string {
  return nomeValido(c.contato?.nome) || nomeValido(c.nome_whatsapp) || fmtWhats(c.telefone) || c.wa_chat_id;
}

export function Avatar({ url, nome, size = 44 }: { url?: string | null; nome: string; size?: number }) {
  const [erro, setErro] = useState(false);
  const iniciais = nome.trim().slice(0, 2).toUpperCase() || "?";
  if (url && !erro) {
    return (
      <img
        src={url}
        alt={nome}
        onError={() => setErro(true)}
        style={{ width: size, height: size }}
        className="flex-shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="flex flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
    >
      {iniciais}
    </div>
  );
}

type FiltroChat = "todas" | "nao_lidas" | "favoritas" | "grupos";
const FILTROS: { key: FiltroChat; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "nao_lidas", label: "Não lidas" },
  { key: "favoritas", label: "Favoritas" },
  { key: "grupos", label: "Grupos" },
];

export function ConversaList({
  conversas,
  selecionadaId,
  onSelecionar,
  onToggleFixar,
  onMarcarNaoLido,
  mostrarGrupos = true,
}: {
  conversas: ConversaResumo[];
  selecionadaId: string | null;
  onSelecionar: (c: ConversaResumo) => void;
  onToggleFixar?: (c: ConversaResumo) => void;
  onMarcarNaoLido?: (c: ConversaResumo) => void;
  mostrarGrupos?: boolean; // Instagram não tem grupos — some o filtro
}) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroChat>("todas");
  const filtros = mostrarGrupos ? FILTROS : FILTROS.filter((f) => f.key !== "grupos");
  const termo = busca.trim().toLowerCase();
  const filtradas = conversas.filter((c) => {
    if (filtro === "nao_lidas" && !(c.nao_lidas > 0 || c.nao_lida_manual)) return false;
    if (filtro === "favoritas" && !c.fixada) return false;
    if (filtro === "grupos" && !c.eh_grupo) return false;
    if (termo && !`${tituloConversa(c)} ${c.telefone ?? ""} ${c.nome_whatsapp ?? ""}`.toLowerCase().includes(termo)) return false;
    return true;
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
        <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar conversa…"
          className="h-8 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
        />
      </div>
      <div className="flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2">
        {filtros.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFiltro(f.key)}
            className={`flex-shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filtro === f.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <ul className="flex-1 divide-y divide-border/50 overflow-y-auto">
        {filtradas.length === 0 && (
          <li className="p-6 text-center text-sm text-muted-foreground">Nenhuma conversa.</li>
        )}
        {filtradas.map((c) => {
          const titulo = tituloConversa(c);
          const ativa = c.id === selecionadaId;
          return (
            <li key={c.id} className="group relative">
              <button
                type="button"
                onClick={() => onSelecionar(c)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                  ativa ? "bg-sidebar-accent" : c.fixada ? "bg-muted/30 hover:bg-muted/50" : "hover:bg-muted/50"
                }`}
              >
                <Avatar url={c.foto_url} nome={titulo} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1">
                      {c.eh_grupo && <Users className="h-3 w-3 flex-shrink-0 text-muted-foreground" />}
                      <span className="truncate text-sm font-medium">{titulo}</span>
                    </span>
                    <span className="flex flex-shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                      {c.fixada && <Pin className="h-3 w-3 fill-red-600 text-red-600" />}
                      {fmtRelative(c.ultimo_em)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {c.contato && (
                      <span
                        className="h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500"
                        title="Vinculado ao CRM"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {c.ultima_msg || fmtWhats(c.telefone)}
                    </span>
                    {c.nao_lidas > 0 ? (
                      <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[10px] font-semibold text-white">
                        {c.nao_lidas}
                      </span>
                    ) : c.nao_lida_manual ? (
                      <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-emerald-500" title="Não lida" />
                    ) : null}
                  </div>
                  {(c.contato?.contato_etiquetas ?? []).some((e) => e.etiqueta) && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(c.contato?.contato_etiquetas ?? []).map(
                        (e) => e.etiqueta && <EtiquetaChip key={e.etiqueta.id} nome={e.etiqueta.nome} cor={e.etiqueta.cor} />,
                      )}
                    </div>
                  )}
                </div>
              </button>
              {(onToggleFixar || onMarcarNaoLido) && (
                <div className="absolute right-1.5 top-1.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-card text-muted-foreground shadow hover:bg-muted"
                        title="Ações"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {onToggleFixar && (
                        <DropdownMenuItem onClick={() => onToggleFixar(c)}>
                          <Pin className="mr-2 h-4 w-4" />
                          {c.fixada ? "Desafixar" : "Fixar conversa"}
                        </DropdownMenuItem>
                      )}
                      {onMarcarNaoLido && (
                        <DropdownMenuItem onClick={() => onMarcarNaoLido(c)}>
                          <MailMinus className="mr-2 h-4 w-4" />
                          Marcar como não lido
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
