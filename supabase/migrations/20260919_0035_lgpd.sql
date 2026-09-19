-- LGPD — bases mínimas de conformidade / consentimento / solicitações do titular
-- Sistema CRM (operador da instância: dados de leads/contatos B2B + usuários)

-- ---------------------------------------------------------------------------
-- 1) Consentimento dos usuários do CRM (equipe)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists lgpd_aceito_em timestamptz;

alter table public.profiles
  add column if not exists lgpd_versao_politica text;

comment on column public.profiles.lgpd_aceito_em is
  'Quando o usuário aceitou a política de privacidade vigente.';
comment on column public.profiles.lgpd_versao_politica is
  'Versão da política aceita (ex.: 2026-09-19).';

-- ---------------------------------------------------------------------------
-- 2) Registro de consentimentos / base legal (auditoria LGPD)
-- ---------------------------------------------------------------------------
create table if not exists public.lgpd_consentimentos (
  id uuid primary key default gen_random_uuid(),
  -- usuario_crm | titular_lead | cookie_analytics
  sujeito_tipo text not null check (sujeito_tipo in ('usuario_crm', 'titular_lead', 'cookie_analytics')),
  sujeito_ref text, -- user_id, contato_id ou anon id
  finalidade text not null,
  base_legal text not null default 'legitimo_interesse'
    check (base_legal in (
      'consentimento', 'contrato', 'obrigacao_legal',
      'legitimo_interesse', 'protecao_credito', 'outro'
    )),
  versao_politica text not null,
  aceito boolean not null default true,
  ip text,
  user_agent text,
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists lgpd_consentimentos_sujeito_idx
  on public.lgpd_consentimentos (sujeito_tipo, sujeito_ref);

alter table public.lgpd_consentimentos enable row level security;

drop policy if exists lgpd_consentimentos_select_admin on public.lgpd_consentimentos;
create policy lgpd_consentimentos_select_admin on public.lgpd_consentimentos
  for select to authenticated
  using (public.is_admin_or_super(auth.uid()));

drop policy if exists lgpd_consentimentos_insert_auth on public.lgpd_consentimentos;
create policy lgpd_consentimentos_insert_auth on public.lgpd_consentimentos
  for insert to authenticated
  with check (true);

-- ---------------------------------------------------------------------------
-- 3) Solicitações do titular (acesso, correção, exclusão, portabilidade)
-- ---------------------------------------------------------------------------
create table if not exists public.lgpd_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  -- acesso | correcao | exclusao | portabilidade | oposicao
  tipo text not null check (tipo in (
    'acesso', 'correcao', 'exclusao', 'portabilidade', 'oposicao'
  )),
  status text not null default 'aberta'
    check (status in ('aberta', 'em_andamento', 'concluida', 'recusada')),
  titular_nome text,
  titular_email text,
  titular_telefone text,
  contato_id uuid references public.contatos(id) on delete set null,
  motivo text,
  resposta text,
  processado_por uuid,
  processado_em timestamptz,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists lgpd_solicitacoes_status_idx
  on public.lgpd_solicitacoes (status, criado_em desc);

alter table public.lgpd_solicitacoes enable row level security;

drop policy if exists lgpd_solicitacoes_select_admin on public.lgpd_solicitacoes;
create policy lgpd_solicitacoes_select_admin on public.lgpd_solicitacoes
  for select to authenticated
  using (public.is_admin_or_super(auth.uid()));

drop policy if exists lgpd_solicitacoes_insert_admin on public.lgpd_solicitacoes;
create policy lgpd_solicitacoes_insert_admin on public.lgpd_solicitacoes
  for insert to authenticated
  with check (public.is_admin_or_super(auth.uid()));

drop policy if exists lgpd_solicitacoes_update_admin on public.lgpd_solicitacoes;
create policy lgpd_solicitacoes_update_admin on public.lgpd_solicitacoes
  for update to authenticated
  using (public.is_admin_or_super(auth.uid()))
  with check (public.is_admin_or_super(auth.uid()));

drop trigger if exists lgpd_solicitacoes_touch on public.lgpd_solicitacoes;
create trigger lgpd_solicitacoes_touch
  before update on public.lgpd_solicitacoes
  for each row execute function public.touch_atualizado_em();

-- ---------------------------------------------------------------------------
-- 4) Configuração (versão da política + retenção)
-- ---------------------------------------------------------------------------
create table if not exists public.lgpd_config (
  id boolean primary key default true check (id),
  versao_politica text not null default '2026-09-19',
  dpo_email text,
  dpo_nome text,
  retencao_leads_dias integer not null default 1825 -- ~5 anos
    check (retencao_leads_dias >= 30 and retencao_leads_dias <= 3650),
  analytics_ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

insert into public.lgpd_config (id) values (true)
on conflict (id) do nothing;

alter table public.lgpd_config enable row level security;

drop policy if exists lgpd_config_select_auth on public.lgpd_config;
create policy lgpd_config_select_auth on public.lgpd_config
  for select to authenticated using (true);

drop policy if exists lgpd_config_update_admin on public.lgpd_config;
create policy lgpd_config_update_admin on public.lgpd_config
  for update to authenticated
  using (public.is_admin_or_super(auth.uid()))
  with check (public.is_admin_or_super(auth.uid()));

-- ---------------------------------------------------------------------------
-- 5) Anonimizar contato (direito ao esquecimento operacional)
-- ---------------------------------------------------------------------------
create or replace function public.lgpd_anonimizar_contato(_contato_id uuid, _solicitacao_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_antes jsonb;
  v_uid uuid := auth.uid();
begin
  if not public.is_admin_or_super(v_uid) then
    raise exception 'forbidden';
  end if;

  select jsonb_build_object(
    'nome', nome,
    'email', email,
    'telefone', telefone,
    'nome_estabelecimento', nome_estabelecimento
  ) into v_antes
  from public.contatos where id = _contato_id;

  if v_antes is null then
    raise exception 'contato_not_found';
  end if;

  update public.contatos set
    nome = 'Titular removido (LGPD)',
    email = null,
    telefone = null,
    nome_estabelecimento = null,
    anos_operacao = null,
    segmento = null,
    observacoes = null,
    observacoes_internas = coalesce(observacoes_internas, '') ||
      E'\n[LGPD] Dados pessoais anonimizados em ' || now()::text,
    metadados = coalesce(metadados, '{}'::jsonb) || jsonb_build_object(
      'lgpd_anonimizado_em', now(),
      'lgpd_solicitacao_id', _solicitacao_id
    ),
    atualizado_em = now()
  where id = _contato_id;

  -- Espelho em oportunidades vinculadas (PII duplicada)
  update public.oportunidades set
    nome_estabelecimento = null,
    observacoes = case
      when observacoes is null then '[LGPD] Dados do titular anonimizados'
      else observacoes || E'\n[LGPD] Dados do titular anonimizados'
    end,
    atualizado_em = now()
  where contato_id = _contato_id;

  if _solicitacao_id is not null then
    update public.lgpd_solicitacoes set
      status = 'concluida',
      processado_por = v_uid,
      processado_em = now(),
      resposta = 'Contato anonimizado conforme solicitação.',
      atualizado_em = now()
    where id = _solicitacao_id;
  end if;

  insert into public.audit_logs (user_id, acao, entidade, entidade_id, detalhes)
  values (
    v_uid,
    'lgpd.anonimizar_contato',
    'contatos',
    _contato_id::text,
    jsonb_build_object('antes', v_antes, 'solicitacao_id', _solicitacao_id)
  );

  return jsonb_build_object('ok', true, 'contato_id', _contato_id);
end;
$fn$;

grant execute on function public.lgpd_anonimizar_contato(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Exportar dados do contato (portabilidade / acesso)
-- ---------------------------------------------------------------------------
create or replace function public.lgpd_exportar_contato(_contato_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_out jsonb;
begin
  if not public.is_admin_or_super(v_uid) then
    raise exception 'forbidden';
  end if;

  select jsonb_build_object(
    'exportado_em', now(),
    'contato', to_jsonb(c),
    'oportunidades', coalesce((
      select jsonb_agg(to_jsonb(o) order by o.criado_em desc)
      from public.oportunidades o where o.contato_id = c.id
    ), '[]'::jsonb),
    'tarefas', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.criado_em desc)
      from public.tarefas t where t.contato_id = c.id
    ), '[]'::jsonb),
    'conversas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cv.id,
        'telefone', cv.telefone,
        'nome_whatsapp', cv.nome_whatsapp,
        'canal', cv.canal,
        'ultimo_em', cv.ultimo_em
      ))
      from public.conversas cv where cv.contato_id = c.id
    ), '[]'::jsonb)
  ) into v_out
  from public.contatos c
  where c.id = _contato_id;

  if v_out is null then
    raise exception 'contato_not_found';
  end if;

  insert into public.audit_logs (user_id, acao, entidade, entidade_id, detalhes)
  values (
    v_uid,
    'lgpd.exportar_contato',
    'contatos',
    _contato_id::text,
    jsonb_build_object('bytes_approx', length(v_out::text))
  );

  return v_out;
end;
$fn$;

grant execute on function public.lgpd_exportar_contato(uuid) to authenticated;
