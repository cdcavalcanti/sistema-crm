-- Adiciona metadados em tarefas para contexto externo (n8n, integrações).
alter table public.tarefas
  add column if not exists metadados jsonb not null default '{}'::jsonb;
