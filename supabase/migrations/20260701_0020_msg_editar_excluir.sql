-- =================================================================
-- Editar / excluir mensagem no chat (reflete no WhatsApp via WAHA).
--   mensagens.excluida → mensagem apagada (para todos)
--   mensagens.editada  → mensagem editada
-- =================================================================

alter table public.mensagens
  add column if not exists excluida boolean not null default false,
  add column if not exists editada  boolean not null default false;
