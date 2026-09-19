-- =================================================================
-- Sistema CRM — Schema inicial do CRM
-- Tabelas, triggers, helpers, RLS e seeds das 10 etapas
-- =================================================================

-- Enums
create type public.app_role as enum ('super_admin', 'admin', 'usuario');

-- =========================
-- profiles
-- =========================
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  nome text,
  email text,
  criado_em timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- =========================
-- user_roles
-- =========================
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  criado_em timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role = _role
  )
$$;

create or replace function public.is_admin_or_super(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles where user_id = _user_id and role in ('admin','super_admin')
  )
$$;

grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_admin_or_super(uuid) to authenticated;

-- =========================
-- etapas (pipeline)
-- =========================
create table public.etapas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ordem int not null,
  cor text,
  tipo text default 'andamento', -- inicial | andamento | ganho | perdido
  criado_em timestamptz not null default now()
);
alter table public.etapas enable row level security;

-- =========================
-- contatos
-- email é opcional para suportar importação de planilha sem email
-- =========================
create table public.contatos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text unique,
  telefone text,
  responsavel text,                 -- responsável do aluno (pai/mãe)
  serie_interesse text,             -- série de interesse (ex: "1º ano EF")
  observacoes text,
  metadados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.contatos enable row level security;
create index contatos_email_idx on public.contatos(email);

-- =========================
-- oportunidades
-- =========================
create table public.oportunidades (
  id uuid primary key default gen_random_uuid(),
  contato_id uuid not null references public.contatos(id) on delete cascade,
  titulo text,
  interesse text,
  descricao text,
  origem text not null,             -- formulario_site, agendamento_site, meta_ads, manual...
  etapa_id uuid references public.etapas(id) on delete set null,
  valor numeric(12,2),              -- valor da matrícula/anuidade (usado em Ganho/Perdido)
  data_visita timestamptz,          -- usada quando origem = agendamento_site
  google_event_id text,             -- referência para o evento no Google Calendar
  observacoes text,
  metadados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.oportunidades enable row level security;
create index oportunidades_etapa_idx on public.oportunidades(etapa_id);
create index oportunidades_contato_idx on public.oportunidades(contato_id);
create index oportunidades_criado_idx on public.oportunidades(criado_em desc);
create index oportunidades_origem_idx on public.oportunidades(origem);

-- =========================
-- comentários da oportunidade
-- =========================
create table public.oportunidade_comentarios (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references public.oportunidades(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  autor_email text,
  autor_nome text,
  conteudo text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.oportunidade_comentarios enable row level security;
create index oportunidade_comentarios_op_idx on public.oportunidade_comentarios(oportunidade_id);

-- =========================
-- tarefas
-- =========================
create table public.tarefas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  status text not null default 'aberta',    -- aberta | em_andamento | concluida | cancelada
  prioridade text not null default 'media', -- baixa | media | alta | urgente
  due_date timestamptz,
  contato_id uuid references public.contatos(id) on delete set null,
  oportunidade_id uuid references public.oportunidades(id) on delete set null,
  atribuido_para uuid references auth.users(id) on delete set null,
  criado_por uuid references auth.users(id) on delete set null,
  concluida_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.tarefas enable row level security;
create index tarefas_status_idx on public.tarefas(status);
create index tarefas_due_idx on public.tarefas(due_date);
create index tarefas_atribuido_idx on public.tarefas(atribuido_para);

-- =========================
-- calendário (cache local de eventos do Google)
-- =========================
create table public.calendario_eventos (
  id uuid primary key default gen_random_uuid(),
  google_event_id text unique,
  titulo text not null,
  descricao text,
  inicio timestamptz not null,
  fim timestamptz not null,
  local text,
  contato_id uuid references public.contatos(id) on delete set null,
  oportunidade_id uuid references public.oportunidades(id) on delete set null,
  criado_por uuid references auth.users(id) on delete set null,
  sincronizado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.calendario_eventos enable row level security;
create index calendario_inicio_idx on public.calendario_eventos(inicio);

-- =========================
-- credenciais Google (apenas 1 linha; gerida pelo super_admin)
-- =========================
create table public.google_credentials (
  id int primary key default 1 check (id = 1),
  calendar_id text not null default 'primary',
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  conectado_por uuid references auth.users(id) on delete set null,
  atualizado_em timestamptz not null default now()
);
alter table public.google_credentials enable row level security;

-- =========================
-- audit_logs
-- =========================
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  actor_email text,
  acao text not null,
  entidade text,
  entidade_id text,
  detalhes jsonb not null default '{}'::jsonb,
  ip text,
  criado_em timestamptz not null default now()
);
alter table public.audit_logs enable row level security;
create index audit_logs_criado_idx on public.audit_logs(criado_em desc);

-- =========================
-- updated_at trigger
-- =========================
create or replace function public.touch_atualizado_em()
returns trigger language plpgsql set search_path = public as $$
begin
  new.atualizado_em = now();
  return new;
end $$;

create trigger contatos_touch before update on public.contatos
  for each row execute function public.touch_atualizado_em();
create trigger oportunidades_touch before update on public.oportunidades
  for each row execute function public.touch_atualizado_em();
create trigger oportunidade_comentarios_touch before update on public.oportunidade_comentarios
  for each row execute function public.touch_atualizado_em();
create trigger tarefas_touch before update on public.tarefas
  for each row execute function public.touch_atualizado_em();
create trigger calendario_eventos_touch before update on public.calendario_eventos
  for each row execute function public.touch_atualizado_em();
create trigger google_credentials_touch before update on public.google_credentials
  for each row execute function public.touch_atualizado_em();

-- =========================
-- Conclusão automática de tarefas
-- =========================
create or replace function public.tarefa_set_concluida()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'concluida' and (old.status is null or old.status <> 'concluida') then
    new.concluida_em = now();
  elsif new.status <> 'concluida' then
    new.concluida_em = null;
  end if;
  return new;
end $$;

create trigger tarefas_concluida before update on public.tarefas
  for each row execute function public.tarefa_set_concluida();

-- =========================
-- handle_new_user: todo signup público entra como usuario.
-- Super_admin só por promoção (tela /admin/usuarios).
-- =========================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, nome, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    new.email
  );

  insert into public.user_roles (user_id, role) values (new.id, 'usuario');
  return new;
end $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- =========================
-- Auditoria genérica
-- =========================
create or replace function public.log_event(_acao text, _entidade text, _entidade_id text, _detalhes jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare _email text;
begin
  select email into _email from auth.users where id = auth.uid();
  insert into public.audit_logs (user_id, actor_email, acao, entidade, entidade_id, detalhes)
  values (auth.uid(), _email, _acao, _entidade, _entidade_id, coalesce(_detalhes, '{}'::jsonb));
end $$;

create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _acao text;
  _id text;
  _det jsonb;
begin
  if tg_op = 'INSERT' then
    _acao := tg_table_name || '.criado';
    _id := (to_jsonb(new)->>'id');
    _det := jsonb_build_object('novo', to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    _acao := tg_table_name || '.editado';
    _id := (to_jsonb(new)->>'id');
    _det := jsonb_build_object('antigo', to_jsonb(old), 'novo', to_jsonb(new));
    if tg_table_name = 'oportunidades' and old.etapa_id is distinct from new.etapa_id then
      _acao := 'oportunidades.movida';
      _det := _det || jsonb_build_object('etapa_origem', old.etapa_id, 'etapa_destino', new.etapa_id);
    end if;
  elsif tg_op = 'DELETE' then
    _acao := tg_table_name || '.excluido';
    _id := (to_jsonb(old)->>'id');
    _det := jsonb_build_object('antigo', to_jsonb(old));
  end if;
  perform public.log_event(_acao, tg_table_name, _id, _det);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create trigger audit_contatos after insert or update or delete on public.contatos
  for each row execute function public.audit_trigger();
create trigger audit_oportunidades after insert or update or delete on public.oportunidades
  for each row execute function public.audit_trigger();
create trigger audit_etapas after insert or update or delete on public.etapas
  for each row execute function public.audit_trigger();
create trigger audit_user_roles after insert or update or delete on public.user_roles
  for each row execute function public.audit_trigger();
create trigger audit_tarefas after insert or update or delete on public.tarefas
  for each row execute function public.audit_trigger();

-- =========================
-- Revogações de segurança
-- =========================
revoke execute on function public.log_event(text, text, text, jsonb) from anon, public;
revoke execute on function public.audit_trigger() from anon, public;
revoke execute on function public.handle_new_user() from anon, public;
revoke execute on function public.touch_atualizado_em() from anon, public;
revoke execute on function public.tarefa_set_concluida() from anon, public;

-- =========================
-- RLS Policies
-- =========================

-- profiles
create policy "profiles_select_self_or_admin" on public.profiles for select
  using (auth.uid() = user_id or public.is_admin_or_super(auth.uid()));
create policy "profiles_update_self" on public.profiles for update
  using (auth.uid() = user_id);

-- user_roles
create policy "user_roles_select_self_or_admin" on public.user_roles for select
  using (auth.uid() = user_id or public.is_admin_or_super(auth.uid()));
create policy "user_roles_super_admin_all" on public.user_roles for all
  using (public.has_role(auth.uid(),'super_admin'))
  with check (public.has_role(auth.uid(),'super_admin'));

-- etapas
create policy "etapas_select_authenticated" on public.etapas for select
  to authenticated using (true);
create policy "etapas_admin_write" on public.etapas for all
  to authenticated using (public.is_admin_or_super(auth.uid()))
  with check (public.is_admin_or_super(auth.uid()));

-- contatos
create policy "contatos_select_auth" on public.contatos for select to authenticated using (true);
create policy "contatos_insert_auth" on public.contatos for insert to authenticated with check (true);
create policy "contatos_update_auth" on public.contatos for update to authenticated using (true) with check (true);
create policy "contatos_delete_admin" on public.contatos for delete to authenticated
  using (public.is_admin_or_super(auth.uid()));

-- oportunidades
create policy "oportunidades_select_auth" on public.oportunidades for select to authenticated using (true);
create policy "oportunidades_insert_auth" on public.oportunidades for insert to authenticated with check (true);
create policy "oportunidades_update_auth" on public.oportunidades for update to authenticated using (true) with check (true);
create policy "oportunidades_delete_admin" on public.oportunidades for delete to authenticated
  using (public.is_admin_or_super(auth.uid()));

-- comentários
create policy "comentarios_select_auth" on public.oportunidade_comentarios for select
  to authenticated using (true);
create policy "comentarios_insert_auth" on public.oportunidade_comentarios for insert
  to authenticated with check (auth.uid() = user_id);
create policy "comentarios_update_own_or_admin" on public.oportunidade_comentarios for update
  to authenticated
  using (auth.uid() = user_id or public.is_admin_or_super(auth.uid()))
  with check (auth.uid() = user_id or public.is_admin_or_super(auth.uid()));
create policy "comentarios_delete_own_or_admin" on public.oportunidade_comentarios for delete
  to authenticated
  using (auth.uid() = user_id or public.is_admin_or_super(auth.uid()));

-- tarefas
create policy "tarefas_select_auth" on public.tarefas for select to authenticated using (true);
create policy "tarefas_insert_auth" on public.tarefas for insert to authenticated
  with check (auth.uid() = criado_por or criado_por is null);
create policy "tarefas_update_auth" on public.tarefas for update to authenticated
  using (
    auth.uid() = criado_por
    or auth.uid() = atribuido_para
    or public.is_admin_or_super(auth.uid())
  )
  with check (
    auth.uid() = criado_por
    or auth.uid() = atribuido_para
    or public.is_admin_or_super(auth.uid())
  );
create policy "tarefas_delete_admin_or_owner" on public.tarefas for delete to authenticated
  using (auth.uid() = criado_por or public.is_admin_or_super(auth.uid()));

-- calendário
create policy "calendario_select_auth" on public.calendario_eventos for select to authenticated using (true);
create policy "calendario_insert_auth" on public.calendario_eventos for insert to authenticated with check (true);
create policy "calendario_update_auth" on public.calendario_eventos for update to authenticated using (true) with check (true);
create policy "calendario_delete_auth" on public.calendario_eventos for delete to authenticated using (true);

-- google_credentials (somente super_admin lê/escreve)
create policy "google_credentials_super" on public.google_credentials for all
  to authenticated
  using (public.has_role(auth.uid(),'super_admin'))
  with check (public.has_role(auth.uid(),'super_admin'));

-- audit_logs (somente super_admin lê)
create policy "audit_logs_super_admin_select" on public.audit_logs for select
  to authenticated using (public.has_role(auth.uid(),'super_admin'));

-- =========================
-- Seed das 10 etapas do Sistema CRM
-- =========================
insert into public.etapas (nome, ordem, cor, tipo) values
  ('Lead novo',                     1, '#3b82f6', 'inicial'),
  ('Qualificação',            2, '#06b6d4', 'andamento'),
  ('Atendimento humano',              3, '#8b5cf6', 'andamento'),
  ('Demo agendada',                 4, '#a855f7', 'andamento'),
  ('Demo realizada',                5, '#f97316', 'andamento'),
  ('Proposta enviada',              6, '#eab308', 'andamento'),
  ('Negociação',                    7, '#14b8a6', 'andamento'),
  ('Follow-up / Remarketing',       8, '#0ea5e9', 'remarketing'),
  ('Ganho',                         9, '#10b981', 'ganho'),
  ('Perdido',    10, '#ef4444', 'perdido');
