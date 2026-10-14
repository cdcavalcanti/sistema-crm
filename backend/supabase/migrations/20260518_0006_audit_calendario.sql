-- =================================================================
-- Audit trigger em calendario_eventos.
--
-- Captura todas as mudanças nessa tabela, independente da origem:
--   - Sync com Google Calendar (lista/cria/edita/remove via UI Calendário)
--   - Webhook /leads com origem=agendamento_site (cacheia o evento)
--   - Modificações diretas via SQL
--
-- A função audit_trigger() já existente é genérica — só precisamos
-- adicionar o trigger nessa tabela. Os events vão aparecer em /admin/logs
-- como calendario_eventos.criado / editado / excluido.
-- =================================================================

drop trigger if exists audit_calendario_eventos on public.calendario_eventos;

create trigger audit_calendario_eventos
  after insert or update or delete on public.calendario_eventos
  for each row execute function public.audit_trigger();
