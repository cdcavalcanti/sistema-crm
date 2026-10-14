-- Assistente GPT (OpenAI) dentro do CRM. Chat de uso geral, por usuário.
-- Cada usuário só enxerga as próprias conversas (RLS por auth.uid()).

create table if not exists public.gpt_conversas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  titulo text not null default 'Nova conversa',
  modelo text not null default 'gpt-4o',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_gpt_conversas_user on public.gpt_conversas (user_id, atualizado_em desc);

create table if not exists public.gpt_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.gpt_conversas(id) on delete cascade,
  papel text not null check (papel in ('user', 'assistant', 'system')),
  conteudo text not null default '',
  -- anexos: [{ tipo: 'imagem'|'arquivo', nome, mime, url? , texto? }]
  anexos jsonb not null default '[]'::jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists idx_gpt_mensagens_conversa on public.gpt_mensagens (conversa_id, criado_em);

alter table public.gpt_conversas enable row level security;
alter table public.gpt_mensagens enable row level security;

-- Conversas: o dono faz tudo.
drop policy if exists gpt_conversas_all on public.gpt_conversas;
create policy gpt_conversas_all on public.gpt_conversas
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Mensagens: acesso via posse da conversa.
drop policy if exists gpt_mensagens_all on public.gpt_mensagens;
create policy gpt_mensagens_all on public.gpt_mensagens
  for all to authenticated
  using (exists (select 1 from public.gpt_conversas c where c.id = conversa_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.gpt_conversas c where c.id = conversa_id and c.user_id = auth.uid()));
