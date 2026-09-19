-- =================================================================
-- Instagram no chat, via Chatwoot como gateway.
--
-- O WhatsApp continua entrando pela WAHA (intocado). O Instagram é só
-- mais um CANAL: entra pelo webhook do Chatwoot (message_created),
-- é gravado nas MESMAS tabelas conversas/mensagens e aparece numa aba
-- separada no chat. O que distingue as abas é conversas.canal.
--
--   conversas.canal                    → 'whatsapp' | 'instagram'
--   conversas.chatwoot_conversation_id → id da conversa no Chatwoot (dedup)
--   conversas.chatwoot_inbox_id        → id da inbox (ex.: 228 = Instagram)
--   conversas.chatwoot_contact_id      → id do contato no Chatwoot
--   conversas.instagram_username       → @ do remetente (quando houver)
--   mensagens.chatwoot_message_id      → id da mensagem no Chatwoot (dedup)
-- =================================================================

alter table public.conversas
  add column if not exists canal                    text   not null default 'whatsapp',
  add column if not exists chatwoot_conversation_id bigint,
  add column if not exists chatwoot_inbox_id        bigint,
  add column if not exists chatwoot_contact_id      bigint,
  add column if not exists instagram_username       text;

-- Instagram não tem wa_chat_id (é exclusivo da WAHA). Deixa de ser obrigatório;
-- o UNIQUE original continua valendo para o WhatsApp (NULLs não conflitam).
alter table public.conversas alter column wa_chat_id drop not null;

-- Dedup de conversa por conversa do Chatwoot (uma linha por conversa Chatwoot).
create unique index if not exists conversas_chatwoot_conv_uidx
  on public.conversas (chatwoot_conversation_id)
  where chatwoot_conversation_id is not null;

-- A lista do chat filtra por canal (aba WhatsApp / aba Instagram).
create index if not exists conversas_canal_idx on public.conversas (canal);

alter table public.mensagens
  add column if not exists chatwoot_message_id bigint;

-- Dedup de mensagem por id do Chatwoot (equivalente ao wa_message_id da WAHA).
create unique index if not exists mensagens_chatwoot_msg_uidx
  on public.mensagens (chatwoot_message_id)
  where chatwoot_message_id is not null;
