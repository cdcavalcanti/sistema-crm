-- =================================================================
-- Sistema CRM — Padronização de campos de aluno e responsável
--
-- Mudanças:
--  1. contatos: adiciona nome_aluno e idade_aluno (campos do formulário)
--  2. oportunidades: adiciona responsavel (dono da oportunidade no CRM:
--     Comercial, CS, SDR, ...). Antes morava em contatos por engano.
--  3. Backfill: copia contatos.responsavel para todas as oportunidades
--     vinculadas que ainda não têm responsavel definido.
--  4. Remove contatos.responsavel.
-- =================================================================

alter table public.contatos
  add column if not exists nome_aluno text,
  add column if not exists idade_aluno smallint check (idade_aluno is null or idade_aluno between 0 and 25);

alter table public.oportunidades
  add column if not exists responsavel text;

create index if not exists oportunidades_responsavel_idx on public.oportunidades(responsavel);

-- Backfill responsavel das oportunidades a partir dos contatos vinculados.
-- Se o mesmo contato tem várias oportunidades, todas herdam o mesmo responsavel.
update public.oportunidades o
set responsavel = c.responsavel
from public.contatos c
where o.contato_id = c.id
  and c.responsavel is not null
  and o.responsavel is null;

-- Remove a coluna antiga, agora que os dados foram migrados.
alter table public.contatos drop column if exists responsavel;
