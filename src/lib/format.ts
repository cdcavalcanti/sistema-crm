import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export function fmtDate(value: string | Date | null | undefined, pattern = "dd/MM/yyyy") {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, pattern, { locale: ptBR });
}

export function fmtDateTime(value: string | Date | null | undefined) {
  return fmtDate(value, "dd/MM/yyyy HH:mm");
}

export function fmtRelative(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? parseISO(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return formatDistanceToNow(d, { locale: ptBR, addSuffix: true });
}

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 2,
});

export function fmtMoney(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  return brl.format(n);
}

const numberFmt = new Intl.NumberFormat("pt-BR");
export function fmtNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return numberFmt.format(value);
}

export function fmtPhone(raw: string | null | undefined) {
  if (!raw) return "—";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return raw;
}
