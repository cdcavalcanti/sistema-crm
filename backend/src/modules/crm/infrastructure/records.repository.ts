import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../core/database/prisma.service";
import { camelizeKeys, serializeRow, toCamel } from "../../../core/crypto/case";
import { isKnownTable, RELATIONS, TABLE_REGISTRY } from "../domain/table-registry";

export type FilterOp = {
  type: string;
  col: string;
  val?: unknown;
  not?: boolean;
};

export type QueryInput = {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "upsert";
  select?: string;
  filters?: FilterOp[];
  or?: string;
  payload?: unknown;
  order?: Array<{ col: string; asc?: boolean }>;
  limit?: number;
  range?: [number, number];
  single?: boolean;
  maybeSingle?: boolean;
  count?: boolean;
  head?: boolean;
  extraWhere?: Record<string, unknown>;
};

type Delegate = {
  findMany: (args: unknown) => Promise<Record<string, unknown>[]>;
  findUnique?: (args: unknown) => Promise<Record<string, unknown> | null>;
  create: (args: unknown) => Promise<Record<string, unknown>>;
  createMany?: (args: unknown) => Promise<unknown>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
  deleteMany: (args: unknown) => Promise<{ count: number }>;
  upsert?: (args: unknown) => Promise<Record<string, unknown>>;
  count: (args: unknown) => Promise<number>;
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

function parseSelect(select: string): { star: boolean; cols: string[]; embeds: Array<{ alias: string; table: string; cols: string }> } {
  if (!select || select === "*") return { star: true, cols: [], embeds: [] };
  const cols: string[] = [];
  const embeds: Array<{ alias: string; table: string; cols: string }> = [];
  let star = false;
  for (const part of splitTop(select)) {
    if (part === "*") {
      star = true;
      continue;
    }
    const m = part.match(/^(\w+)(?::(\w+))?(!inner)?\((.*)\)$/);
    if (m) {
      embeds.push({ alias: m[1], table: m[2] ?? m[1], cols: m[4] ?? "*" });
      continue;
    }
    cols.push(part);
  }
  return { star, cols, embeds };
}

function parseOrAtom(atom: string): Record<string, unknown> {
  const inMatch = atom.match(/^([\w.]+)\.in\.\((.*)\)$/);
  if (inMatch) {
    const vals = inMatch[2].split(",").map((x) => x.trim().replace(/^["']|["']$/g, ""));
    return opToPrisma(toCamel(inMatch[1]), "in", vals);
  }
  const m = atom.match(/^([\w.]+)\.(eq|neq|gt|gte|lt|lte|ilike|like|is)\.(.*)$/);
  if (!m) return {};
  let val: unknown = m[3];
  if (val === "null") val = null;
  else if (val === "true") val = true;
  else if (val === "false") val = false;
  return opToPrisma(toCamel(m[1]), m[2], val);
}

function prismaWhere(filters: FilterOp[] | undefined, extra?: Record<string, unknown>, orExpr?: string): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];
  for (const f of filters ?? []) {
    const col = toCamel(f.col);
    const clause = opToPrisma(col, f.type, f.val);
    and.push(f.not ? { NOT: clause } : clause);
  }
  if (orExpr) {
    const atoms = splitTop(orExpr).map(parseOrAtom).filter((x) => Object.keys(x).length);
    if (atoms.length) and.push({ OR: atoms });
  }
  if (extra) and.push(extra);
  if (!and.length) return {};
  if (and.length === 1) return and[0];
  return { AND: and };
}

function opToPrisma(col: string, type: string, val: unknown): Record<string, unknown> {
  switch (type) {
    case "eq":
      return { [col]: val };
    case "neq":
      return { [col]: { not: val } };
    case "gt":
      return { [col]: { gt: coerce(val) } };
    case "gte":
      return { [col]: { gte: coerce(val) } };
    case "lt":
      return { [col]: { lt: coerce(val) } };
    case "lte":
      return { [col]: { lte: coerce(val) } };
    case "in":
      return { [col]: { in: Array.isArray(val) ? val : [val] } };
    case "is":
      if (val === null) return { [col]: null };
      return { [col]: val };
    case "like":
    case "ilike": {
      const raw = String(val ?? "").replace(/%/g, "");
      return { [col]: { contains: raw, mode: "insensitive" } };
    }
    default:
      return { [col]: val };
  }
}

function coerce(val: unknown): unknown {
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val)) {
    const d = new Date(val);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return val;
}

@Injectable()
export class RecordsRepository {
  constructor(private readonly prisma: PrismaService) {}

  delegate(table: string): Delegate {
    if (!isKnownTable(table)) {
      throw new BadRequestException(`unknown_table:${table}`);
    }
    const name = TABLE_REGISTRY[table].delegate;
    const d = (this.prisma as unknown as Record<string, Delegate | undefined>)[name];
    if (!d) throw new BadRequestException(`unmapped_table:${table}`);
    return d;
  }

  async execute(input: QueryInput): Promise<{ data: unknown; count: number | null; error: string | null }> {
    const table = input.table;
    const db = this.delegate(table);
    const where = prismaWhere(input.filters, input.extraWhere, input.or);

    try {
      if (input.op === "insert") {
        const rows = Array.isArray(input.payload) ? input.payload : [input.payload];
        const created: unknown[] = [];
        for (const row of rows) {
          const data = camelizeKeys(row) as Record<string, unknown>;
          created.push(await db.create({ data }));
        }
        const out = created.map((r) => serializeRow(r));
        return { data: Array.isArray(input.payload) ? out : out[0], count: out.length, error: null };
      }

      if (input.op === "update") {
        const data = camelizeKeys(input.payload) as Record<string, unknown>;
        const result = await db.updateMany({ where, data });
        const refreshed = await db.findMany({ where, take: 200 });
        const out = refreshed.map((r) => serializeRow(r));
        return { data: out.length === 1 ? out[0] : out, count: result.count, error: null };
      }

      if (input.op === "delete") {
        const result = await db.deleteMany({ where });
        return { data: null, count: result.count, error: null };
      }

      if (input.op === "upsert") {
        const rows = Array.isArray(input.payload) ? input.payload : [input.payload];
        const out: unknown[] = [];
        for (const row of rows) {
          const data = camelizeKeys(row) as Record<string, unknown>;
          const id = data.id as string | undefined;
          if (id && db.upsert) {
            out.push(await db.upsert({ where: { id }, create: data, update: data }));
          } else {
            out.push(await db.create({ data }));
          }
        }
        return { data: serializeRow(Array.isArray(input.payload) ? out : out[0]), count: out.length, error: null };
      }

      const orderBy = (input.order ?? []).map((o) => ({ [toCamel(o.col)]: o.asc === false ? "desc" : "asc" }));
      let skip: number | undefined;
      let take = input.limit;
      if (input.range) {
        skip = input.range[0];
        take = input.range[1] - input.range[0] + 1;
      }

      const parsed = parseSelect(input.select ?? "*");
      const count = input.count ? await db.count({ where }) : null;
      if (input.head) {
        return { data: null, count, error: null };
      }

      const rows = await db.findMany({
        where,
        orderBy: orderBy.length ? orderBy : undefined,
        skip,
        take,
      });
      let projected = rows.map((r) => serializeRow(r) as Record<string, unknown>);
      if (parsed.embeds.length) {
        projected = await this.embed(table, projected, parsed.embeds);
      }
      if (!parsed.star && parsed.cols.length) {
        const keep = new Set([...parsed.cols, ...parsed.embeds.map((e) => e.alias), "id"]);
        projected = projected.map((row) => {
          const slim: Record<string, unknown> = {};
          for (const k of keep) if (k in row) slim[k] = row[k];
          return slim;
        });
      }

      if (input.single) {
        if (projected.length !== 1) {
          return { data: null, count, error: projected.length === 0 ? "PGRST116" : "PGRST116" };
        }
        return { data: projected[0], count, error: null };
      }
      if (input.maybeSingle) {
        return { data: projected[0] ?? null, count, error: null };
      }
      return { data: projected, count, error: null };
    } catch (err) {
      const msg = err instanceof Prisma.PrismaClientKnownRequestError ? err.message : err instanceof Error ? err.message : "query_failed";
      return { data: null, count: null, error: msg };
    }
  }

  private async embed(
    table: string,
    rows: Record<string, unknown>[],
    embeds: Array<{ alias: string; table: string; cols: string }>,
  ): Promise<Record<string, unknown>[]> {
    const rels = RELATIONS[table] ?? {};
    for (const emb of embeds) {
      const rel = rels[emb.alias] ?? rels[emb.table];
      if (!rel) continue;
      const ids = [...new Set(rows.map((r) => r[rel.local]).filter(Boolean))] as string[];
      if (!ids.length && !rel.many) {
        for (const row of rows) row[emb.alias] = null;
        continue;
      }
      const related = await this.execute({
        table: rel.table,
        op: "select",
        select: emb.cols || "*",
        filters: [{ type: "in", col: rel.foreign, val: rel.many ? rows.map((r) => r[rel.local]) : ids }],
      });
      const list = Array.isArray(related.data) ? (related.data as Record<string, unknown>[]) : [];
      const byFk = new Map<string, Record<string, unknown>[]>();
      for (const item of list) {
        const key = String(item[rel.foreign] ?? item.id);
        const bucket = byFk.get(key) ?? [];
        bucket.push(item);
        byFk.set(key, bucket);
      }
      for (const row of rows) {
        const key = String(row[rel.local] ?? "");
        const found = byFk.get(key) ?? [];
        row[emb.alias] = rel.many ? found : (found[0] ?? null);
      }
    }
    return rows;
  }
}
