-- CRM: idade_aluno passa a representar "anos de operação" (0–100).
-- Mantém o nome da coluna; só amplia o check constraint.

alter table contatos drop constraint if exists contatos_idade_aluno_check;
alter table contatos
  add constraint contatos_idade_aluno_check
  check (idade_aluno is null or idade_aluno between 0 and 100);

alter table oportunidades drop constraint if exists oportunidades_idade_aluno_check;
alter table oportunidades
  add constraint oportunidades_idade_aluno_check
  check (idade_aluno is null or idade_aluno between 0 and 100);
