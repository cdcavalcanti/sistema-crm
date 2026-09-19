-- =================================================================
-- Sistema CRM — Chat de WhatsApp dentro do CRM
--
-- Provedor: WAHA (WhatsApp HTTP API). As mensagens entram por um webhook
-- (Edge Function whatsapp-webhook) e saem pela Edge Function whatsapp-send.
-- O front escuta via Supabase Realtime.
--
-- IMPORTANTE: instância/sessão/secret/numero são PRÓPRIOS do Sistema CRM —
-- nada é compartilhado com outros projetos.
-- =================================================================

-- =========================
-- conversas (uma por chat de WhatsApp)
-- =========================
create table public.conversas (
  id uuid primary key default gen_random_uuid(),
  wa_chat_id text not null unique,          -- ex: "5511999999999@c.us"
  telefone text,                            -- dígitos extraídos do wa_chat_id
  nome_whatsapp text,                       -- nome do perfil no WhatsApp
  foto_url text,                            -- foto de perfil (pode expirar)
  contato_id uuid references public.contatos(id) on delete set null,
  status text not null default 'aberta',    -- aberta | fechada
  ultimo_em timestamptz not null default now(),
  nao_lidas int not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.conversas enable row level security;
create index conversas_ultimo_idx on public.conversas(ultimo_em desc);
create index conversas_contato_idx on public.conversas(contato_id);

-- =========================
-- mensagens
-- =========================
create table public.mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  wa_message_id text unique,                -- id do WAHA (dedupe do webhook)
  direcao text not null,                    -- entrada | saida
  corpo text,
  tipo text not null default 'texto',       -- texto | imagem | audio | video | documento | figurinha
  media_url text,
  media_mime text,
  media_nome text,
  status text,                              -- pendente | enviada | entregue | lida | falhou
  autor_id uuid references auth.users(id) on delete set null,  -- null = inbound
  autor_email text,
  criado_em timestamptz not null default now()
);
alter table public.mensagens enable row level security;
create index mensagens_conversa_idx on public.mensagens(conversa_id, criado_em);

-- =========================
-- updated_at trigger (reaproveita touch_atualizado_em)
-- =========================
create trigger conversas_touch before update on public.conversas
  for each row execute function public.touch_atualizado_em();

-- =========================
-- Auditoria (reaproveita audit_trigger genérico)
-- =========================
create trigger audit_conversas after insert or update or delete on public.conversas
  for each row execute function public.audit_trigger();
create trigger audit_mensagens after insert or update or delete on public.mensagens
  for each row execute function public.audit_trigger();

-- =========================
-- RLS — usuários autenticados leem e gerenciam (padrão das demais tabelas).
-- O envio/recebimento real é feito pelas Edge Functions com service role.
-- =========================
create policy "conversas_select_auth" on public.conversas for select to authenticated using (true);
create policy "conversas_insert_auth" on public.conversas for insert to authenticated with check (true);
create policy "conversas_update_auth" on public.conversas for update to authenticated using (true) with check (true);

create policy "mensagens_select_auth" on public.mensagens for select to authenticated using (true);
create policy "mensagens_insert_auth" on public.mensagens for insert to authenticated with check (true);
create policy "mensagens_update_auth" on public.mensagens for update to authenticated using (true) with check (true);

-- =========================
-- Realtime
-- =========================
alter publication supabase_realtime add table public.conversas;
alter publication supabase_realtime add table public.mensagens;
