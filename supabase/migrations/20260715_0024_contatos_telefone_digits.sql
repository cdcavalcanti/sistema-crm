-- Coluna normalizada (só dígitos) do telefone, para casar contatos
-- independentemente da formatação salva. Sem isso, "43 92000-6823" (cadastro
-- manual) e "+5543920006823" (Meta) não batem no dedup por últimos 8 dígitos,
-- gerando contatos duplicados da MESMA pessoa.
alter table public.contatos
  add column if not exists telefone_digits text
  generated always as (regexp_replace(coalesce(telefone, ''), '\D', '', 'g')) stored;

create index if not exists idx_contatos_telefone_digits
  on public.contatos (telefone_digits);
