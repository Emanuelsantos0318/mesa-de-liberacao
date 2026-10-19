-- O fluxo de transferência atualiza a internação; persistir esse instante.
alter table public.admissions
  add column if not exists updated_at timestamptz not null default now();

update public.admissions
set updated_at = coalesce(updated_at, started_at, now())
where updated_at is null;
