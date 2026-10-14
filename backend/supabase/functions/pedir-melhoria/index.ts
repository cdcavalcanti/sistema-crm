// "Pedir melhoria" — registra a solicitação e cria a Issue no GitHub marcando
// @claude (que implementa e abre um PR). A notificação no grupo + aprovação é
// feita pela função melhorias-monitor quando o PR fica pronto.
//
// Body: { titulo, descricao }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
  const uc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
  const { data: u, error: uErr } = await uc.auth.getUser(auth.replace("Bearer ", ""));
  if (uErr || !u?.user) return json({ error: "unauthorized" }, 401);

  const ghToken = Deno.env.get("GITHUB_TOKEN");
  const repo = Deno.env.get("GITHUB_REPO") ?? "cdcavalcanti/sistema-crm";
  // Modo "auto" (MELHORIA_AUTO=1): cria Issue @claude (implementação automática via API).
  // Modo manual (padrão, sem API): só registra a solicitação; o grupo é notificado
  // pelo cron e a implementação é feita pela equipe após aprovação.
  const auto = Deno.env.get("MELHORIA_AUTO") === "1";

  const { titulo, descricao } = await req.json().catch(() => ({}));
  if (!titulo || !String(titulo).trim()) return json({ error: "titulo_obrigatorio" }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = crypto.randomUUID().replace(/-/g, "");

  // 1) registra a melhoria
  const { data: mel, error: melErr } = await admin
    .from("melhorias")
    .insert({
      titulo: String(titulo).trim().slice(0, 250),
      descricao: descricao ?? null,
      solicitante_email: u.user.email ?? null,
      status: "solicitada",
      token,
    })
    .select("id")
    .single();
  if (melErr || !mel) return json({ error: "db_erro", detalhe: melErr?.message }, 500);

  // Modo manual: fica em "solicitada". O cron (melhorias-monitor) avisa o grupo
  // com os links de Aprovar/Backlog; a implementação é manual após a aprovação.
  if (!auto) {
    return json({ ok: true, melhoria_id: mel.id, modo: "manual" });
  }

  if (!ghToken) return json({ error: "github_nao_configurado" }, 500);

  // 2) cria a Issue no GitHub marcando @claude (implementa e abre PR)
  const corpo =
    `**Solicitação de melhoria** (via CRM)\n\n` +
    `Solicitante: ${u.user.email ?? "usuário"}\n` +
    `melhoria_id: ${mel.id}\n\n` +
    `${descricao ?? ""}\n\n---\n` +
    `@claude, **implemente de fato** esta solicitação agora — não pare no planejamento. ` +
    `Faça as alterações no código, garanta que o build passa, **faça commit e push da branch ` +
    `e abra um Pull Request** com base na main. Se faltar contexto, faça a melhor implementação ` +
    `possível mesmo assim e descreva objetivamente no PR o que mudou.`;

  try {
    const r = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ghToken}`, Accept: "application/vnd.github+json",
        "User-Agent": "sistema-crm", "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: String(titulo).trim().slice(0, 250), body: corpo, labels: ["melhoria", "claude"] }),
    });
    const gj = await r.json();
    if (!r.ok) {
      await admin.from("melhorias").update({ status: "falhou" }).eq("id", mel.id);
      return json({ error: "github_erro", detalhe: gj?.message ?? "" }, 502);
    }
    await admin.from("melhorias").update({
      status: "preparando", issue_number: gj.number, issue_url: gj.html_url,
    }).eq("id", mel.id);
    return json({ ok: true, melhoria_id: mel.id, numero: gj.number, url: gj.html_url });
  } catch (err) {
    console.error("pedir_melhoria_error", err);
    return json({ error: "internal_error", message: String(err) }, 500);
  }
});
