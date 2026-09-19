-- =================================================================
-- Sistema CRM — Log de entradas (captação)
--
-- Auditoria das submissões que entram pelas integrações em código
-- (site/LP e Meta Lead Ads), substituindo as tabelas de log dos fluxos
-- n8n legados. Guarda o payload bruto e o vínculo com o
-- contato/oportunidade criados.
-- =================================================================

create table public.entradas_log (
  id uuid primary key default gen_random_uuid(),
  canal text not null,                 -- site | meta
  origem text,                         -- form_name / campanha / formulário
  payload jsonb not null default '{}'::jsonb,
  contato_id uuid references public.contatos(id) on delete set null,
  oportunidade_id uuid references public.oportunidades(id) on delete set null,
  erro text,                           -- preenchido se a criação falhou
  ip text,
  criado_em timestamptz not null default now()
);
alter table public.entradas_log enable row level security;
create index entradas_log_criado_idx on public.entradas_log(criado_em desc);
create index entradas_log_canal_idx on public.entradas_log(canal);

-- Só admin/super leem o log (auditoria). Inserção é feita pelas Edge
-- Functions com service role (bypassa RLS).
create policy "entradas_log_select_admin" on public.entradas_log for select
  to authenticated using (public.is_admin_or_super(auth.uid()));
