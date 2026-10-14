-- =================================================================
-- "Reportar problema" resiliente.
--   Antes o botão dependia exclusivamente da Edge Function
--   `melhoria-problema`. Quando ela não está publicada, o supabase-js
--   falha no preflight e o CRM mostra:
--       "Failed to send a request to the Edge Function".
--   Agora o report é gravado direto no banco (RPC) e a notificação ao
--   grupo é garantida pelo cron `melhorias-monitor` (que já está no ar).
-- =================================================================

alter table public.melhorias
  add column if not exists problema_reportado_em  timestamptz,
  add column if not exists problema_reportado_por text,
  add column if not exists problema_notificado_em timestamptz;  -- quando o aviso chegou no grupo (controla retry/duplicidade)

-- RPC chamada pelo botão "Reportar problema". Não depende de Edge Function:
-- grava o report (idempotente) e deixa a notificação a cargo do monitor.
create or replace function public.reportar_problema_melhoria(_melhoria_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  _email text;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  select email into _email from auth.users where id = auth.uid();

  -- Só marca na primeira vez; cliques repetidos são idempotentes.
  update public.melhorias
     set problema_reportado_em  = now(),
         problema_reportado_por = _email,
         problema_notificado_em = null
   where id = _melhoria_id
     and problema_reportado_em is null;

  -- Valida que a melhoria existe (sem vazar nada além do necessário).
  if not exists (select 1 from public.melhorias where id = _melhoria_id) then
    raise exception 'melhoria_nao_encontrada';
  end if;
end $$;

revoke execute on function public.reportar_problema_melhoria(uuid) from anon, public;
grant  execute on function public.reportar_problema_melhoria(uuid) to authenticated;
