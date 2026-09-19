import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
loadEnv({ path: ".env.local" });

const TARGET_EMAIL = "carlosedlima4@gmail.com";

const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

// Lista usuários do auth
const { data: users, error } = await s.auth.admin.listUsers();
if (error) throw error;
console.log(`auth.users existentes: ${users.users.length}`);
for (const u of users.users) {
  console.log(`  ${u.email}  id=${u.id}  criado=${u.created_at}`);
}

const target = users.users.find((u) => u.email === TARGET_EMAIL);
if (!target) {
  console.log(`\n❌ Usuário ${TARGET_EMAIL} não encontrado no auth`);
  process.exit(1);
}

// Cria profile se faltar
const { data: existingProfile } = await s
  .from("profiles")
  .select("id")
  .eq("user_id", target.id)
  .maybeSingle();
if (!existingProfile) {
  const { error: pErr } = await s.from("profiles").insert({
    user_id: target.id,
    email: target.email,
    nome:
      (target.user_metadata?.nome as string) ??
      (target.user_metadata?.name as string) ??
      target.email?.split("@")[0],
  });
  if (pErr) throw pErr;
  console.log(`\n✓ Profile criado para ${target.email}`);
}

// Garante role super_admin
const { data: existingRoles } = await s
  .from("user_roles")
  .select("role")
  .eq("user_id", target.id);
const tem = (existingRoles as any[])?.map((r) => r.role) ?? [];
if (tem.includes("super_admin")) {
  console.log(`\n✓ ${target.email} já é super_admin`);
} else {
  // Limpa outros papéis antes
  await s.from("user_roles").delete().eq("user_id", target.id);
  const { error: rErr } = await s
    .from("user_roles")
    .insert({ user_id: target.id, role: "super_admin" });
  if (rErr) throw rErr;
  console.log(`\n✓ Papel super_admin atribuído a ${target.email}`);
}
