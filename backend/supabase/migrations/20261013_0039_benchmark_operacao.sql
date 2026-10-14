-- Funis múltiplos, empresas como entidade, pedidos comerciais (não ERP)
-- e campos da ficha do negócio. Um tenant.

create table if not exists public.funis (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  cor text,
  ordem int not null default 0,
  tipo text not null default 'vendas',
  criado_em timestamptz not null default now()
);

alter table public.funis enable row level security;
drop policy if exists funis_select on public.funis;
create policy funis_select on public.funis for select to authenticated using (true);
drop policy if exists funis_admin on public.funis;
create policy funis_admin on public.funis
  for all to authenticated
  using (public.is_admin_or_super(auth.uid()))
  with check (public.is_admin_or_super(auth.uid()));

insert into public.funis (nome, slug, cor, ordem, tipo)
values
  ('Comercial', 'comercial', '#6D4CFF', 1, 'vendas'),
  ('NPS / CS', 'nps', '#10b981', 2, 'nps'),
  ('Diagnóstico', 'diagnostico', '#0ea5e9', 3, 'diagnostico')
on conflict (slug) do nothing;

alter table public.etapas add column if not exists funil_id uuid references public.funis(id) on delete set null;

update public.etapas e
set funil_id = f.id
from public.funis f
where f.slug = 'comercial' and e.funil_id is null;

insert into public.etapas (nome, ordem, cor, tipo, funil_id)
select v.nome, v.ordem, v.cor, v.tipo, f.id
from public.funis f
cross join (values
  ('Agendamento do onboarding', 1, '#10b981', 'andamento'),
  ('Onboarding realizado', 2, '#14b8a6', 'andamento'),
  ('Entrega de quick-wins', 3, '#06b6d4', 'andamento'),
  ('Entrega do projeto principal', 4, '#3b82f6', 'andamento'),
  ('NPS', 5, '#6D4CFF', 'ganho')
) as v(nome, ordem, cor, tipo)
where f.slug = 'nps'
  and not exists (select 1 from public.etapas x where x.funil_id = f.id);

insert into public.etapas (nome, ordem, cor, tipo, funil_id)
select v.nome, v.ordem, v.cor, v.tipo, f.id
from public.funis f
cross join (values
  ('Entrada do diagnóstico', 1, '#0ea5e9', 'inicial'),
  ('Análise', 2, '#3b82f6', 'andamento'),
  ('Entregue', 3, '#10b981', 'ganho')
) as v(nome, ordem, cor, tipo)
where f.slug = 'diagnostico'
  and not exists (select 1 from public.etapas x where x.funil_id = f.id);

create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text,
  tamanho text,
  faturamento_mensal numeric,
  atividade_principal text,
  atividade_secundaria text,
  site text,
  instagram text,
  linkedin text,
  situacao_cadastral text,
  notas text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.empresas enable row level security;
drop policy if exists empresas_select on public.empresas;
create policy empresas_select on public.empresas for select to authenticated using (true);
drop policy if exists empresas_write on public.empresas;
create policy empresas_write on public.empresas
  for all to authenticated using (true) with check (true);

drop trigger if exists empresas_touch on public.empresas;
create trigger empresas_touch before update on public.empresas
  for each row execute function public.touch_atualizado_em();

alter table public.contatos add column if not exists empresa_id uuid references public.empresas(id) on delete set null;
alter table public.contatos add column if not exists cargo text;
alter table public.oportunidades add column if not exists empresa_id uuid references public.empresas(id) on delete set null;
alter table public.oportunidades add column if not exists funil_id uuid references public.funis(id) on delete set null;
alter table public.oportunidades add column if not exists cargo_contato text;
alter table public.oportunidades add column if not exists dor_cliente text;
alter table public.oportunidades add column if not exists impacto_negocio text;

update public.oportunidades o
set funil_id = e.funil_id
from public.etapas e
where o.etapa_id = e.id and o.funil_id is null;

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  status text not null default 'em_execucao',
  valor numeric,
  orcamento_id uuid references public.orcamentos(id) on delete set null,
  contato_id uuid references public.contatos(id) on delete set null,
  oportunidade_id uuid references public.oportunidades(id) on delete set null,
  responsavel text,
  notas text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.pedidos enable row level security;
drop policy if exists pedidos_select on public.pedidos;
create policy pedidos_select on public.pedidos
  for select to authenticated using (public.crm_modulo_visivel(oportunidade_id));
drop policy if exists pedidos_write on public.pedidos;
create policy pedidos_write on public.pedidos
  for all to authenticated
  using (public.crm_modulo_visivel(oportunidade_id))
  with check (public.crm_modulo_visivel(oportunidade_id));
drop trigger if exists pedidos_touch on public.pedidos;
create trigger pedidos_touch before update on public.pedidos
  for each row execute function public.touch_atualizado_em();
