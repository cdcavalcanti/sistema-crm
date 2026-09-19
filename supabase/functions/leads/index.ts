// Webhook público de leads do Sistema CRM.
//
// Payload mínimo:
//   { "origem": "qualquer texto", "nome": "Responsável" }
//
// Campos opcionais que controlam o destino:
//   etapa             → nome da etapa do pipeline (ex: "Visita Agendada",
//                       "Atendimento"). Case/acento-insensitive. Default: "Lead novo".
//   responsavel       → dono da oportunidade (Comercial/CS/SDR/...). Default: null.
//   data_visita       → ISO 8601 ou BR "dd/mm/yyyy às hh:mm".
//   google_event_id   → quando presente com data_visita, cacheia o evento.
//
// Campos do contato (todos opcionais exceto nome):
//   email, telefone, nome_estabelecimento, anos_operacao, segmento
//
// Quaisquer outros campos no payload (utm_*, campaign_*, mensagem, etc.)
// são preservados em metadados da oportunidade.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Schema único — aceita qualquer payload com nome+origem.
// .passthrough() permite chaves extras (utm_*, campaign_*, mensagem, etc.)
// que são preservadas nos metadados da oportunidade.
const payloadSchema = z
  .object({
    origem: z.string().min(1).max(200),
    etapa: z.string().min(1).max(100).optional().nullable(),
    nome: z.string().min(1).max(200),
    email: z.string().email().optional().nullable(),
    telefone: z.string().optional().nullable(),
    nome_estabelecimento: z.string().max(200).optional().nullable(),
    anos_operacao: z.coerce.number().int().min(0).max(100).optional().nullable(),
    segmento: z.string().optional().nullable(),
    // aliases legados (formulários antigos)
    nome_aluno: z.string().max(200).optional().nullable(),
    idade_aluno: z.coerce.number().int().min(0).max(100).optional().nullable(),
    serie_interesse: z.string().optional().nullable(),
    responsavel: z.string().optional().nullable(),
    data_visita: z
      .string()
      .transform((s: string, ctx: z.RefinementCtx) => {
        if (!s) return null;
        const iso = parseDataVisita(s);
        if (!iso) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "data_visita inválida (use ISO 8601 ou 'dd/mm/yyyy às hh:mm')",
          });
          return z.NEVER;
        }
        return iso;
      })
      .optional()
      .nullable(),
    google_event_id: z.string().optional().nullable(),
    observacoes: z.string().optional().nullable(),
  })
  .passthrough();

type Payload = z.infer<typeof payloadSchema>;

// Campos que vão em colunas dedicadas (não devem ir em metadados)
const CAMPOS_COLUNA = new Set([
  "origem",
  "etapa",
  "nome",
  "email",
  "telefone",
  "nome_estabelecimento",
  "anos_operacao",
  "segmento",
  "responsavel",
  "data_visita",
  "google_event_id",
  "observacoes",
]);

function metadadosDe(data: Payload): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (CAMPOS_COLUNA.has(k)) continue;
    if (v == null || v === "") continue;
    out[k] = v;
  }
  return out;
}

function normalizeEmail(email?: string | null) {
  if (!email) return null;
  return email.toLowerCase().trim();
}

function normalizeEtapaName(s: string) {
  return s.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

// Aceita data_visita em formato ISO 8601 ou BR "dd/mm/yyyy às hh:mm".
// Variações também aceitas: "dd/mm/yyyy hh:mm", "dd/mm/yyyy - hh:mm".
// Retorna ISO 8601 UTC; assume timezone America/Sao_Paulo (-03:00) quando
// recebe formato BR sem timezone.
function parseDataVisita(input: string): string | null {
  const s = input.trim();
  if (!s) return null;

  // Padrão BR: "29/05/2026 às 17:00" / "29/05/2026 17:00" / "29/05/2026 - 17:00"
  const brMatch = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(?:às|-|–)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/i,
  );
  if (brMatch) {
    const [, dia, mes, ano, hora, min, seg] = brMatch;
    const iso =
      `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}` +
      `T${hora.padStart(2, "0")}:${min}:${(seg ?? "00").padStart(2, "0")}-03:00`;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
    return null;
  }

  // Fallback: tenta parsear como ISO 8601 / RFC 2822 direto
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const raw = await req.json().catch(() => null);
    const parsed = payloadSchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "invalid_payload", details: parsed.error.flatten() }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const data = parsed.data;
    const email = normalizeEmail(data.email);
    const nomeEstab = data.nome_estabelecimento ?? data.nome_aluno ?? null;
    const anosOp = data.anos_operacao ?? data.idade_aluno ?? null;
    const segmento = data.segmento ?? data.serie_interesse ?? null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // -------- Upsert contato --------
    let contatoId: string;
    let contatoCriado = false;

    const camposContato = {
      nome: data.nome,
      telefone: data.telefone ?? null,
      nome_estabelecimento: nomeEstab,
      anos_operacao: anosOp,
      segmento,
    };

    if (email) {
      const { data: existing } = await supabase
        .from("contatos")
        .select("id, nome, telefone, nome_estabelecimento, anos_operacao, segmento")
        .eq("email", email)
        .maybeSingle();

      if (existing) {
        contatoId = existing.id;
        await supabase
          .from("contatos")
          .update({
            nome: camposContato.nome || existing.nome,
            telefone: camposContato.telefone ?? existing.telefone,
            nome_estabelecimento: camposContato.nome_estabelecimento ?? existing.nome_estabelecimento,
            anos_operacao: camposContato.anos_operacao ?? existing.anos_operacao,
            segmento: camposContato.segmento ?? existing.segmento,
          })
          .eq("id", contatoId);
      } else {
        const { data: novo, error } = await supabase
          .from("contatos")
          .insert({ ...camposContato, email })
          .select("id")
          .single();
        if (error || !novo) throw error ?? new Error("contato_insert_failed");
        contatoId = novo.id;
        contatoCriado = true;
      }
    } else {
      // Sem email: cria sempre um novo contato
      const { data: novo, error } = await supabase
        .from("contatos")
        .insert(camposContato)
        .select("id")
        .single();
      if (error || !novo) throw error ?? new Error("contato_insert_failed");
      contatoId = novo.id;
      contatoCriado = true;
    }

    // -------- Resolver etapa --------
    // Caller pode mandar `etapa: "Visita Agendada"` (case/acento-insensitive).
    // Default: "Lead novo". Se nada bater, cai na primeira etapa por ordem.
    const etapaPedida = (data.etapa ?? "Lead novo").trim();
    const { data: etapasAll } = await supabase
      .from("etapas")
      .select("id, nome, ordem")
      .order("ordem", { ascending: true });
    const etapasList = (etapasAll ?? []) as Array<{ id: string; nome: string; ordem: number }>;
    const alvo = normalizeEtapaName(etapaPedida);
    const etapaMatch = etapasList.find((e) => normalizeEtapaName(e.nome) === alvo);
    const etapa = etapaMatch ?? etapasList[0] ?? null;
    const etapaNome = etapa?.nome ?? etapaPedida;

    // -------- Construir oportunidade --------
    const dataVisita = data.data_visita ?? null;
    const googleEventId = data.google_event_id ?? null;
    const observacoes = data.observacoes ?? null;
    const metadados = metadadosDe(data);
    const titulo = data.nome;

    // -------- Criar oportunidade --------
    const { data: oportunidade, error: oppErr } = await supabase
      .from("oportunidades")
      .insert({
        contato_id: contatoId,
        titulo,
        interesse: segmento ?? null,
        nome_estabelecimento: nomeEstab,
        anos_operacao: anosOp,
        descricao: observacoes,
        origem: data.origem,
        etapa_id: etapa?.id ?? null,
        valor: null,
        data_visita: dataVisita,
        google_event_id: googleEventId,
        observacoes,
        responsavel: data.responsavel ?? null,
        metadados,
      })
      .select("id")
      .single();
    if (oppErr || !oportunidade) throw oppErr ?? new Error("oportunidade_insert_failed");

    // Se vier data_visita + google_event_id, cacheia o evento localmente.
    if (dataVisita && googleEventId) {
      const fim = new Date(new Date(dataVisita).getTime() + 60 * 60 * 1000).toISOString();
      await supabase.from("calendario_eventos").upsert(
        {
          google_event_id: googleEventId,
          titulo: `Visita: ${data.nome}`,
          descricao: observacoes,
          inicio: dataVisita,
          fim,
          contato_id: contatoId,
          oportunidade_id: oportunidade.id,
          sincronizado_em: new Date().toISOString(),
        },
        { onConflict: "google_event_id" },
      );
    }

    // Log explícito
    await supabase.from("audit_logs").insert({
      user_id: null,
      actor_email: `webhook:${data.origem}`,
      acao: "lead.recebido",
      entidade: "oportunidades",
      entidade_id: oportunidade.id,
      detalhes: { origem: data.origem, email, contato_criado: contatoCriado, etapa: etapaNome },
    });

    return new Response(
      JSON.stringify({
        ok: true,
        contato_id: contatoId,
        oportunidade_id: oportunidade.id,
        contato_criado: contatoCriado,
        etapa: etapaNome,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("leads_webhook_error", err);
    return new Response(
      JSON.stringify({ error: "internal_error", message: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
