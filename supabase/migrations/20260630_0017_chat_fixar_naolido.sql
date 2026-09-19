-- =================================================================
-- Ações de conversa no chat: Fixar e Marcar como não lido.
--   conversas.fixada           → conversa fixada no topo da lista
--   conversas.nao_lida_manual  → marcada manualmente como não lida
-- =================================================================

alter table public.conversas
  add column if not exists fixada          boolean not null default false,
  add column if not exists nao_lida_manual boolean not null default false;

create index if not exists conversas_fixada_idx on public.conversas(fixada) where fixada;
