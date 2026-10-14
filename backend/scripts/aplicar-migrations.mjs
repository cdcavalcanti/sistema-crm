// Aplica migrations novas no Supabase via Management API (sem senha do banco).
// Idempotente: controla o que já foi aplicado numa tabela _migracoes_aplicadas.
// Usado pelo workflow deploy-backend.yml no merge para a main.
//
// Env: SUPABASE_ACCESS_TOKEN (obrigatório), PROJECT_REF (default do Sistema CRM).

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.PROJECT_REF || "YOUR_PROJECT_REF";
const DIR = "supabase/migrations";

if (!TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN ausente.");
  process.exit(1);
}

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "sistema-crm-deploy" },
    body: JSON.stringify({ query }),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${txt.slice(0, 400)}`);
  try { return JSON.parse(txt); } catch { return null; }
}

// 1) tabela de controle
await sql(`create table if not exists public._migracoes_aplicadas (
  arquivo text primary key,
  aplicada_em timestamptz not null default now()
);`);

// 2) já aplicadas
const aplicadas = new Set(
  (await sql(`select arquivo from public._migracoes_aplicadas;`) ?? []).map((r) => r.arquivo),
);

// 3) aplica as novas, em ordem
const arquivos = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
let novas = 0;
for (const arq of arquivos) {
  if (aplicadas.has(arq)) continue;
  const conteudo = await readFile(join(DIR, arq), "utf8");
  if (!conteudo.trim()) { console.log(`(vazia, pulando) ${arq}`); continue; }
  console.log(`> aplicando ${arq}`);
  await sql(conteudo);
  await sql(`insert into public._migracoes_aplicadas (arquivo) values ('${arq.replace(/'/g, "''")}')
             on conflict (arquivo) do nothing;`);
  novas++;
}
console.log(novas ? `✅ ${novas} migration(s) nova(s) aplicada(s).` : "Nenhuma migration nova.");
