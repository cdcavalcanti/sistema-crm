-- Prévia da última mensagem na lista de conversas (estilo WhatsApp).
alter table public.conversas add column if not exists ultima_msg text;
