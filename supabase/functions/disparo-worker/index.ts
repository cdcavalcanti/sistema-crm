// Cron: processa campanhas em status=enviando (1 destinatário por campanha por run).
// Auth: ?secret=AGENDA_SYNC_SECRET (mesmo padrão de agenda-sync / melhorias-monitor).
//
// A UI também chama disparos?action=tick — este worker é o fallback se a aba fechar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const digitos = (s: string) => (s ?? "").replace(/\D/g, "");
const placeholderRe = () => /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

type RawTemplate = {
  name?: string;
  language?: string;
  status?: string;
  category?: string;
  components?: Array<{ type?: string; format?: string; text?: string }>;
};
type Parsed = {
  name: string;
  language: string;
  category: string | null;
  body_text: string;
  header_text: string | null;
  footer_text: string | null;
  variables: string[];
};

function sanitizeParam(value: string): string {
  return value.replace(/[<>"']/g, "").replace(/\s+/g, " ").trim().slice(0, 1000);
}

function parseTemplate(raw: RawTemplate): Parsed | null {
  const name = raw?.name;
  const language = raw?.language;
  if (!name || !language) return null;
  const components = raw.components ?? [];
  const body = components.find((c) => (c.type ?? "").toUpperCase() === "BODY");
  const header = components.find((c) => (c.type ?? "").toUpperCase() === "HEADER");
  const footer = components.find((c) => (c.type ?? "").toUpperCase() === "FOOTER");
  const body_text = body?.text ?? "";
  if (!body_text.trim()) return null;
  const variables: string[] = [];
  for (const m of body_text.matchAll(placeholderRe())) {
    if (!variables.includes(m[1])) variables.push(m[1]);
  }
  return {
    name,
    language,
    category: raw.category ?? null,
    body_text,
    header_text: header?.text ?? null,
    footer_text: footer?.text ?? null,
    variables,
  };
}

function renderTemplate(t: Parsed, params: Record<string, string>): string {
  const body = t.body_text.replace(placeholderRe(), (_m, key: string) => {
    const v = params[key];
    return v && v.trim() ? v : `{{${key}}}`;
  });
  return [t.header_text, body, t.footer_text]
    .filter((p) => p && p.trim().length > 0)
    .join("\n\n");
}

async function fetchInboxes(baseUrl: string, token: string, accountId: number) {
  const resp = await fetch(
    `${baseUrl.replace(/\/$/, "")}/api/v1/accounts/${accountId}/inboxes`,
    { headers: { api_access_token: token } },
  );
  if (!resp.ok) throw new Error(`inboxes_${resp.status}`);
  const payload = await resp.json();
  return (payload?.payload ?? []) as Array<{
    id?: number;
    channel_type?: string;
    message_templates?: RawTemplate[];
  }>;
}

async function garantirConversa(
  baseUrl: string,
  token: string,
  accountId: number,
  inboxId: number,
  telefone: string,
  nome: string,
): Promise<number> {
  const base = baseUrl.replace(/\/$/, "");
  const cabecalho = { api_access_token: token };
  const cabecalhoJson = { ...cabecalho, "Content-Type": "application/json" };
  const fone = digitos(telefone);
  const e164 = `+${fone}`;

  let contactId: number | null = null;
  const busca = await fetch(
    `${base}/api/v1/accounts/${accountId}/contacts/search?q=${encodeURIComponent(fone)}`,
    { headers: cabecalho },
  );
  if (busca.ok) {
    const payload = await busca.json();
    const lista = (payload?.payload ?? []) as Array<{ id?: number; phone_number?: string }>;
    const exato = lista.find((c) => digitos(c.phone_number ?? "") === fone);
    contactId = (exato ?? lista[0])?.id ?? null;
  }
  if (!contactId) {
    const criado = await fetch(`${base}/api/v1/accounts/${accountId}/contacts`, {
      method: "POST",
      headers: cabecalhoJson,
      body: JSON.stringify({ inbox_id: inboxId, name: nome || e164, phone_number: e164 }),
    });
    if (!criado.ok) throw new Error(`contact_${criado.status}`);
    const payload = await criado.json();
    contactId = payload?.payload?.contact?.id ?? payload?.payload?.id ?? null;
    if (!contactId) throw new Error("contact_create_failed");
  }

  const conversas = await fetch(
    `${base}/api/v1/accounts/${accountId}/contacts/${contactId}/conversations`,
    { headers: cabecalho },
  );
  if (conversas.ok) {
    const payload = await conversas.json();
    const lista = (payload?.payload ?? []) as Array<{ id?: number; inbox_id?: number; status?: string }>;
    const aberta = lista.find(
      (c) => typeof c.id === "number" && c.inbox_id === inboxId && (c.status ?? "") !== "resolved",
    );
    if (aberta?.id) return aberta.id;
  }

  let sourceId: string | null = null;
  const ci = await fetch(
    `${base}/api/v1/accounts/${accountId}/contacts/${contactId}/contactable_inboxes`,
    { headers: cabecalho },
  );
  if (ci.ok) {
    const payload = await ci.json();
    const lista = (payload?.payload ?? []) as Array<{ source_id?: string; inbox?: { id?: number } }>;
    sourceId = lista.find((i) => i.inbox?.id === inboxId)?.source_id ?? null;
  }
  if (!sourceId) sourceId = fone;

  const criada = await fetch(`${base}/api/v1/accounts/${accountId}/conversations`, {
    method: "POST",
    headers: cabecalhoJson,
    body: JSON.stringify({ source_id: sourceId, inbox_id: inboxId, contact_id: contactId }),
  });
  if (!criada.ok) throw new Error(`conversation_${criada.status}`);
  const payload = await criada.json();
  const id = payload?.id ?? payload?.payload?.id;
  if (!id) throw new Error("conversation_create_failed");
  return Number(id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") ??
    req.headers.get("x-cron-secret") ??
    "";
  const expected = Deno.env.get("AGENDA_SYNC_SECRET") ?? "";
  if (!expected || secret !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, service);

  const chatwootUrl = (Deno.env.get("CHATWOOT_URL") ?? "").replace(/\/$/, "");
  const chatwootToken = Deno.env.get("CHATWOOT_TOKEN") ?? "";
  const accountId = Number(Deno.env.get("CHATWOOT_ACCOUNT_ID") ?? "");
  if (!chatwootUrl || !chatwootToken || !Number.isFinite(accountId)) {
    return json({ error: "chatwoot_not_configured" }, 500);
  }

  const { data: campanhas } = await admin
    .from("disparos")
    .select("*")
    .eq("status", "enviando")
    .limit(20);

  const resultados: Array<{ id: string; resultado: string }> = [];

  for (const disparo of campanhas ?? []) {
    const minS = Number(disparo.intervalo_min_s ?? 5);
    const { data: ultimo } = await admin
      .from("disparo_destinatarios")
      .select("enviado_em")
      .eq("disparo_id", disparo.id)
      .not("enviado_em", "is", null)
      .order("enviado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ultimo?.enviado_em) {
      const elapsed = (Date.now() - new Date(ultimo.enviado_em).getTime()) / 1000;
      if (elapsed < minS) {
        resultados.push({ id: disparo.id, resultado: "intervalo" });
        continue;
      }
    }

    const { data: candidatos } = await admin
      .from("disparo_destinatarios")
      .select("id, nome, telefone, variaveis")
      .eq("disparo_id", disparo.id)
      .eq("status", "pendente")
      .order("id")
      .limit(1);
    const linha = candidatos?.[0];
    if (!linha) {
      await admin
        .from("disparos")
        .update({ status: "concluido", concluido_em: new Date().toISOString() })
        .eq("id", disparo.id);
      resultados.push({ id: disparo.id, resultado: "concluido" });
      continue;
    }

    await admin
      .from("disparo_destinatarios")
      .update({ status: "enviando", reservado_em: new Date().toISOString() })
      .eq("id", linha.id)
      .eq("status", "pendente");

    try {
      const inboxes = await fetchInboxes(chatwootUrl, chatwootToken, accountId);
      const inbox = inboxes.find((i) => i.id === Number(disparo.inbox_id)) ??
        inboxes.find((i) => (i.channel_type ?? "").toLowerCase().includes("whatsapp"));
      const template =
        (inbox?.message_templates ?? [])
          .filter((t) => (t.status ?? "").toLowerCase() === "approved")
          .map(parseTemplate)
          .filter((t): t is Parsed => t !== null)
          .find(
            (t) =>
              t.name === disparo.template &&
              t.language.toLowerCase() === String(disparo.template_idioma).toLowerCase(),
          ) ?? null;

      if (!template) throw new Error("template_indisponivel");

      const valores = Array.isArray(linha.variaveis)
        ? (linha.variaveis as string[]).map(String)
        : [];
      const processed: Record<string, string> = {};
      template.variables.forEach((chave, i) => {
        processed[chave] = sanitizeParam(valores[i] ?? "");
      });
      const conteudo = renderTemplate(template, processed);
      const templateParams = {
        name: template.name,
        language: template.language,
        ...(template.category ? { category: template.category } : {}),
        ...(template.variables.length ? { processed_params: processed } : {}),
      };

      const conversationId = await garantirConversa(
        chatwootUrl,
        chatwootToken,
        accountId,
        Number(disparo.inbox_id),
        linha.telefone,
        linha.nome,
      );

      const resp = await fetch(
        `${chatwootUrl}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            api_access_token: chatwootToken,
          },
          body: JSON.stringify({
            content: conteudo,
            message_type: "outgoing",
            private: false,
            template_params: templateParams,
          }),
        },
      );
      const text = await resp.text();
      if (!resp.ok) throw new Error(text.slice(0, 300) || `HTTP ${resp.status}`);
      let msgId: number | null = null;
      try {
        const j = JSON.parse(text);
        msgId = typeof j.id === "number" ? j.id : null;
      } catch { /* ignore */ }

      await admin
        .from("disparo_destinatarios")
        .update({
          status: "enviado",
          conversa_id: conversationId,
          externo_id: msgId != null ? String(msgId) : null,
          enviado_em: new Date().toISOString(),
          erro: null,
        })
        .eq("id", linha.id);
      resultados.push({ id: disparo.id, resultado: "enviado" });
    } catch (err) {
      await admin
        .from("disparo_destinatarios")
        .update({
          status: "falhou",
          erro: (err instanceof Error ? err.message : String(err)).slice(0, 300),
        })
        .eq("id", linha.id);
      resultados.push({ id: disparo.id, resultado: "falhou" });
    }

    const { count: pendentes } = await admin
      .from("disparo_destinatarios")
      .select("id", { count: "exact", head: true })
      .eq("disparo_id", disparo.id)
      .in("status", ["pendente", "enviando"]);
    if (!pendentes) {
      await admin
        .from("disparos")
        .update({ status: "concluido", concluido_em: new Date().toISOString() })
        .eq("id", disparo.id);
    }
  }

  return json({ ok: true, processados: resultados.length, resultados });
});
