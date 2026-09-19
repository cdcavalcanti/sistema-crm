-- =================================================================
-- Camada de auditoria ("empresa de 1 homem só"): resultados das checagens
-- automáticas (site no ar, formulários, Meta vs CRM, movimentações).
-- Roda por cron; alerta no WhatsApp quando acha problema.
-- =================================================================

create table if not exists public.auditorias (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,                  -- site | entradas | meta | movimentacoes
  status text not null,                -- ok | alerta
  resumo text,
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
alter table public.auditorias enable row level security;
create index if not exists auditorias_tipo_idx on public.auditorias(tipo, criado_em desc);

-- Só super_admin lê (mesma régua dos Logs).
create policy "auditorias_select_super" on public.auditorias for select to authenticated
  using (public.has_role(auth.uid(),'super_admin'));
