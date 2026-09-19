-- =================================================================
-- Sistema CRM — nome_aluno e idade_aluno na oportunidade
--
-- Justificativa: a mesma família (mesmo email = mesmo contato) pode
-- ter vários alunos (irmãos), cada um com sua oportunidade. Manter
-- nome_aluno/idade_aluno só em contatos sobrescreveria o primeiro
-- irmão quando o segundo entrasse.
--
-- Estratégia: manter os campos em ambos.
--   - contatos.{nome_aluno, idade_aluno, serie_interesse}  → "último/principal"
--   - oportunidades.{nome_aluno, idade_aluno, interesse}   → específico da negociação
--
-- A coluna oportunidades.interesse já existia e passa a representar
-- oficialmente a "Turma" daquela oportunidade.
-- =================================================================

alter table public.oportunidades
  add column if not exists nome_aluno text,
  add column if not exists idade_aluno smallint check (idade_aluno is null or idade_aluno between 0 and 25);

create index if not exists oportunidades_nome_aluno_idx on public.oportunidades(nome_aluno);

-- Backfill inicial: oportunidades herdam os dados do contato vinculado.
update public.oportunidades o
set
  nome_aluno = coalesce(o.nome_aluno, c.nome_aluno),
  idade_aluno = coalesce(o.idade_aluno, c.idade_aluno)
from public.contatos c
where o.contato_id = c.id
  and (c.nome_aluno is not null or c.idade_aluno is not null);
