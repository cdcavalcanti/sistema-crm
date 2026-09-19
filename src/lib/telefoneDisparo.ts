/** Normalização de telefone para disparos (lista BR / detecção). */

const BR_FIXO_SEM_DDI = /^[1-9][1-9]\d{8}$/;
const BR_CELULAR_SEM_DDI = /^[1-9][1-9]9\d{8}$/;

export type PaisLista = "BR" | "US" | null;

/**
 * Só dígitos com DDI. País declarado = regra rígida; null = heurística BR-first.
 */
export function paraE164(
  bruto: string | null | undefined,
  pais: PaisLista = "BR",
): string | null {
  const digits = String(bruto ?? "").replace(/\D/g, "");
  if (!digits) return null;

  if (pais === "BR") {
    if (/^55[1-9][1-9]\d{8,9}$/.test(digits)) return digits;
    if (BR_FIXO_SEM_DDI.test(digits) || BR_CELULAR_SEM_DDI.test(digits)) {
      return "55" + digits;
    }
    return null;
  }

  if (pais === "US") {
    if (/^1[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return digits;
    if (/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return "1" + digits;
    return null;
  }

  // Detecção: BR sem DDI, senão devolve dígitos se parecer E.164 (>= 10).
  if (BR_FIXO_SEM_DDI.test(digits) || BR_CELULAR_SEM_DDI.test(digits)) {
    return "55" + digits;
  }
  if (/^55[1-9][1-9]\d{8,9}$/.test(digits)) return digits;
  if (digits.length >= 10 && digits.length <= 15) return digits;
  return null;
}
