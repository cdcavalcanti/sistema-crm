-- =================================================================
-- Auto-implementação: solicitações de melhoria do time.
-- Pedido → Claude implementa (PR) → aprovação no WhatsApp → build → merge.
-- =================================================================

create table if not exists public.melhorias (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  solicitante_email text,
  status text not null default 'solicitada',  -- solicitada|preparando|aguardando_aprovacao|aprovada|concluida|backlog|falhou
  token text not null,
  issue_number int,
  issue_url text,
  pr_number int,
  pr_url text,
  resumo_ajuste text,
  notificado_em timestamptz,                   -- quando a notificação chegou no grupo (controla retry)
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.melhorias enable row level security;
create index if not exists melhorias_criado_idx on public.melhorias(criado_em desc);
create index if not exists melhorias_issue_idx on public.melhorias(issue_number);

create trigger melhorias_touch before update on public.melhorias
  for each row execute function public.touch_atualizado_em();

-- Usuários autenticados veem a lista de melhorias (status). O token nunca é exposto na UI.
create policy "melhorias_select_auth" on public.melhorias for select to authenticated using (true);
