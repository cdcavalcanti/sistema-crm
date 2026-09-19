import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
loadEnv({ path: ".env.local" });

const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

const { data: profiles } = await s
  .from("profiles")
  .select("user_id, nome, email, criado_em")
  .order("criado_em", { ascending: true });
const { data: roles } = await s.from("user_roles").select("user_id, role, criado_em");

console.log(`=== ${profiles?.length ?? 0} profiles ===`);
for (const p of (profiles as any[]) ?? []) {
  const userRoles = (roles as any[])?.filter((r) => r.user_id === p.user_id).map((r) => r.role) ?? [];
  console.log(`  ${p.criado_em?.slice(0, 19)}  ${p.email}  roles=[${userRoles.join(", ") || "—"}]`);
}
