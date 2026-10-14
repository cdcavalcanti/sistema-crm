-- Snapshots de mídia (Meta Ads / Google Ads) enviados pela plataforma de
-- indicadores. A aba /indicadores cruza isso com o funil deste tenant.
-- Sem puxar API de anúncio daqui: a plataforma empurra o recorte.

create table if not exists public.indicadores_ads (
  id uuid primary key default gen_random_uuid(),
  plataforma text not null check (plataforma in ('meta_ads', 'google_ads')),
  periodo_inicio date not null,
  periodo_fim date not null,
  conta_id text,
  conta_nome text,
  campanha_id text,
  campanha_nome text,
  investimento numeric,
  impressoes bigint,
  alcance bigint,
  cliques bigint,
  ctr numeric,
  cpc numeric,
  cpl numeric,
  cpm numeric,
  conversoes numeric,
  leads_plataforma numeric,
  receita_ads numeric,
  roas numeric,
  fonte text not null default 'plataforma',
  payload jsonb not null default '{}'::jsonb,
  coletado_em timestamptz not null default now(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists indicadores_ads_plataforma_coletado
  on public.indicadores_ads (plataforma, coletado_em desc);

create index if not exists indicadores_ads_periodo
  on public.indicadores_ads (plataforma, periodo_inicio, periodo_fim);

alter table public.indicadores_ads enable row level security;

drop policy if exists indicadores_ads_select on public.indicadores_ads;
create policy indicadores_ads_select on public.indicadores_ads
  for select to authenticated using (true);

drop policy if exists indicadores_ads_admin on public.indicadores_ads;
create policy indicadores_ads_admin on public.indicadores_ads
  for all to authenticated
  using (public.is_admin_or_super(auth.uid()))
  with check (public.is_admin_or_super(auth.uid()));

drop trigger if exists indicadores_ads_touch on public.indicadores_ads;
create trigger indicadores_ads_touch
  before update on public.indicadores_ads
  for each row execute function public.touch_atualizado_em();
