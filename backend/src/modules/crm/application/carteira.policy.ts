import { isAdmin, type Actor } from "../../../core/auth/auth.types";

export function podeVerCarteira(actor: Actor, responsavel: string | null | undefined): boolean {
  if (isAdmin(actor)) return true;
  if (responsavel == null || String(responsavel).trim() === "") return true;
  return String(responsavel).trim() === (actor.responsavelCrm ?? "").trim();
}

export function carteiraWhere(actor: Actor): { OR: Array<Record<string, unknown>> } | undefined {
  if (isAdmin(actor)) return undefined;
  const mine = actor.responsavelCrm ?? null;
  return {
    OR: [{ responsavel: null }, { responsavel: "" }, { responsavel: mine }],
  };
}
