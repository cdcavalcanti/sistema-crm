-- Instagram direto pela API do Meta (sem o gateway Chatwoot).
-- Mesmas tabelas conversas/mensagens, canal='instagram'. Dedup próprio:
--   conversas.instagram_user_id   → IGSID do usuário (uma conversa por pessoa)
--   mensagens.instagram_message_id → mid da mensagem no Instagram (dedup)

alter table public.conversas
  add column if not exists instagram_user_id text;

create unique index if not exists conversas_instagram_user_uidx
  on public.conversas (instagram_user_id)
  where instagram_user_id is not null;

alter table public.mensagens
  add column if not exists instagram_message_id text;

create unique index if not exists mensagens_instagram_msg_uidx
  on public.mensagens (instagram_message_id)
  where instagram_message_id is not null;
