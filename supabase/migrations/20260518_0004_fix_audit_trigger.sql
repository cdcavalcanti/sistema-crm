-- =================================================================
-- Fix: audit_trigger() referenciava OLD.etapa_id estaticamente, o que
-- quebra UPDATEs em tabelas sem essa coluna (contatos, tarefas, etc.):
--   ERROR: record "old" has no field "etapa_id"
--
-- Solução: usar to_jsonb(old)->>'etapa_id' (acesso JSON dinâmico que
-- retorna NULL se o campo não existir), em vez de OLD.etapa_id.
-- =================================================================

create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  _acao text;
  _id text;
  _det jsonb;
  _old_etapa text;
  _new_etapa text;
begin
  if tg_op = 'INSERT' then
    _acao := tg_table_name || '.criado';
    _id := (to_jsonb(new)->>'id');
    _det := jsonb_build_object('novo', to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    _acao := tg_table_name || '.editado';
    _id := (to_jsonb(new)->>'id');
    _det := jsonb_build_object('antigo', to_jsonb(old), 'novo', to_jsonb(new));
    if tg_table_name = 'oportunidades' then
      _old_etapa := to_jsonb(old)->>'etapa_id';
      _new_etapa := to_jsonb(new)->>'etapa_id';
      if _old_etapa is distinct from _new_etapa then
        _acao := 'oportunidades.movida';
        _det := _det || jsonb_build_object(
          'etapa_origem', _old_etapa,
          'etapa_destino', _new_etapa
        );
      end if;
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

revoke execute on function public.audit_trigger() from anon, public;
