-- Novos signups sempre entram como "usuario".
-- Super_admin só via promoção (tela Usuários) por quem já é super_admin.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, nome, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    new.email
  )
  on conflict (user_id) do update set
    nome = coalesce(excluded.nome, public.profiles.nome),
    email = coalesce(excluded.email, public.profiles.email);

  insert into public.user_roles (user_id, role)
  values (new.id, 'usuario')
  on conflict (user_id, role) do nothing;

  return new;
end $$;

revoke execute on function public.handle_new_user() from anon, public;
