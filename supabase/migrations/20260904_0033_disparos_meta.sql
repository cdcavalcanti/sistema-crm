-- Disparos em massa de templates WhatsApp (Meta / Chatwoot Cloud)
-- Port do AI Assoc: campanha + destinatários por linha, envio espaçado.

create table if not exists public.disparos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  template text not null,
  template_idioma text not null,
  inbox_id integer not null,
  -- rascunho | enviando | concluido | cancelado
  status text not null default 'rascunho'
    check (status in ('rascunho', 'enviando', 'concluido', 'cancelado')),
  intervalo_min_s integer not null default 5
    check (intervalo_min_s >= 1 and intervalo_min_s <= 300),
  intervalo_max_s integer not null default 7
    check (intervalo_max_s >= 1 and intervalo_max_s <= 300),
  publico_tipo text not null default 'planilha'
    check (publico_tipo in ('planilha', 'filtro')),
  arquivo text,
  autor_email text,
  iniciado_em timestamptz,
  concluido_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (intervalo_max_s >= intervalo_min_s)
);

create index if not exists disparos_criado_idx
  on public.disparos (criado_em desc);

create index if not exists disparos_status_idx
  on public.disparos (status);

create table if not exists public.disparo_destinatarios (
  id uuid primary key default gen_random_uuid(),
  disparo_id uuid not null references public.disparos(id) on delete cascade,
  nome text not null,
  -- só dígitos com DDI
  telefone text not null,
  -- valores de {{1}}, {{2}}… já resolvidos
  variaveis jsonb not null default '[]'::jsonb,
  -- pendente | enviando | enviado | falhou | pulado
  status text not null default 'pendente'
    check (status in ('pendente', 'enviando', 'enviado', 'falhou', 'pulado')),
  externo_id text,
  conversa_id integer,
  erro text,
  enviado_em timestamptz,
  reservado_em timestamptz,
  contato_id uuid references public.contatos(id) on delete set null,
  unique (disparo_id, telefone)
);

create index if not exists disparo_destinatarios_fila_idx
  on public.disparo_destinatarios (disparo_id, status);

alter table public.disparos enable row level security;
alter table public.disparo_destinatarios enable row level security;

drop policy if exists disparos_select_auth on public.disparos;
create policy disparos_select_auth on public.disparos
  for select to authenticated using (true);

drop policy if exists disparos_insert_admin on public.disparos;
create policy disparos_insert_admin on public.disparos
  for insert to authenticated
  with check (public.is_admin_or_super(auth.uid()));

drop policy if exists disparos_update_admin on public.disparos;
create policy disparos_update_admin on public.disparos
  for update to authenticated
  using (public.is_admin_or_super(auth.uid()))
  with check (public.is_admin_or_super(auth.uid()));

drop policy if exists disparos_delete_admin on public.disparos;
create policy disparos_delete_admin on public.disparos
  for delete to authenticated
  using (public.is_admin_or_super(auth.uid()));

drop policy if exists disparo_dest_select_auth on public.disparo_destinatarios;
create policy disparo_dest_select_auth on public.disparo_destinatarios
  for select to authenticated using (true);

drop policy if exists disparo_dest_insert_admin on public.disparo_destinatarios;
create policy disparo_dest_insert_admin on public.disparo_destinatarios
  for insert to authenticated
  with check (public.is_admin_or_super(auth.uid()));

drop policy if exists disparo_dest_update_admin on public.disparo_destinatarios;
create policy disparo_dest_update_admin on public.disparo_destinatarios
  for update to authenticated
  using (public.is_admin_or_super(auth.uid()))
  with check (public.is_admin_or_super(auth.uid()));

drop policy if exists disparo_dest_delete_admin on public.disparo_destinatarios;
create policy disparo_dest_delete_admin on public.disparo_destinatarios
  for delete to authenticated
  using (public.is_admin_or_super(auth.uid()));

drop trigger if exists disparos_touch on public.disparos;
create trigger disparos_touch
  before update on public.disparos
  for each row execute function public.touch_atualizado_em();

drop trigger if exists audit_disparos on public.disparos;
create trigger audit_disparos
  after insert or update or delete on public.disparos
  for each row execute function public.audit_trigger();
