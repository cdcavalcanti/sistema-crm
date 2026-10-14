// Google Calendar bidirecional para o Sistema CRM.
//
// Rotas (todas montadas em /functions/v1/google-calendar-sync):
//   GET  /auth                 → super_admin gera URL de OAuth; redireciona/retorna URL
//   GET  /callback?code=...    → Google retorna aqui; trocamos code por tokens
//                                e gravamos refresh_token em `google_credentials`
//   GET  /events?start=&end=   → lista eventos do calendário no intervalo
//   POST /events               → cria evento { titulo, descricao, inicio, fim, ... }
//   PATCH /events/:id          → atualiza evento
//   DELETE /events/:id         → remove evento
//
// Compatível com a aba Calendário do CRM e com o n8n (que pode usar o trigger
// nativo do Calendar e enviar para /functions/v1/leads em vez de chamar aqui).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

const SCOPES = "https://www.googleapis.com/auth/calendar";

function envOrThrow(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function adminClient(): SupabaseClient {
  return createClient(envOrThrow("SUPABASE_URL"), envOrThrow("SUPABASE_SERVICE_ROLE_KEY"));
}

async function getCallerRoles(req: Request): Promise<{
  userId: string | null;
  email: string | null;
  roles: string[];
}> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return { userId: null, email: null, roles: [] };
  const token = auth.replace("Bearer ", "");
  const userClient = createClient(envOrThrow("SUPABASE_URL"), envOrThrow("SUPABASE_ANON_KEY"));
  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user) return { userId: null, email: null, roles: [] };
  const admin = adminClient();
  const { data: rows } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);
  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    roles: (rows ?? []).map((r: { role: string }) => r.role),
  };
}

// =====================================================================
// OAuth: troca de code por tokens e refresh
// =====================================================================
async function exchangeCode(code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: envOrThrow("GOOGLE_CLIENT_ID"),
      client_secret: envOrThrow("GOOGLE_CLIENT_SECRET"),
      redirect_uri: envOrThrow("GOOGLE_REDIRECT_URI"),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`google_token_exchange_failed: ${t}`);
  }
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope: string;
  }>;
}

async function refreshAccessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: envOrThrow("GOOGLE_CLIENT_ID"),
      client_secret: envOrThrow("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`google_refresh_failed: ${t}`);
  }
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

async function getAccessToken(admin: SupabaseClient): Promise<{
  accessToken: string;
  calendarId: string;
}> {
  const { data: cred } = await admin
    .from("google_credentials")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (!cred) throw new Error("not_connected");

  const expiresAt = cred.access_token_expires_at ? new Date(cred.access_token_expires_at) : null;
  const stillValid = expiresAt && expiresAt.getTime() - Date.now() > 60_000;
  if (stillValid && cred.access_token) {
    return { accessToken: cred.access_token, calendarId: cred.calendar_id };
  }
  const refreshed = await refreshAccessToken(cred.refresh_token);
  const newExpires = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await admin
    .from("google_credentials")
    .update({
      access_token: refreshed.access_token,
      access_token_expires_at: newExpires,
    })
    .eq("id", 1);
  return { accessToken: refreshed.access_token, calendarId: cred.calendar_id };
}

// =====================================================================
// Google Calendar API helpers
// =====================================================================
const G = (path: string) => `https://www.googleapis.com/calendar/v3${path}`;

async function gFetch(path: string, accessToken: string, init: RequestInit = {}) {
  const res = await fetch(G(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`google_api_${res.status}: ${txt}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// =====================================================================
// Cache local (calendario_eventos)
// =====================================================================
type EventoCacheRow = {
  google_event_id: string;
  titulo: string;
  descricao: string | null;
  inicio: string;
  fim: string;
  local: string | null;
  sincronizado_em: string;
};

async function upsertCache(admin: SupabaseClient, evts: EventoCacheRow[]) {
  if (!evts.length) return;
  await admin.from("calendario_eventos").upsert(evts, { onConflict: "google_event_id" });
}

// =====================================================================
// Handler principal
// =====================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  // o path costuma vir como /google-calendar-sync/<resto>
  const path = url.pathname.replace(/^\/google-calendar-sync/, "") || "/";

  try {
    // ----- /auth: gera URL e redireciona -----
    if (path === "/auth" && req.method === "GET") {
      const { roles } = await getCallerRoles(req);
      if (!roles.includes("super_admin")) return json({ error: "forbidden" }, 403);

      const oauthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      oauthUrl.searchParams.set("client_id", envOrThrow("GOOGLE_CLIENT_ID"));
      oauthUrl.searchParams.set("redirect_uri", envOrThrow("GOOGLE_REDIRECT_URI"));
      oauthUrl.searchParams.set("response_type", "code");
      oauthUrl.searchParams.set("scope", SCOPES);
      oauthUrl.searchParams.set("access_type", "offline");
      oauthUrl.searchParams.set("prompt", "consent");
      return json({ url: oauthUrl.toString() });
    }

    // ----- /callback: troca code por tokens -----
    if (path === "/callback" && req.method === "GET") {
      const code = url.searchParams.get("code");
      if (!code) return json({ error: "missing_code" }, 400);
      const tokens = await exchangeCode(code);
      if (!tokens.refresh_token) {
        return json(
          {
            error: "no_refresh_token",
            hint:
              "Revogue o acesso em myaccount.google.com/permissions e tente novamente (precisa de prompt=consent).",
          },
          400,
        );
      }
      const admin = adminClient();
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
      await admin
        .from("google_credentials")
        .upsert(
          {
            id: 1,
            calendar_id: "primary",
            refresh_token: tokens.refresh_token,
            access_token: tokens.access_token,
            access_token_expires_at: expiresAt,
          },
          { onConflict: "id" },
        );

      // Audit log: Google Calendar conectado pelo super_admin
      await admin.from("audit_logs").insert({
        user_id: null,
        actor_email: "google_calendar_sync:callback",
        acao: "google_calendar.conectado",
        entidade: "google_credentials",
        entidade_id: "1",
        detalhes: { scope: tokens.scope ?? null, expires_at: expiresAt },
      });

      return new Response(
        "<!doctype html><html><body style=\"font-family:Inter,system-ui;padding:48px;max-width:560px;margin:auto\"><h1>Google Calendar conectado ✓</h1><p>Você pode fechar esta janela e voltar ao Sistema CRM.</p></body></html>",
        { status: 200, headers: { ...corsHeaders, "Content-Type": "text/html" } },
      );
    }

    // ----- /status: verifica conexão -----
    if (path === "/status" && req.method === "GET") {
      const admin = adminClient();
      const { data } = await admin
        .from("google_credentials")
        .select("calendar_id, atualizado_em")
        .eq("id", 1)
        .maybeSingle();
      return json({ connected: !!data, ...data });
    }

    // ----- /events: GET (list), POST (create) -----
    if (path === "/events" && req.method === "GET") {
      const admin = adminClient();
      const { accessToken, calendarId } = await getAccessToken(admin);
      const start = url.searchParams.get("start");
      const end = url.searchParams.get("end");
      const qs = new URLSearchParams({
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
        // Exclui workingLocation (Local de Trabalho), focusTime, outOfOffice, birthday, fromGmail
        // — só eventos "de verdade" criados pelo usuário ou compartilhados.
        eventTypes: "default",
      });
      if (start) qs.set("timeMin", start);
      if (end) qs.set("timeMax", end);
      const data = await gFetch(
        `/calendars/${encodeURIComponent(calendarId)}/events?${qs}`,
        accessToken,
      );
      const items: Array<Record<string, any>> = data?.items ?? [];
      const evts: EventoCacheRow[] = items
        // Safety net: o param eventTypes=default já filtra, mas garantimos client-side também
        .filter((it) => !it.eventType || it.eventType === "default")
        .filter((it) => it.start && (it.start.dateTime || it.start.date))
        .map((it) => {
          const start = it.start.dateTime ?? `${it.start.date}T00:00:00Z`;
          const end = it.end?.dateTime ?? `${it.end?.date ?? it.start.date}T23:59:59Z`;
          return {
            google_event_id: it.id,
            titulo: it.summary ?? "(sem título)",
            descricao: it.description ?? null,
            inicio: start,
            fim: end,
            local: it.location ?? null,
            sincronizado_em: new Date().toISOString(),
          };
        });
      await upsertCache(admin, evts);
      return json({ items: evts });
    }

    if (path === "/events" && req.method === "POST") {
      const { userId } = await getCallerRoles(req);
      if (!userId) return json({ error: "unauthorized" }, 401);

      const body = await req.json().catch(() => null);
      if (!body?.titulo || !body?.inicio || !body?.fim) {
        return json({ error: "invalid_payload" }, 400);
      }
      const admin = adminClient();
      const { accessToken, calendarId } = await getAccessToken(admin);
      const created = await gFetch(
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        accessToken,
        {
          method: "POST",
          body: JSON.stringify({
            summary: body.titulo,
            description: body.descricao ?? undefined,
            location: body.local ?? undefined,
            start: { dateTime: body.inicio },
            end: { dateTime: body.fim },
          }),
        },
      );
      await upsertCache(admin, [
        {
          google_event_id: created.id,
          titulo: created.summary ?? body.titulo,
          descricao: created.description ?? null,
          inicio: created.start.dateTime ?? body.inicio,
          fim: created.end.dateTime ?? body.fim,
          local: created.location ?? null,
          sincronizado_em: new Date().toISOString(),
        },
      ]);
      // adicionalmente registra no cache local com vínculos opcionais
      await admin
        .from("calendario_eventos")
        .update({
          contato_id: body.contato_id ?? null,
          oportunidade_id: body.oportunidade_id ?? null,
          criado_por: userId,
        })
        .eq("google_event_id", created.id);

      return json({ ok: true, event: created });
    }

    // ----- /events/:id: PATCH / DELETE -----
    const matchEvent = path.match(/^\/events\/([^/]+)$/);
    if (matchEvent) {
      const eventId = decodeURIComponent(matchEvent[1]);
      const { userId } = await getCallerRoles(req);
      if (!userId) return json({ error: "unauthorized" }, 401);
      const admin = adminClient();
      const { accessToken, calendarId } = await getAccessToken(admin);

      if (req.method === "PATCH") {
        const body = await req.json().catch(() => null);
        const payload: Record<string, unknown> = {};
        if (body?.titulo) payload.summary = body.titulo;
        if (body?.descricao !== undefined) payload.description = body.descricao;
        if (body?.local !== undefined) payload.location = body.local;
        if (body?.inicio) payload.start = { dateTime: body.inicio };
        if (body?.fim) payload.end = { dateTime: body.fim };
        const updated = await gFetch(
          `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
          accessToken,
          { method: "PATCH", body: JSON.stringify(payload) },
        );
        await upsertCache(admin, [
          {
            google_event_id: updated.id,
            titulo: updated.summary ?? "(sem título)",
            descricao: updated.description ?? null,
            inicio: updated.start.dateTime,
            fim: updated.end.dateTime,
            local: updated.location ?? null,
            sincronizado_em: new Date().toISOString(),
          },
        ]);
        return json({ ok: true, event: updated });
      }

      if (req.method === "DELETE") {
        await gFetch(
          `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
          accessToken,
          { method: "DELETE" },
        );
        await admin.from("calendario_eventos").delete().eq("google_event_id", eventId);
        return json({ ok: true });
      }
    }

    return json({ error: "not_found", path }, 404);
  } catch (err) {
    console.error("google_calendar_sync_error", err);
    const msg = String(err?.message ?? err);
    const status = msg.includes("not_connected") ? 412 : 500;
    return json({ error: "internal_error", message: msg }, status);
  }
});
