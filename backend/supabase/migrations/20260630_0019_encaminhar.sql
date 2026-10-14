-- =================================================================
-- Encaminhar mensagem no chat (forward estilo WhatsApp).
--   mensagens.encaminhada → marca mensagens que foram encaminhadas
-- =================================================================

alter table public.mensagens
  add column if not exists encaminhada boolean not null default false;
