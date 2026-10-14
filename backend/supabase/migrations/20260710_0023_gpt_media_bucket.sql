-- Bucket público para as imagens geradas pelo Assistente IA (gpt-image-1).
-- Leitura pública via URL; escrita só pela Edge Function (service role).
insert into storage.buckets (id, name, public)
values ('gpt-media', 'gpt-media', true)
on conflict (id) do update set public = true;
