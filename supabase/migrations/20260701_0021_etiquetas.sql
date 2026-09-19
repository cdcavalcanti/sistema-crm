-- =================================================================
-- Etiquetas (tags) compartilhadas — criadas por qualquer usuário e visíveis
-- por todos. Vinculam-se a contatos e aparecem de forma sutil na lista/chat.
-- =================================================================

create table if not exists public.etiquetas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  cor text not null default '#64748b',
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);
alter table public.etiquetas enable row level security;
create policy "etiquetas_select_auth" on public.etiquetas for select to authenticated using (true);
create policy "etiquetas_insert_auth" on public.etiquetas for insert to authenticated with check (true);
create policy "etiquetas_update_auth" on public.etiquetas for update to authenticated using (true) with check (true);
create policy "etiquetas_delete_auth" on public.etiquetas for delete to authenticated using (true);

create table if not exists public.contato_etiquetas (
  contato_id  uuid not null references public.contatos(id) on delete cascade,
  etiqueta_id uuid not null references public.etiquetas(id) on delete cascade,
  criado_em   timestamptz not null default now(),
  primary key (contato_id, etiqueta_id)
);
alter table public.contato_etiquetas enable row level security;
create index if not exists contato_etiquetas_contato_idx on public.contato_etiquetas(contato_id);
create policy "contato_etiquetas_select_auth" on public.contato_etiquetas for select to authenticated using (true);
create policy "contato_etiquetas_insert_auth" on public.contato_etiquetas for insert to authenticated with check (true);
create policy "contato_etiquetas_delete_auth" on public.contato_etiquetas for delete to authenticated using (true);
