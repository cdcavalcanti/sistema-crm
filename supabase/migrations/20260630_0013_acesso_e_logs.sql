-- =================================================================
-- Controle de acesso de usuários + melhoria nos logs de auditoria
--   1. profiles.ultimo_acesso  → última vez que o usuário acessou
--   2. audit_logs.actor_nome    → nome do usuário (além do e-mail) nos logs
--   3. log_event passa a gravar o nome do ator
--   4. RPC registrar_acesso()   → atualiza ultimo_acesso e grava log de login
-- =================================================================

-- 1. Último acesso por usuário
alter table public.profiles
  add column if not exists ultimo_acesso timestamptz;

-- 2. Nome do ator nos logs (facilita identificar "quem mexeu")
alter table public.audit_logs
  add column if not exists actor_nome text;

-- 3. log_event agora resolve o nome do ator a partir de profiles
create or replace function public.log_event(_acao text, _entidade text, _entidade_id text, _detalhes jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  _email text;
  _nome text;
begin
  select email into _email from auth.users where id = auth.uid();
  select nome into _nome from public.profiles where user_id = auth.uid();
  insert into public.audit_logs (user_id, actor_email, actor_nome, acao, entidade, entidade_id, detalhes)
  values (auth.uid(), _email, _nome, _acao, _entidade, _entidade_id, coalesce(_detalhes, '{}'::jsonb));
end $$;

revoke execute on function public.log_event(text, text, text, jsonb) from anon, public;

-- 4. registrar_acesso: chamado no login para marcar o acesso e logar o evento
create or replace function public.registrar_acesso()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return;
  end if;
  update public.profiles
    set ultimo_acesso = now()
    where user_id = auth.uid();
  perform public.log_event('acesso.login', 'auth.users', auth.uid()::text, '{}'::jsonb);
end $$;

revoke execute on function public.registrar_acesso() from anon, public;
grant execute on function public.registrar_acesso() to authenticated;
