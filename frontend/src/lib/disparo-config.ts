const KEY = "crm-disparo-config";

export type DisparoConfig = {
  intervalo_min_s: number;
  intervalo_max_s: number;
};

const PADRAO: DisparoConfig = { intervalo_min_s: 5, intervalo_max_s: 7 };

export function loadDisparoConfig(): DisparoConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...PADRAO };
    const parsed = JSON.parse(raw) as Partial<DisparoConfig>;
    const min = Number(parsed.intervalo_min_s);
    const max = Number(parsed.intervalo_max_s);
    return {
      intervalo_min_s: Number.isFinite(min) && min >= 1 ? min : PADRAO.intervalo_min_s,
      intervalo_max_s: Number.isFinite(max) && max >= 1 ? max : PADRAO.intervalo_max_s,
    };
  } catch {
    return { ...PADRAO };
  }
}

export function saveDisparoConfig(config: DisparoConfig): DisparoConfig {
  const min = Math.max(1, Math.round(config.intervalo_min_s));
  const max = Math.max(min, Math.round(config.intervalo_max_s));
  const next = { intervalo_min_s: min, intervalo_max_s: max };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
