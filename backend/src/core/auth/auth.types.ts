import type { AppRole } from "@prisma/client";

export type Actor = {
  id: string;
  email: string;
  nome: string | null;
  roles: AppRole[];
  responsavelCrm: string | null;
};

export function isAdmin(actor: Actor | null | undefined): boolean {
  if (!actor) return false;
  return actor.roles.includes("admin") || actor.roles.includes("super_admin");
}

export function isSuperAdmin(actor: Actor | null | undefined): boolean {
  return Boolean(actor?.roles.includes("super_admin"));
}
