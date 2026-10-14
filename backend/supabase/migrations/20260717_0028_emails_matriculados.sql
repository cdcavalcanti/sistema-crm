-- E-mails de clientes já ativos / já contratados (blocklist).
-- Complementa telefones_matriculados: um lead é ignorado se o TELEFONE OU o
-- E-MAIL bater com a lista (cobre quem usa um telefone diferente do cadastrado).

create table if not exists public.emails_matriculados (
  id        uuid primary key default gen_random_uuid(),
  email     text not null unique,
  criado_em timestamptz not null default now()
);

alter table public.emails_matriculados enable row level security;

drop policy if exists emails_matriculados_read on public.emails_matriculados;
create policy emails_matriculados_read on public.emails_matriculados
  for select to authenticated using (true);
