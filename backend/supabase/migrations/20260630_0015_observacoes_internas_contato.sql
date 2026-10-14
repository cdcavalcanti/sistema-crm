-- =================================================================
-- Observações internas do contato.
--   Campo livre, de uso interno da equipe, separado do campo
--   `observacoes` já existente. Permite anotar contexto sensível
--   sem misturar com as observações gerais do contato.
-- =================================================================

alter table public.contatos
  add column if not exists observacoes_internas text;

comment on column public.contatos.observacoes_internas is
  'Observações internas da equipe sobre o contato (uso interno).';
