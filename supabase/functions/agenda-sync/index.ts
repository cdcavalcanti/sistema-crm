// Sincronização da Agenda (Google Calendar → CRM).
// Substitui o fluxo n8n de calendário. Roda por cron (1 min):
// lê o calendário de agendamentos, e para cada visita NOVA (ainda sem
// oportunidade vinculada pelo google_event_id) cria a oportunidade em
// "Visita Agendada" no Supabase do CRM. Sem WhatsApp por enquanto.
//
// Proteção: ?secret= conferido contra AGENDA_SYNC_SECRET.
// Diagnóstico: ?dryRun=1 lista os eventos e o parsing SEM criar nada.
//
// Secrets: GOOGLE_CLIENT_ID/SECRET (já existem), AGENDA_SYNC_SECRET,
//          AGENDA_CALENDAR_ID (default agenda@empresa.example.com).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { criarLead, type LeadInput } from "../_shared/criarLead.ts";
import { avisarSecretaria } from "../_shared/avisarSecretaria.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const CAL = Deno.env.get("AGENDA_CALENDAR_ID") ?? "agenda@empresa.example.com";

// ---- Google token (mesma lógica do google-calendar-sync) ----
async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`google_refresh_failed: ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAccessToken(admin: any): Promise<string> {
  const { data: cred } = await admin.from("google_credentials").select("*").eq("id", 1).maybeSingle();
  if (!cred) throw new Error("google_not_connected");
  const exp = cred.access_token_expires_at ? new Date(cred.access_token_expires_at) : null;
  if (exp && exp.getTime() - Date.now() > 60_000 && cred.access_token) return cred.access_token;
  const r = await refreshAccessToken(cred.refresh_token);
  await admin.from("google_credentials").update({
    access_token: r.access_token,
    access_token_expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString(),
  }).eq("id", 1);
  return r.access_token;
}

// ---- Parsing do evento (espelha o extractData do n8n) ----
function limparNome(summary: string): string {
  return (summary ?? "")
    .replace(/ e Agendamento Visita/gi, "")
    .replace(/Sistema CRM/gi, "")
    .replace(/[()]/g, "")
    .trim() || "Agendamento";
}

function normalizarTelefone(raw: string | null): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (!d.startsWith("55")) d = "55" + d;
  return d;
}

// Anos de operação dentro do permitido (0–100). Valores fora viram null —
// senão a constraint contatos_anos_operacao_check derruba o sync.
function parseIdadeSegura(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw.replace(/\D/g, ""));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
const stripTags = (s: string) => s.replace(/<[^>]+>/g, "").trim();
const ehEmail = (s: string) => /^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(s.trim());

// Descrição do Google Appointment: blocos "<b>Rótulo</b>\n valor(es)" separados por <br>.
// Retorna { "rotulo normalizado": [linhas de valor] }.
function blocosDaDescricao(descRaw: string): Record<string, string[]> {
  const desc = (descRaw ?? "").replace(/<br\s*\/?>/gi, "\n");
  const blocos: Record<string, string[]> = {};
  const re = /<b>(.*?)<\/b>([\s\S]*?)(?=<b>|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(desc)) !== null) {
    const label = norm(stripTags(m[1]));
    const linhas = stripTags(m[2])
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (label) blocos[label] = linhas;
  }
  // Formato Calendly (texto puro): "Rótulo: valor" por linha.
  for (const linha of stripTags(desc).split(/\r?\n/)) {
    const mm = /^([^:]{2,40}):\s*(.+)$/.exec(linha.trim());
    if (mm) {
      const label = norm(mm[1]);
      const val = mm[2].trim();
      if (label && val && !blocos[label]) blocos[label] = [val];
    }
  }
  return blocos;
}

function achaBloco(blocos: Record<string, string[]>, ...termos: string[]): string[] {
  for (const k of Object.keys(blocos)) {
    if (termos.some((t) => k.includes(norm(t)))) return blocos[k];
  }
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseEvento(ev: any) {
  const blocos = blocosDaDescricao(ev.description ?? "");
  const reservado = achaBloco(blocos, "reservado por", "reservado", "responsavel");
  const emailDesc = reservado.find(ehEmail) ?? null;
  const telDesc = reservado.find((l) => !ehEmail(l) && /\d{4,}/.test(l)) ?? null;
  const nomeReservado = reservado.find((l) => !ehEmail(l) && !/\d{4,}/.test(l)) ?? null;

  // email: prioriza o da descrição; senão convidado não-organizador
  const conv = (ev.attendees ?? [])
    .filter((a: { organizer?: boolean; self?: boolean }) => !a.organizer && !a.self)
    .map((a: { email?: string }) => a.email)
    .filter(Boolean) as string[];
  const email = (emailDesc ?? conv[0] ?? null)?.toLowerCase() ?? null;

  const idadeRaw = (achaBloco(blocos, "anos de operacao", "anos de operação", "idade")[0] ?? "");
  return {
    nome: nomeReservado || limparNome(ev.summary ?? ""),
    email,
    telefone: normalizarTelefone(telDesc ?? achaBloco(blocos, "telefone", "celular", "whatsapp")[0] ?? null),
    nome_estabelecimento: achaBloco(blocos, "estabelecimento", "nome do restaurante", "restaurante", "nome do aluno", "aluno")[0] ?? null,
    anos_operacao: parseIdadeSegura(idadeRaw),
    segmento: achaBloco(blocos, "segmento", "serie", "série", "turma", "ano")[0] ?? null,
    data_visita: ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date}T00:00:00` : null),
    google_event_id: ev.id as string,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") ?? req.headers.get("x-sync-secret");
  if (secret !== Deno.env.get("AGENDA_SYNC_SECRET")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const dryRun = url.searchParams.get("dryRun") === "1";

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const accessToken = await getAccessToken(admin);
    // janela: de 1h atrás até +120 dias (pega recém-criados de hoje + futuros)
    const timeMin = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const timeMax = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString();
    const qs = new URLSearchParams({
      singleEvents: "true", orderBy: "startTime", maxResults: "250",
      timeMin, timeMax, eventTypes: "default",
    });
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CAL)}/events?${qs}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "google_api", calendar: CAL, detail: await res.text() }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventos: any[] = (data.items ?? []).filter((e: any) => e.start && (e.start.dateTime || e.start.date));

    if (dryRun) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const preview = eventos.slice(0, 8).map((e: any) => ({
        id: e.id, summary: e.summary, start: e.start?.dateTime ?? e.start?.date,
        description: (e.description ?? "").slice(0, 500),
        parsed: parseEvento(e),
      }));
      return new Response(JSON.stringify({ ok: true, calendar: CAL, total: eventos.length, preview }, null, 2), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let criados = 0, jaExistiam = 0;
    const erros: Array<{ evento: string; erro: string }> = [];
    for (const ev of eventos) {
      // Blindagem por evento: um agendamento problemático NÃO derruba o sync inteiro.
      try {
        const p = parseEvento(ev);
        if (!p.google_event_id) continue;
        // dedupe pelo LEDGER de eventos (calendario_eventos tem 1 linha por
        // google_event_id). NÃO usar oportunidades.google_event_id: com "uma
        // oportunidade por contato", vários eventos colapsam numa opp só e esse
        // campo fica revezando entre eles, quebrando o dedup e re-notificando.
        const { data: existe } = await admin
          .from("calendario_eventos").select("google_event_id").eq("google_event_id", p.google_event_id).maybeSingle();
        if (existe) { jaExistiam++; continue; }

        const input: LeadInput = {
          origem: "Agenda Google - Agendou diretamente pelo link",
          etapa: "Visita Agendada",
          nome: p.nome,
          email: p.email,
          telefone: p.telefone,
          nome_estabelecimento: p.nome_estabelecimento,
          anos_operacao: p.anos_operacao,
          segmento: p.segmento,
          observacoes: "Agendado pelo site (Google Agenda)",
          metadados: { google_event_id: p.google_event_id, descricao_evento: ev.description ?? null },
        };
        const r = await criarLead(admin, input);
        // Família já matriculada: não cria lead. Registra o evento no ledger
        // (oportunidade_id null) só para o dedup não reprocessar todo ciclo, e
        // não avisa a secretaria.
        if (r.ignorado) {
          if (p.data_visita) {
            const fim = new Date(new Date(p.data_visita).getTime() + 60 * 60 * 1000).toISOString();
            await admin.from("calendario_eventos").upsert({
              google_event_id: p.google_event_id,
              titulo: ev.summary ?? `Visita: ${p.nome}`,
              descricao: ev.description ?? null,
              inicio: p.data_visita, fim,
              oportunidade_id: null,
              sincronizado_em: new Date().toISOString(),
            }, { onConflict: "google_event_id" });
          }
          continue;
        }
        // grava data_visita + google_event_id na oportunidade e cacheia o evento
        await admin.from("oportunidades").update({
          data_visita: p.data_visita, google_event_id: p.google_event_id,
        }).eq("id", r.oportunidade_id);
        if (p.data_visita) {
          const fim = new Date(new Date(p.data_visita).getTime() + 60 * 60 * 1000).toISOString();
          await admin.from("calendario_eventos").upsert({
            google_event_id: p.google_event_id,
            titulo: ev.summary ?? `Visita: ${p.nome}`,
            descricao: ev.description ?? null,
            inicio: p.data_visita, fim,
            oportunidade_id: r.oportunidade_id,
            sincronizado_em: new Date().toISOString(),
          }, { onConflict: "google_event_id" });
        }
        await avisarSecretaria({
          tipo: "agendamento", nome: p.nome, telefone: p.telefone, email: p.email,
          nome_estabelecimento: p.nome_estabelecimento, anos_operacao: p.anos_operacao,
          segmento: p.segmento, data_visita: p.data_visita, origem: "Google Agenda",
        });
        criados++;
      } catch (e) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msg = e instanceof Error ? e.message : ((e as any)?.message ?? JSON.stringify(e));
        console.error("agenda_sync_evento_erro", ev.id, msg);
        erros.push({ evento: ev.summary ?? ev.id, erro: String(msg).slice(0, 300) });
      }
    }

    return new Response(JSON.stringify({ ok: true, calendar: CAL, total: eventos.length, criados, jaExistiam, erros }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("agenda_sync_error", err);
    return new Response(JSON.stringify({ error: "internal_error", message: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
