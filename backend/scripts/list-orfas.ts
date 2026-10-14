import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });
loadEnv();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const { data } = await supabase
  .from("tarefas")
  .select("id, titulo, descricao, status, due_date, criado_em, metadados")
  .is("contato_id", null)
  .is("oportunidade_id", null)
  .order("criado_em", { ascending: false });

console.log(`\n=== ${data?.length ?? 0} tarefas órfãs (sem contato nem oportunidade) ===\n`);
for (const t of (data as any[]) ?? []) {
  console.log(`• ${t.titulo}`);
  console.log(`  status=${t.status}  due=${t.due_date?.slice(0, 10) ?? "—"}  criada=${t.criado_em?.slice(0, 10)}`);
  if (t.descricao) console.log(`  notas: ${t.descricao.slice(0, 200).replace(/\n/g, " ")}`);
  console.log();
}
