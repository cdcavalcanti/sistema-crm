-- =================================================================
-- Grupos no chat de WhatsApp.
--   conversas.eh_grupo          → marca conversas de grupo (@g.us)
--   mensagens.remetente_*       → em grupos, quem enviou cada mensagem
-- =================================================================

alter table public.conversas
  add column if not exists eh_grupo boolean not null default false;

alter table public.mensagens
  add column if not exists remetente_nome     text,
  add column if not exists remetente_telefone text,
  add column if not exists remetente_foto     text;
