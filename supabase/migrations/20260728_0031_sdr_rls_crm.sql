-- =================================================================
-- IA SDR — RLS para o CRM (authenticated) nas tabelas já existentes
-- no projeto compartilhado (criadas pelo bootstrap do SDR).
--
-- Tabelas: dados_conversa, historico_mensagens, pausar_ia
-- CRM: SELECT em todas; INSERT/DELETE em pausar_ia (pause/resume).
-- Escrita de leads/histórico continua via service_role (RPCs do SDR).
-- =================================================================

-- Garante publicação Realtime (handoff watcher no CRM)
do $$
begin
  begin
    alter publication supabase_realtime add table public.dados_conversa;
  exception when duplicate_object then null;
  end;
end $$;

-- Policies: drop-if-exists para reexecução segura
drop policy if exists dados_conversa_select_auth on public.dados_conversa;
drop policy if exists historico_mensagens_select_auth on public.historico_mensagens;
drop policy if exists pausar_ia_select_auth on public.pausar_ia;
drop policy if exists pausar_ia_insert_auth on public.pausar_ia;
drop policy if exists pausar_ia_delete_auth on public.pausar_ia;

create policy dados_conversa_select_auth
  on public.dados_conversa
  for select to authenticated
  using (true);

create policy historico_mensagens_select_auth
  on public.historico_mensagens
  for select to authenticated
  using (true);

create policy pausar_ia_select_auth
  on public.pausar_ia
  for select to authenticated
  using (true);

create policy pausar_ia_insert_auth
  on public.pausar_ia
  for insert to authenticated
  with check (true);

create policy pausar_ia_delete_auth
  on public.pausar_ia
  for delete to authenticated
  using (true);

-- Índice útil para o CRM casar telefone (últimos dígitos via ilike no app)
create index if not exists dados_conversa_telefone_idx
  on public.dados_conversa (telefone);
