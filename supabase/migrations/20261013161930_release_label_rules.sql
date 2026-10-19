-- Regras de impressão: destino da refeição e quantidade de etiquetas.
alter table public.releases
  add column if not exists audience text not null default 'patient'
    check (audience in ('patient', 'companion')),
  add column if not exists label_copies integer not null default 1
    check (label_copies between 1 and 3);

-- Lanche reforçado sempre gera três etiquetas; as demais refeições permanecem
-- com uma, salvo uma solicitação explícita de acompanhante.
update public.releases
set label_copies = 3
where lower(meal_name) = 'lanche reforçado'
  and label_copies = 1;

create index if not exists releases_audience_queue_idx
  on public.releases(audience, status, exit_at);
