-- IA operando DENTRO do CRM (tenant = esta instância).
-- Modo leitura (perguntas com citação) + modo ação (proposta até confirmar) +
-- automações por evento. Sem sistema paralelo.

-- ---------------------------------------------------------------------------
-- Configuração do tenant (uma linha)
-- ---------------------------------------------------------------------------
create table if not exists public.ia_tenant_config (
  id boolean primary key default true check (id),
  persona text not null default 'Você é a IA comercial deste CRM. Fale em português do Brasil, seja objetiva e só use dados que estão no sistema.',
  o_que_pode_prometer text not null default 'Não promete desconto, prazo de implantação nem entrega que o operador não confirmou. Não envia mensagem ao cliente sozinha neste corte.',
  regra_atribuicao text not null default 'fixo'
    check (regra_atribuicao in ('fixo', 'round_robin', 'origem')),
  responsavel_padrao text not null default 'Comercial',
  prazo_sem_resposta_horas integer not null default 24
    check (prazo_sem_resposta_horas between 1 and 720),
  dias_sem_atividade integer not null default 7
    check (dias_sem_atividade between 1 and 365),
  campanha_fria_aprovada boolean not null default false,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

insert into public.ia_tenant_config (id) values (true) on conflict (id) do nothing;

alter table public.ia_tenant_config enable row level security;

drop policy if exists ia_tenant_config_select on public.ia_tenant_config;
create policy ia_tenant_config_select on public.ia_tenant_config
  for select to authenticated using (true);

drop policy if exists ia_tenant_config_admin_write on public.ia_tenant_config;
create policy ia_tenant_config_admin_write on public.ia_tenant_config
  for all to authenticated
  using (public.is_admin_or_super(auth.uid()))
  with check (public.is_admin_or_super(auth.uid()));

drop trigger if exists ia_tenant_config_touch on public.ia_tenant_config;
create trigger ia_tenant_config_touch
  before update on public.ia_tenant_config
  for each row execute function public.touch_atualizado_em();

-- ---------------------------------------------------------------------------
-- Consultas (auditoria: provider + tenant + quem perguntou)
-- ---------------------------------------------------------------------------
create table if not exists public.ia_consultas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  modo text not null check (modo in ('leitura', 'acao', 'evento')),
  provider text not null default 'deterministico',
  modelo text,
  pergunta text,
  resposta text,
  citacoes jsonb not null default '[]'::jsonb,
  oportunidade_id uuid references public.oportunidades(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists ia_consultas_user_idx on public.ia_consultas (user_id, criado_em desc);
create index if not exists ia_consultas_opp_idx on public.ia_consultas (oportunidade_id, criado_em desc);

alter table public.ia_consultas enable row level security;

drop policy if exists ia_consultas_select on public.ia_consultas;
create policy ia_consultas_select on public.ia_consultas
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin_or_super(auth.uid()));

drop policy if exists ia_consultas_insert on public.ia_consultas;
create policy ia_consultas_insert on public.ia_consultas
  for insert to authenticated
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Propostas de escrita (nada grava no negócio até confirmar)
-- ---------------------------------------------------------------------------
create table if not exists public.ia_propostas (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references public.oportunidades(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pendente'
    check (status in ('pendente', 'confirmada', 'recusada', 'expirada')),
  perigo text not null default 'normal'
    check (perigo in ('normal', 'apagar', 'disparo_massa')),
  payload jsonb not null default '{}'::jsonb,
  afetados jsonb not null default '[]'::jsonb,
  confirmacao_explicita text,
  criado_em timestamptz not null default now(),
  resolvido_em timestamptz
);
create index if not exists ia_propostas_opp_idx on public.ia_propostas (oportunidade_id, criado_em desc);

alter table public.ia_propostas enable row level security;

drop policy if exists ia_propostas_select on public.ia_propostas;
create policy ia_propostas_select on public.ia_propostas
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_admin_or_super(auth.uid())
  );

drop policy if exists ia_propostas_insert on public.ia_propostas;
create policy ia_propostas_insert on public.ia_propostas
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists ia_propostas_update on public.ia_propostas;
create policy ia_propostas_update on public.ia_propostas
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

comment on table public.ia_tenant_config is
  'Persona e regras da IA deste tenant. Um registro por instância.';
comment on table public.ia_consultas is
  'Log de perguntas à IA: qual provider respondeu e de qual usuário/tenant.';
comment on table public.ia_propostas is
  'Sugestões de escrita. Só viram atividade/campo/etapa depois de confirmar.';
