-- Remarketing / recuperação Sistema CRM
--
-- Port da Vai Xorá (fila + campanha de template), adaptado ao schema local:
--   • etapas.tipo: inicial | andamento | ganho | perdido | remarketing
--   • oportunidades.responsavel é texto (não uuid)
--   • sem unidades
--
-- Cron promove leads parados 7 dias em etapa aberta (inicial/andamento)
-- para a etapa tipo=remarketing. A mensagem NÃO sai sozinha — humano aprova.

-- ---------------------------------------------------------------------------
-- 1) Etapa de remarketing como tipo estável
-- ---------------------------------------------------------------------------
update public.etapas
   set tipo = 'remarketing'
 where lower(nome) in ('follow-up / remarketing', 'remarketing', 'follow-up');

-- ---------------------------------------------------------------------------
-- 2) Desde quando o lead está nesta etapa
-- ---------------------------------------------------------------------------
alter table public.oportunidades
  add column if not exists etapa_desde timestamptz;

-- Zera o cronômetro de propósito (não joga a fila histórica no dia 1).
update public.oportunidades set etapa_desde = now() where etapa_desde is null;

alter table public.oportunidades
  alter column etapa_desde set default now();

create index if not exists oportunidades_etapa_desde_idx
  on public.oportunidades (etapa_desde);

create or replace function public.oportunidades_marcar_etapa_desde()
returns trigger
language plpgsql
as $fn$
begin
  if tg_op = 'INSERT' then
    new.etapa_desde := coalesce(new.etapa_desde, now());
  elsif new.etapa_id is distinct from old.etapa_id then
    new.etapa_desde := now();
  end if;
  return new;
end;
$fn$;

drop trigger if exists oportunidades_etapa_desde on public.oportunidades;
create trigger oportunidades_etapa_desde
  before insert or update on public.oportunidades
  for each row execute function public.oportunidades_marcar_etapa_desde();

-- ---------------------------------------------------------------------------
-- 3) Fila de recuperação
-- ---------------------------------------------------------------------------
create table if not exists public.remarketing_acoes (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid not null references public.oportunidades(id) on delete cascade,
  -- 'ligacao' = vendedor liga; 'ia' = mensagem template no WhatsApp
  tipo text not null check (tipo in ('ligacao', 'ia')),
  status text not null default 'pendente'
    check (status in ('pendente', 'concluida', 'cancelada')),
  -- espelho do texto oportunidades.responsavel (quem deve ligar)
  responsavel text,
  etapa_origem text,
  dias_parado integer,
  observacao text,
  concluida_em timestamptz,
  concluida_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists remarketing_acoes_pendente_unica
  on public.remarketing_acoes (oportunidade_id)
  where status = 'pendente';

create index if not exists remarketing_acoes_fila_idx
  on public.remarketing_acoes (status, criado_em desc);

alter table public.remarketing_acoes enable row level security;

drop policy if exists remarketing_acoes_select_auth on public.remarketing_acoes;
create policy remarketing_acoes_select_auth on public.remarketing_acoes
  for select to authenticated using (true);

drop policy if exists remarketing_acoes_update_auth on public.remarketing_acoes;
create policy remarketing_acoes_update_auth on public.remarketing_acoes
  for update to authenticated using (true) with check (true);

drop policy if exists remarketing_acoes_insert_admin on public.remarketing_acoes;
create policy remarketing_acoes_insert_admin on public.remarketing_acoes
  for insert to authenticated
  with check (public.is_admin_or_super(auth.uid()));

drop trigger if exists remarketing_acoes_touch on public.remarketing_acoes;
create trigger remarketing_acoes_touch
  before update on public.remarketing_acoes
  for each row execute function public.touch_atualizado_em();

drop trigger if exists audit_remarketing_acoes on public.remarketing_acoes;
create trigger audit_remarketing_acoes
  after insert or update or delete on public.remarketing_acoes
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- 4) Entrou em Remarketing → nasce a ação
-- ---------------------------------------------------------------------------
create or replace function public.remarketing_abrir_acao()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  tipo_novo   text;
  tipo_antigo text;
  nome_origem text;
  dias        integer;
  tem_resp    boolean;
begin
  select tipo into tipo_novo from public.etapas where id = new.etapa_id;
  select tipo, nome into tipo_antigo, nome_origem
  from public.etapas where id = old.etapa_id;

  if coalesce(tipo_antigo, 'andamento') = 'remarketing'
     and coalesce(tipo_novo, 'andamento') <> 'remarketing' then
    update public.remarketing_acoes
       set status = 'cancelada',
           observacao = coalesce(observacao, 'Cliente voltou a interagir antes do contato')
     where oportunidade_id = new.id and status = 'pendente';
    return null;
  end if;

  if coalesce(tipo_novo, 'andamento') <> 'remarketing' then
    return null;
  end if;

  if new.etapa_id is not distinct from old.etapa_id then
    return null;
  end if;

  dias := greatest(
    0,
    extract(day from now() - coalesce(old.etapa_desde, new.criado_em))::integer
  );

  tem_resp := nullif(trim(coalesce(new.responsavel, '')), '') is not null;

  insert into public.remarketing_acoes (
    oportunidade_id, tipo, responsavel, etapa_origem, dias_parado
  )
  values (
    new.id,
    case when tem_resp then 'ligacao' else 'ia' end,
    nullif(trim(coalesce(new.responsavel, '')), ''),
    nome_origem,
    dias
  )
  on conflict do nothing;

  return null;
end;
$fn$;

drop trigger if exists remarketing_abrir_acao on public.oportunidades;
create trigger remarketing_abrir_acao
  after update on public.oportunidades
  for each row execute function public.remarketing_abrir_acao();

-- ---------------------------------------------------------------------------
-- 5) Campanha (template Meta da recuperação)
-- ---------------------------------------------------------------------------
create table if not exists public.remarketing_campanha (
  id boolean primary key default true check (id),
  ativo boolean not null default false,
  template_nome text,
  template_idioma text,
  template_params jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);

insert into public.remarketing_campanha (id) values (true) on conflict (id) do nothing;

alter table public.remarketing_campanha enable row level security;

drop policy if exists remarketing_campanha_select on public.remarketing_campanha;
create policy remarketing_campanha_select on public.remarketing_campanha
  for select to authenticated using (true);

drop policy if exists remarketing_campanha_admin_write on public.remarketing_campanha;
create policy remarketing_campanha_admin_write on public.remarketing_campanha
  for all to authenticated
  using (public.is_admin_or_super(auth.uid()))
  with check (public.is_admin_or_super(auth.uid()));

drop trigger if exists remarketing_campanha_touch on public.remarketing_campanha;
create trigger remarketing_campanha_touch
  before update on public.remarketing_campanha
  for each row execute function public.touch_atualizado_em();

drop trigger if exists audit_remarketing_campanha on public.remarketing_campanha;
create trigger audit_remarketing_campanha
  after insert or delete or update on public.remarketing_campanha
  for each row execute function public.audit_trigger();

-- ---------------------------------------------------------------------------
-- 6) Régua horária: 7 dias parado em etapa aberta → remarketing
-- ---------------------------------------------------------------------------
do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'promote-stale-to-remarketing';
    perform cron.schedule(
      'promote-stale-to-remarketing',
      '0 * * * *',
      $job$
        update public.oportunidades o
        set etapa_id = (
          select id from public.etapas
          where tipo = 'remarketing'
          order by ordem
          limit 1
        )
        where o.etapa_desde < now() - interval '7 days'
          and coalesce(
            (select e.tipo from public.etapas e where e.id = o.etapa_id),
            'andamento'
          ) in ('inicial', 'andamento')
          and exists (select 1 from public.etapas where tipo = 'remarketing');
      $job$
    );
  end if;
end;
$cron$;

notify pgrst, 'reload schema';
