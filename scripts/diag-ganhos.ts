import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: ".env.local" });
loadEnv();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function main() {
  // 1) Etapa Ganho
  const { data: etapa } = await supabase
    .from("etapas")
    .select("id")
    .eq("nome", "Ganho")
    .single();

  // 2) Todos os ganhos (banco real) — paginado
  const todos: any[] = [];
  let off = 0;
  while (true) {
    const { data } = await supabase
      .from("oportunidades")
      .select("id, titulo, valor, criado_em, contato:contatos(nome)")
      .eq("etapa_id", etapa!.id)
      .order("criado_em", { ascending: false })
      .range(off, off + 999);
    if (!data?.length) break;
    todos.push(...data);
    if (data.length < 1000) break;
    off += 1000;
  }

  // 3) Soma total
  const totalGeral = todos.reduce((s, o) => s + (Number(o.valor) || 0), 0);
  console.log(`=== ${todos.length} ganhos no banco — soma R$ ${totalGeral.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ===\n`);

  // 4) Simula o que o kanban "via" antes (com truncamento em 1000 da query SEM filtro)
  const totalSemTrunc = await supabase
    .from("oportunidades")
    .select("id", { count: "exact", head: true });
  const totalOpps = totalSemTrunc.count ?? 0;
  console.log(`Total de opps no banco: ${totalOpps}`);
  console.log(`Truncamento PostgREST: 1000 mais recentes → perdeu ${totalOpps - 1000} mais antigas\n`);

  // Carrega os primeiros 1000 (como o kanban antigo fazia)
  const { data: top1000 } = await supabase
    .from("oportunidades")
    .select("id, etapa_id")
    .order("criado_em", { ascending: false })
    .range(0, 999);
  const ganhosNoTop1000 = new Set(
    (top1000 ?? []).filter((o: any) => o.etapa_id === etapa!.id).map((o: any) => o.id),
  );
  const totalNoTop1000 = todos
    .filter((o) => ganhosNoTop1000.has(o.id))
    .reduce((s, o) => s + (Number(o.valor) || 0), 0);

  console.log(`Kanban antigo (top 1000): ${ganhosNoTop1000.size} ganhos, R$ ${totalNoTop1000.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
  console.log(`Diferença (faltando no kanban antigo): R$ ${(totalGeral - totalNoTop1000).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`);

  // 5) Mostra as 8 ganhos que estavam "fora" do top 1000 (os de 2024)
  const faltavam = todos.filter((o) => !ganhosNoTop1000.has(o.id));
  console.log(`=== As ${faltavam.length} ganhos que NÃO apareciam no kanban antigo (mais antigas) ===`);
  faltavam.forEach((o: any) => {
    console.log(
      `  ${o.criado_em.slice(0, 10)}  R$ ${(Number(o.valor) || 0).toFixed(2).padStart(10)}  ${o.titulo ?? "—"}  (${o.contato?.nome ?? "—"})`,
    );
  });
  const somaFaltava = faltavam.reduce((s, o) => s + (Number(o.valor) || 0), 0);
  console.log(`\nSoma das que faltavam: R$ ${somaFaltava.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
