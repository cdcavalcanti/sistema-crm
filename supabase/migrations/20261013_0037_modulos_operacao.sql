-- Módulos comerciais extraídos do CRM de referência (operação, diagnóstico,
-- NPS, secretária, comunicação, gestão). Sem pedidos/ERP e sem SaaS multi-tenant.
-- Tudo no mesmo tenant, com carteira quando há oportunidade.

create or replace function public.crm_modulo_visivel(_oportunidade_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    _oportunidade_id is null
    or exists (
      select 1 from public.oportunidades o
      where o.id = _oportunidade_id
        and public.pode_ver_carteira(o.responsavel)
    );
$$;

grant execute on function public.crm_modulo_visivel(uuid) to authenticated;

create table if not exists public.orcamentos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  status text not null default 'rascunho',
  valor numeric,
  validade date,
  contato_id uuid references public.contatos(id) on delete set null,
  oportunidade_id uuid references public.oportunidades(id) on delete set null,
  responsavel text,
  notas text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.propostas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  status text not null default 'rascunho',
  valor numeric,
  validade date,
  contato_id uuid references public.contatos(id) on delete set null,
  oportunidade_id uuid references public.oportunidades(id) on delete set null,
  responsavel text,
  notas text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.ligacoes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  status text not null default 'registrada',
  direcao text not null default 'saida' check (direcao in ('entrada', 'saida')),
  duracao_seg integer,
  resultado text,
  contato_id uuid references public.contatos(id) on delete set null,
  oportunidade_id uuid references public.oportunidades(id) on delete set null,
  responsavel text,
  notas text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.nps_respostas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  status text not null default 'enviado',
  score integer check (score is null or score between 0 and 10),
  canal text,
  contato_id uuid references public.contatos(id) on delete set null,
  oportunidade_id uuid references public.oportunidades(id) on delete set null,
  responsavel text,
  notas text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.diagnosticos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  status text not null default 'aberto',
  indice numeric,
  eixo text,
  contato_id uuid references public.contatos(id) on delete set null,
  oportunidade_id uuid references public.oportunidades(id) on delete set null,
  responsavel text,
  notas text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.reuniao_notas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  status text not null default 'registrada',
  data_reuniao date,
  contato_id uuid references public.contatos(id) on delete set null,
  oportunidade_id uuid references public.oportunidades(id) on delete set null,
  responsavel text,
  notas text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.prospeccao (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  status text not null default 'fila',
  origem text,
  proximo_passo text,
  contato_id uuid references public.contatos(id) on delete set null,
  oportunidade_id uuid references public.oportunidades(id) on delete set null,
  responsavel text,
  notas text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.email_campanhas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  status text not null default 'rascunho',
  assunto text,
  contato_id uuid references public.contatos(id) on delete set null,
  oportunidade_id uuid references public.oportunidades(id) on delete set null,
  responsavel text,
  notas text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.planejamento (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  status text not null default 'planejado',
  semana_inicio date,
  meta text,
  contato_id uuid references public.contatos(id) on delete set null,
  oportunidade_id uuid references public.oportunidades(id) on delete set null,
  responsavel text,
  notas text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.campos_personalizados (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  status text not null default 'ativo',
  entidade text not null default 'contato',
  chave text not null,
  tipo_campo text not null default 'texto',
  obrigatorio boolean not null default false,
  notas text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (entidade, chave)
);

create table if not exists public.automacao_regras (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  status text not null default 'ativa',
  evento text not null,
  acao text not null,
  ativo boolean not null default true,
  notas text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array[
    'orcamentos','propostas','ligacoes','nps_respostas','diagnosticos',
    'reuniao_notas','prospeccao','email_campanhas','planejamento'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (public.crm_modulo_visivel(oportunidade_id))',
      t, t
    );
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format(
      'create policy %I_write on public.%I for all to authenticated using (public.crm_modulo_visivel(oportunidade_id)) with check (public.crm_modulo_visivel(oportunidade_id))',
      t, t
    );
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format(
      'create trigger %I_touch before update on public.%I for each row execute function public.touch_atualizado_em()',
      t, t
    );
  end loop;
end $$;

alter table public.campos_personalizados enable row level security;
drop policy if exists campos_personalizados_select on public.campos_personalizados;
create policy campos_personalizados_select on public.campos_personalizados
  for select to authenticated using (true);
drop policy if exists campos_personalizados_admin on public.campos_personalizados;
create policy campos_personalizados_admin on public.campos_personalizados
  for all to authenticated
  using (public.is_admin_or_super(auth.uid()))
  with check (public.is_admin_or_super(auth.uid()));

alter table public.automacao_regras enable row level security;
drop policy if exists automacao_regras_select on public.automacao_regras;
create policy automacao_regras_select on public.automacao_regras
  for select to authenticated using (true);
drop policy if exists automacao_regras_admin on public.automacao_regras;
create policy automacao_regras_admin on public.automacao_regras
  for all to authenticated
  using (public.is_admin_or_super(auth.uid()))
  with check (public.is_admin_or_super(auth.uid()));
