-- =================================================================
-- Responder mensagem no chat (citar/reply estilo WhatsApp).
--   mensagens.responde_a → wa_message_id da mensagem que está sendo citada
-- =================================================================

alter table public.mensagens
  add column if not exists responde_a text;
