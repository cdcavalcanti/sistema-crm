-- Plataforma CRM: modelo comercial B2B + carteira por responsável + RLS
--
-- 1) Renomeia colunas legadas (escola → empresa / estabelecimento)
-- 2) profiles.responsavel_crm para amarrar vendedor à carteira
-- 3) RLS: usuario vê a própria carteira; admin/super vê tudo
-- 4) Conversas/mensagens: inbox compartilhada (time comercial)

-- ---------------------------------------------------------------------------
-- 1) Rename colunas
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contatos' and column_name = 'nome_aluno'
  ) then
    alter table public.contatos rename column nome_aluno to nome_estabelecimento;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contatos' and column_name = 'idade_aluno'
  ) then
    alter table public.contatos rename column idade_aluno to anos_operacao;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contatos' and column_name = 'serie_interesse'
  ) then
    alter table public.contatos rename column serie_interesse to segmento;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'oportunidades' and column_name = 'nome_aluno'
  ) then
    alter table public.oportunidades rename column nome_aluno to nome_estabelecimento;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'oportunidades' and column_name = 'idade_aluno'
  ) then
    alter table public.oportunidades rename column idade_aluno to anos_operacao;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'oportunidades' and column_name = 'data_matricula'
  ) then
    alter table public.oportunidades rename column data_matricula to data_fechamento;
  end if;
end $$;

alter table public.contatos drop constraint if exists contatos_idade_aluno_check;
alter table public.contatos drop constraint if exists contatos_anos_operacao_check;
alter table public.contatos
  add constraint contatos_anos_operacao_check
  check (anos_operacao is null or (anos_operacao >= 0 and anos_operacao <= 100));

alter table public.oportunidades drop constraint if exists oportunidades_idade_aluno_check;
alter table public.oportunidades drop constraint if exists oportunidades_anos_operacao_check;
alter table public.oportunidades
  add constraint oportunidades_anos_operacao_check
  check (anos_operacao is null or (anos_operacao >= 0 and anos_operacao <= 100));

alter index if exists oportunidades_nome_aluno_idx rename to oportunidades_nome_estabelecimento_idx;
alter index if exists oportunidades_data_matricula_idx rename to oportunidades_data_fechamento_idx;

-- ---------------------------------------------------------------------------
-- 2) Carteira do vendedor no perfil
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists responsavel_crm text;

comment on column public.profiles.responsavel_crm is
  'Rótulo que casa com oportunidades.responsavel (ex.: Comercial, CS). Null = vê só pool sem dono + admin bypass.';

-- Admins sem label ainda: default Comercial para quem já existe (não quebra o time)
update public.profiles
   set responsavel_crm = 'Comercial'
 where responsavel_crm is null;

create or replace function public.meu_responsavel_crm()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nullif(trim(responsavel_crm), '')
  from public.profiles
  where user_id = auth.uid()
$$;

grant execute on function public.meu_responsavel_crm() to authenticated;

create or replace function public.pode_ver_carteira(_responsavel text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin_or_super(auth.uid())
    or _responsavel is null
    or nullif(trim(_responsavel), '') is null
    or _responsavel is not distinct from public.meu_responsavel_crm()
$$;

grant execute on function public.pode_ver_carteira(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) RLS oportunidades
-- ---------------------------------------------------------------------------
drop policy if exists "oportunidades_select_auth" on public.oportunidades;
drop policy if exists oportunidades_select_auth on public.oportunidades;
drop policy if exists oportunidades_select_scoped on public.oportunidades;
create policy oportunidades_select_scoped on public.oportunidades
  for select to authenticated
  using (public.pode_ver_carteira(responsavel));

drop policy if exists "oportunidades_update_auth" on public.oportunidades;
drop policy if exists oportunidades_update_auth on public.oportunidades;
drop policy if exists oportunidades_update_scoped on public.oportunidades;
create policy oportunidades_update_scoped on public.oportunidades
  for update to authenticated
  using (public.pode_ver_carteira(responsavel))
  with check (
    public.is_admin_or_super(auth.uid())
    or responsavel is null
    or nullif(trim(responsavel), '') is null
    or responsavel is not distinct from public.meu_responsavel_crm()
  );

-- INSERT: autenticado pode criar; dono default = carteira do usuário (app seta)
drop policy if exists "oportunidades_insert_auth" on public.oportunidades;
drop policy if exists oportunidades_insert_auth on public.oportunidades;
drop policy if exists oportunidades_insert_scoped on public.oportunidades;
create policy oportunidades_insert_scoped on public.oportunidades
  for insert to authenticated
  with check (
    public.is_admin_or_super(auth.uid())
    or responsavel is null
    or nullif(trim(responsavel), '') is null
    or responsavel is not distinct from public.meu_responsavel_crm()
  );

-- ---------------------------------------------------------------------------
-- 4) RLS contatos (via oportunidades da carteira OU sem opp ainda)
-- ---------------------------------------------------------------------------
drop policy if exists "contatos_select_auth" on public.contatos;
drop policy if exists contatos_select_auth on public.contatos;
drop policy if exists contatos_select_scoped on public.contatos;
create policy contatos_select_scoped on public.contatos
  for select to authenticated
  using (
    public.is_admin_or_super(auth.uid())
    or not exists (select 1 from public.oportunidades o where o.contato_id = contatos.id)
    or exists (
      select 1 from public.oportunidades o
      where o.contato_id = contatos.id
        and public.pode_ver_carteira(o.responsavel)
    )
  );

drop policy if exists "contatos_update_auth" on public.contatos;
drop policy if exists contatos_update_auth on public.contatos;
drop policy if exists contatos_update_scoped on public.contatos;
create policy contatos_update_scoped on public.contatos
  for update to authenticated
  using (
    public.is_admin_or_super(auth.uid())
    or not exists (select 1 from public.oportunidades o where o.contato_id = contatos.id)
    or exists (
      select 1 from public.oportunidades o
      where o.contato_id = contatos.id
        and public.pode_ver_carteira(o.responsavel)
    )
  )
  with check (true);

-- insert/delete: mantém aberto a autenticados (admin cria leads; vendedor cadastra)
-- (policies existentes de insert permanecem se named differently)

-- ---------------------------------------------------------------------------
-- 5) RLS tarefas
-- ---------------------------------------------------------------------------
drop policy if exists "tarefas_select_auth" on public.tarefas;
drop policy if exists tarefas_select_auth on public.tarefas;
drop policy if exists tarefas_select_scoped on public.tarefas;
create policy tarefas_select_scoped on public.tarefas
  for select to authenticated
  using (
    public.is_admin_or_super(auth.uid())
    or criado_por = auth.uid()
    or atribuido_para = auth.uid()
    or oportunidade_id is null
    or exists (
      select 1 from public.oportunidades o
      where o.id = tarefas.oportunidade_id
        and public.pode_ver_carteira(o.responsavel)
    )
  );

-- ---------------------------------------------------------------------------
-- Inbox WhatsApp permanece compartilhada (política explícita documentada)
-- ---------------------------------------------------------------------------
comment on table public.conversas is
  'Inbox comercial compartilhada: todos os autenticados leem/escrevem. Carteira aplica-se a oportunidades/contatos/tarefas.';
