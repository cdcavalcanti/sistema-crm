-- Telefones de clientes já ativos / já contratados (blocklist).
-- Regra: se o telefone de um lead novo estiver aqui, ele NÃO é cadastrado no
-- CRM (é cliente atual, não lead). O match é pelos últimos 8 dígitos (sufixo8),
-- igual ao dedup de contatos — independe de formatação/DDI.

create table if not exists public.telefones_matriculados (
  id             uuid primary key default gen_random_uuid(),
  telefone_digits text not null,
  sufixo8        text not null,
  criado_em      timestamptz not null default now()
);

create index if not exists idx_tel_matriculados_sufixo
  on public.telefones_matriculados (sufixo8);

alter table public.telefones_matriculados enable row level security;

-- leitura para usuários logados; escrita só via service role (importação)
drop policy if exists tel_matriculados_read on public.telefones_matriculados;
create policy tel_matriculados_read on public.telefones_matriculados
  for select to authenticated using (true);
