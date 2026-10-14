export function toCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

export function serializeRow(value: unknown): unknown {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map(serializeRow);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "_count") continue;
      out[toSnake(k)] = serializeRow(v);
    }
    return out;
  }
  return value;
}

export function camelizeKeys(value: unknown): unknown {
  if (value == null || typeof value !== "object" || value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(camelizeKeys);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[toCamel(k)] = camelizeKeys(v);
  }
  return out;
}
