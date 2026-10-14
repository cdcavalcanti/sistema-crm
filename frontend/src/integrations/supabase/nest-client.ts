import { apiV1 } from "@/lib/api";

const SESSION_KEY = "crm-api-session";

type Filter = { type: string; col: string; val?: unknown; not?: boolean };
type Order = { col: string; asc?: boolean };

type Session = {
  access_token: string;
  token_type: string;
  user: {
    id: string;
    email: string;
    app_metadata: Record<string, unknown>;
    user_metadata: { nome?: string | null };
    aud: string;
    created_at: string;
  };
};

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeSession(s: Session | null) {
  if (!s) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

type AuthListener = (event: string, session: Session | null) => void;
const listeners = new Set<AuthListener>();

function emit(event: string, session: Session | null) {
  listeners.forEach((fn) => fn(event, session));
}

async function request(path: string, init: RequestInit = {}) {
  const session = readSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  const res = await fetch(`${apiV1()}${path}`, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data?.error || data?.message || `HTTP ${res.status}`;
    return { data: null, error: { message }, status: res.status };
  }
  return { data, error: null, status: res.status };
}

export function createNestClient() {
  const from = (table: string) => {
    const state: {
      op: "select" | "insert" | "update" | "delete" | "upsert";
      select: string;
      filters: Filter[];
      or?: string;
      payload?: unknown;
      order: Order[];
      limit?: number;
      range?: [number, number];
      single?: boolean;
      maybeSingle?: boolean;
      count?: boolean;
      head?: boolean;
    } = {
      op: "select",
      select: "*",
      filters: [],
      order: [],
    };

    const run = async () => {
      const { data, error } = await request("/query", {
        method: "POST",
        body: JSON.stringify({ table, ...state }),
      });
      if (error) return { data: null, error, count: null };
      return {
        data: data?.data ?? null,
        error: data?.error ? { message: data.error } : null,
        count: data?.count ?? null,
      };
    };

    const builder: Record<string, unknown> = {
      select(cols: string, opts?: { count?: string; head?: boolean }) {
        state.select = cols || "*";
        state.count = Boolean(opts?.count);
        state.head = Boolean(opts?.head);
        return builder;
      },
      insert(payload: unknown) {
        state.op = "insert";
        state.payload = payload;
        return builder;
      },
      update(payload: unknown) {
        state.op = "update";
        state.payload = payload;
        return builder;
      },
      upsert(payload: unknown) {
        state.op = "upsert";
        state.payload = payload;
        return builder;
      },
      delete() {
        state.op = "delete";
        return builder;
      },
      eq(col: string, val: unknown) {
        state.filters.push({ type: "eq", col, val });
        return builder;
      },
      neq(col: string, val: unknown) {
        state.filters.push({ type: "neq", col, val });
        return builder;
      },
      gt(col: string, val: unknown) {
        state.filters.push({ type: "gt", col, val });
        return builder;
      },
      gte(col: string, val: unknown) {
        state.filters.push({ type: "gte", col, val });
        return builder;
      },
      lt(col: string, val: unknown) {
        state.filters.push({ type: "lt", col, val });
        return builder;
      },
      lte(col: string, val: unknown) {
        state.filters.push({ type: "lte", col, val });
        return builder;
      },
      in(col: string, vals: unknown[]) {
        state.filters.push({ type: "in", col, val: vals });
        return builder;
      },
      is(col: string, val: unknown) {
        state.filters.push({ type: "is", col, val });
        return builder;
      },
      like(col: string, val: string) {
        state.filters.push({ type: "like", col, val });
        return builder;
      },
      ilike(col: string, val: string) {
        state.filters.push({ type: "ilike", col, val });
        return builder;
      },
      not(col: string, op: string, val: unknown) {
        state.filters.push({ type: op.replace(/^\./, ""), col, val, not: true });
        return builder;
      },
      match(values: Record<string, unknown>) {
        for (const [col, val] of Object.entries(values)) state.filters.push({ type: "eq", col, val });
        return builder;
      },
      filter(col: string, op: string, val: unknown) {
        state.filters.push({ type: op.replace(/^\./, ""), col, val });
        return builder;
      },
      or(expr: string) {
        state.or = expr;
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        state.order.push({ col, asc: opts?.ascending !== false });
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
        return run().then(resolve, reject);
      },
    };
    return builder;
  };

  return {
    from,
    rpc: async (name: string, args?: Record<string, unknown>) => {
      const { data, error } = await request(`/rpc/${name}`, { method: "POST", body: JSON.stringify(args ?? {}) });
      return { data, error };
    },
    functions: {
      invoke: async (name: string, opts?: { body?: unknown }) => {
        const { data, error } = await request(`/functions/${name}`, {
          method: "POST",
          body: JSON.stringify(opts?.body ?? {}),
        });
        return { data, error };
      },
    },
    auth: {
      getSession: async () => ({ data: { session: readSession() }, error: null }),
      getUser: async () => ({ data: { user: readSession()?.user ?? null }, error: null }),
      onAuthStateChange: (fn: AuthListener) => {
        listeners.add(fn);
        return { data: { subscription: { unsubscribe() { listeners.delete(fn); } } } };
      },
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        const { data, error } = await request("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        if (error || !data?.access_token) {
          return { data: { user: null, session: null }, error: error ?? { message: "Falha no login" } };
        }
        writeSession(data as Session);
        emit("SIGNED_IN", data as Session);
        return { data: { user: data.user, session: data }, error: null };
      },
      signUp: async ({ email, password, options }: { email: string; password: string; options?: { data?: { nome?: string } } }) => {
        const { data, error } = await request("/auth/signup", {
          method: "POST",
          body: JSON.stringify({ email, password, nome: options?.data?.nome }),
        });
        if (error) return { data: { user: null, session: null }, error };
        writeSession(data as Session);
        emit("SIGNED_IN", data as Session);
        return { data: { user: data.user, session: data }, error: null };
      },
      signOut: async () => {
        writeSession(null);
        emit("SIGNED_OUT", null);
        return { error: null };
      },
      resetPasswordForEmail: async () => ({
        data: {},
        error: { message: "Recuperação de senha ainda não está neste gateway. Peça ao admin um novo convite." },
      }),
      updateUser: async () => ({ data: { user: readSession()?.user ?? null }, error: null }),
    },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() { return this; } }),
    removeChannel: () => undefined,
  };
}
