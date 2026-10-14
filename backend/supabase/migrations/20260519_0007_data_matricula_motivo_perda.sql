-- =================================================================
-- Sistema CRM — Data da Matrícula (Ganho) e Motivo de Perda (Perdido)
--
--  1. data_matricula: preenchida quando a oportunidade é movida para uma
--     etapa do tipo 'ganho' (pop-up pede a data, default = hoje).
--  2. motivo_perda: preenchido quando movida para uma etapa do tipo
--     'perdido' (Select padronizado: Preço / mensalidade, Escolheu outra
--     escola, Mudou de cidade).
-- =================================================================

alter table public.oportunidades
  add column if not exists data_matricula date,
  add column if not exists motivo_perda text;

create index if not exists oportunidades_data_matricula_idx on public.oportunidades(data_matricula);
create index if not exists oportunidades_motivo_perda_idx on public.oportunidades(motivo_perda);
