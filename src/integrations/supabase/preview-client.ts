import { createPreviewDb, type PreviewDb, type PreviewRow } from "@/lib/preview-store";

type Embed = {
  alias: string;
  table: string;
  inner: boolean;
  cols: string;
};

type Rel = { local: string; table: string; foreign: string; many?: boolean };

const REL: Record<string, Record<string, Rel>> = {
  oportunidades: {
    contato: { local: "contato_id", table: "contatos", foreign: "id" },
    contatos: { local: "contato_id", table: "contatos", foreign: "id" },
    etapa: { local: "etapa_id", table: "etapas", foreign: "id" },
    etapas: { local: "etapa_id", table: "etapas", foreign: "id" },
  },
  tarefas: {
    contato: { local: "contato_id", table: "contatos", foreign: "id" },
    contatos: { local: "contato_id", table: "contatos", foreign: "id" },
    oportunidade: { local: "oportunidade_id", table: "oportunidades", foreign: "id" },
    oportunidades: { local: "oportunidade_id", table: "oportunidades", foreign: "id" },
  },
  conversas: {
    contato: { local: "contato_id", table: "contatos", foreign: "id" },
    contatos: { local: "contato_id", table: "contatos", foreign: "id" },
  },
  contatos: {
    contato_etiquetas: { local: "id", table: "contato_etiquetas", foreign: "contato_id", many: true },
  },
  contato_etiquetas: {
    etiqueta: { local: "etiqueta_id", table: "etiquetas", foreign: "id" },
    etiquetas: { local: "etiqueta_id", table: "etiquetas", foreign: "id" },
  },
  calendario_eventos: {
    contato: { local: "contato_id", table: "contatos", foreign: "id" },
    oportunidade: { local: "oportunidade_id", table: "oportunidades", foreign: "id" },
  },
};

function splitTop(input: string, sep = ","): string[] {
  const out: string[] = [];
  let buf = "";
  let depth = 0;
  for (const ch of input) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === sep && depth === 0) {
      if (buf.trim()) out.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function parseSelect(select: string): { star: boolean; cols: string[]; embeds: Embed[] } {
  if (!select || select === "*") return { star: true, cols: [], embeds: [] };
  const cols: string[] = [];
  const embeds: Embed[] = [];
  for (const part of splitTop(select)) {
    const m = part.match(/^(\w+)(?::(\w+))?(!inner)?\((.*)\)$/);
    if (m) {
      const alias = m[1];
      const table = m[2] ?? m[1];
      embeds.push({ alias, table, inner: Boolean(m[3]), cols: m[4] ?? "*" });
      continue;
    }
    cols.push(part);
  }
  return { star: false, cols, embeds };
}

function ilike(value: unknown, pattern: string): boolean {
  const text = String(value ?? "").toLowerCase();
  const re = new RegExp(
    `^${pattern
      .toLowerCase()
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/%/g, ".*")
      .replace(/_/g, ".")}$`,
  );
  return re.test(text);
}

function cmp(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "pt-BR");
}

function getPath(row: PreviewRow, path: string): unknown {
  let acc: unknown = row;
  for (const key of path.split(".")) {
    if (acc == null || typeof acc !== "object") return undefined;
    const obj = acc as PreviewRow;
    if (key in obj) {
      acc = obj[key];
      continue;
    }
    const alt = Object.keys(obj).find((k) => k === key || `${k}s` === key || k === `${key}s`);
    acc = alt ? obj[alt] : undefined;
  }
  return acc;
}

function parseInList(raw: string): unknown[] {
  const inner = raw.replace(/^\(/, "").replace(/\)$/, "");
  if (!inner) return [];
  return splitTop(inner).map((x) => x.replace(/^"+|"+$/g, "").replace(/^'+|'+$/g, ""));
}

function matchAtom(row: PreviewRow, atom: string): boolean {
  const inMatch = atom.match(/^([.\w]+)\.in\.\((.*)\)$/);
  if (inMatch) {
    const val = getPath(row, inMatch[1]);
    return parseInList(`(${inMatch[2]})`).map(String).includes(String(val ?? ""));
  }
  const m = atom.match(/^([.\w]+)\.(eq|neq|gt|gte|lt|lte|like|ilike|is)\.(.*)$/);
  if (!m) return false;
  return matchOp(row, m[1], m[2], m[3]);
}

function matchOp(row: PreviewRow, col: string, op: string, raw: unknown): boolean {
  const val = getPath(row, col);
  if (op === "is") {
    if (raw === null || raw === "null") return val == null;
    return val === raw;
  }
  if (op === "in") {
    const list = Array.isArray(raw) ? raw : parseInList(String(raw));
    return list.map(String).includes(String(val ?? ""));
  }
  if (op === "eq") return String(val ?? "") === String(raw ?? "");
  if (op === "neq") return String(val ?? "") !== String(raw ?? "");
  if (op === "gt") return String(val ?? "") > String(raw ?? "");
  if (op === "gte") return String(val ?? "") >= String(raw ?? "");
  if (op === "lt") return String(val ?? "") < String(raw ?? "");
  if (op === "lte") return String(val ?? "") <= String(raw ?? "");
  if (op === "like" || op === "ilike") return ilike(val, String(raw ?? ""));
  return true;
}

function project(row: PreviewRow, table: string, select: string, db: PreviewDb): PreviewRow | null {
  const parsed = parseSelect(select);
  const out: PreviewRow = parsed.star
    ? { ...row }
    : Object.fromEntries(parsed.cols.map((c) => [c, row[c]]));

  for (const embed of parsed.embeds) {
    const rel =
      REL[table]?.[embed.alias] ??
      REL[table]?.[embed.table] ??
      (embed.alias.endsWith("s")
        ? {
            local: "id",
            table: embed.table,
            foreign: `${table.replace(/s$/, "")}_id`,
            many: true as const,
          }
        : {
            local: `${embed.table.replace(/s$/, "")}_id`,
            table: embed.table,
            foreign: "id",
          });
    const foreignRows = (db[rel.table] ?? []).filter((fr) => fr[rel.foreign] === row[rel.local]);
    const projected = foreignRows
      .map((fr) => project(fr, rel.table, embed.cols || "*", db))
      .filter((x): x is PreviewRow => x != null);
    if (rel.many) {
      out[embed.alias] = projected;
      if (embed.inner && projected.length === 0) return null;
    } else {
      const one = projected[0] ?? null;
      out[embed.alias] = one;
      if (embed.inner && !one) return null;
    }
  }
  return out;
}

function ok(data: unknown, count?: number | null) {
  return {
    data,
    error: null,
    count: count ?? (Array.isArray(data) ? data.length : data ? 1 : 0),
    status: 200,
    statusText: "OK",
  };
}

export function createPreviewClient() {
  const db = createPreviewDb();
  let seq = 9000;

  const nextId = () => {
    seq += 1;
    return `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
  };

  const channel = () => {
    const ch = {
      on: () => ch,
      subscribe: () => ch,
    };
    return ch;
  };

  const from = (table: string) => {
    type Filter = (row: PreviewRow) => boolean;
    const state = {
      table,
      select: "*",
      filters: [] as Filter[],
      dotted: [] as Filter[],
      orGroups: [] as Filter[][],
      orders: [] as { col: string; asc: boolean; nullsFirst?: boolean }[],
      limit: null as number | null,
      range: null as [number, number] | null,
      countExact: false,
      head: false,
      single: false,
      maybeSingle: false,
      op: "select" as "select" | "insert" | "update" | "delete" | "upsert",
      payload: null as PreviewRow | PreviewRow[] | null,
    };

    const addOp = (col: string, fn: Filter) => {
      (col.includes(".") ? state.dotted : state.filters).push(fn);
    };

    const applyRaw = (rows: PreviewRow[]) => {
      let out = rows.filter((r) => state.filters.every((f) => f(r)));
      for (const group of state.orGroups) {
        out = out.filter((r) => group.some((f) => f(r)));
      }
      return out;
    };

    const run = () => {
      const now = new Date().toISOString();
      if (!db[table]) db[table] = [];

      if (state.op === "insert" || state.op === "upsert") {
        const rows = (Array.isArray(state.payload) ? state.payload : [state.payload ?? {}]).map((r) => {
          const row = {
            ...r,
            id: r.id ?? nextId(),
            criado_em: r.criado_em ?? now,
            atualizado_em: now,
          };
          db[table].push(row);
          return row;
        });
        return finish(rows);
      }

      if (state.op === "update") {
        const patch = (state.payload ?? {}) as PreviewRow;
        const updated: PreviewRow[] = [];
        db[table] = db[table].map((row) => {
          if (!state.filters.every((f) => f(row))) return row;
          const next = { ...row, ...patch, atualizado_em: now };
          updated.push(next);
          return next;
        });
        return finish(updated);
      }

      if (state.op === "delete") {
        const keep: PreviewRow[] = [];
        const removed: PreviewRow[] = [];
        for (const row of db[table]) {
          if (state.filters.every((f) => f(row))) removed.push(row);
          else keep.push(row);
        }
        db[table] = keep;
        return finish(removed);
      }

      return finish(applyRaw(db[table]));
    };

    const finish = (rows: PreviewRow[]) => {
      let projected = rows
        .map((r) => project(r, table, state.select, db))
        .filter((x): x is PreviewRow => x != null);
      projected = projected.filter((r) => state.dotted.every((f) => f(r)));

      for (const ord of state.orders) {
        projected.sort((a, b) => {
          const av = a[ord.col];
          const bv = b[ord.col];
          if (av == null || bv == null) {
            if (av == null && bv == null) return 0;
            const nullFirst = ord.nullsFirst ?? false;
            if (av == null) return nullFirst ? -1 : 1;
            return nullFirst ? 1 : -1;
          }
          return ord.asc ? cmp(av, bv) : cmp(bv, av);
        });
      }

      const count = projected.length;
      if (state.range) projected = projected.slice(state.range[0], state.range[1] + 1);
      if (state.limit != null) projected = projected.slice(0, state.limit);

      if (state.single) {
        if (projected.length !== 1) {
          return {
            data: null,
            error: { message: projected.length ? "multiple rows" : "not found" },
            count,
            status: 406,
            statusText: "Not Acceptable",
          };
        }
        return ok(state.head ? null : projected[0], count);
      }
      if (state.maybeSingle) {
        return ok(state.head ? null : (projected[0] ?? null), count);
      }
      return ok(state.head ? null : projected, count);
    };

    const builder: Record<string, unknown> = {
      select(cols: string, opts?: { count?: string; head?: boolean }) {
        state.select = cols || "*";
        state.countExact = Boolean(opts?.count);
        state.head = Boolean(opts?.head);
        return builder;
      },
      insert(payload: PreviewRow | PreviewRow[]) {
        state.op = "insert";
        state.payload = payload;
        return builder;
      },
      update(payload: PreviewRow) {
        state.op = "update";
        state.payload = payload;
        return builder;
      },
      upsert(payload: PreviewRow | PreviewRow[]) {
        state.op = "upsert";
        state.payload = payload;
        return builder;
      },
      delete() {
        state.op = "delete";
        return builder;
      },
      eq(col: string, val: unknown) {
        addOp(col, (r) => matchOp(r, col, "eq", val));
        return builder;
      },
      neq(col: string, val: unknown) {
        addOp(col, (r) => matchOp(r, col, "neq", val));
        return builder;
      },
      gt(col: string, val: unknown) {
        addOp(col, (r) => matchOp(r, col, "gt", val));
        return builder;
      },
      gte(col: string, val: unknown) {
        addOp(col, (r) => matchOp(r, col, "gte", val));
        return builder;
      },
      lt(col: string, val: unknown) {
        addOp(col, (r) => matchOp(r, col, "lt", val));
        return builder;
      },
      lte(col: string, val: unknown) {
        addOp(col, (r) => matchOp(r, col, "lte", val));
        return builder;
      },
      in(col: string, vals: unknown[]) {
        addOp(col, (r) => matchOp(r, col, "in", vals));
        return builder;
      },
      is(col: string, val: unknown) {
        addOp(col, (r) => matchOp(r, col, "is", val));
        return builder;
      },
      like(col: string, val: string) {
        addOp(col, (r) => matchOp(r, col, "like", val));
        return builder;
      },
      ilike(col: string, val: string) {
        addOp(col, (r) => matchOp(r, col, "ilike", val));
        return builder;
      },
      or(expr: string) {
        const atoms = splitTop(expr);
        state.orGroups.push(atoms.map((a) => (r: PreviewRow) => matchAtom(r, a)));
        return builder;
      },
      not(col: string, op: string, val: unknown) {
        addOp(col, (r) => !matchOp(r, col, op, val));
        return builder;
      },
      match(values: PreviewRow) {
        state.filters.push((r) => Object.entries(values).every(([k, v]) => matchOp(r, k, "eq", v)));
        return builder;
      },
      filter(col: string, op: string, val: unknown) {
        state.filters.push((r) => matchOp(r, col, op.replace(/^\./, ""), val));
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
        state.orders.push({
          col,
          asc: opts?.ascending !== false,
          nullsFirst: opts?.nullsFirst,
        });
        return builder;
      },
      limit(n: number) {
        state.limit = n;
        return builder;
      },
      range(fromIdx: number, toIdx: number) {
        state.range = [fromIdx, toIdx];
        return builder;
      },
      single() {
        state.single = true;
        return builder;
      },
      maybeSingle() {
        state.maybeSingle = true;
        return builder;
      },
      returns() {
        return builder;
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve().then(run).then(resolve, reject);
      },
    };
    return builder;
  };

  return {
    from,
    rpc: async () => ok(null, 0),
    functions: {
      invoke: async (name: string) => {
        if (name === "whatsapp-status") return { data: { conectado: false }, error: null };
        return { data: { ok: true, preview: true }, error: null };
      },
    },
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: async () => ({
        data: { user: null, session: null },
        error: { message: "Modo demonstração — use o botão Demonstração." },
      }),
      signUp: async () => ({
        data: { user: null, session: null },
        error: { message: "Cadastro desativado na demonstração." },
      }),
      signOut: async () => ({ error: null }),
      resetPasswordForEmail: async () => ({
        data: {},
        error: { message: "Recuperação indisponível na demonstração." },
      }),
      updateUser: async () => ({
        data: { user: null },
        error: { message: "Indisponível na demonstração." },
      }),
    },
    channel,
    removeChannel: () => undefined,
  };
}
