-- =================================================================
-- Libera EXCLUIR contato e oportunidade para qualquer usuário autenticado
-- (perfil "usuario" também), não apenas admin/super_admin.
-- =================================================================

drop policy if exists "contatos_delete_admin" on public.contatos;
create policy "contatos_delete_auth" on public.contatos
  for delete to authenticated using (true);

drop policy if exists "oportunidades_delete_admin" on public.oportunidades;
create policy "oportunidades_delete_auth" on public.oportunidades
  for delete to authenticated using (true);
