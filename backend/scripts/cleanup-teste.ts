import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
loadEnv({ path: ".env.local" });
const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const { error, count } = await s.from("contatos").delete({ count: "exact" }).eq("id", "7ffbed66-fa4b-4953-98fc-90b458225b11");
console.log(error ? `erro: ${error.message}` : `removidos ${count ?? 0} contato(s) de teste (cascateou opp)`);
