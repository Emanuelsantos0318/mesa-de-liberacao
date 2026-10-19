-- Estado operacional de jejum, sem alterar prescrições ou decisões clínicas.
alter table public.admissions
  add column if not exists fasting_active boolean not null default false,
  add column if not exists fasting_started_at timestamptz,
  add column if not exists fasting_reason text not null default '',
  add column if not exists fasting_authorized_by uuid references public.profiles(id);

create index if not exists admissions_fasting_active_idx
  on public.admissions (fasting_active)
  where fasting_active;
