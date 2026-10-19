-- Aligns the operational patient schema with the app model used by the release board.
alter table public.patients
  add column if not exists ward text,
  add column if not exists wing text,
  add column if not exists bed text,
  add column if not exists diet text,
  add column if not exists restrictions text not null default '',
  add column if not exists companion_name text,
  add column if not exists status public.admission_status not null default 'ativo';

update public.patients
set ward = coalesce(ward, ''),
    wing = coalesce(wing, ''),
    bed = coalesce(bed, ''),
    diet = coalesce(diet, ''),
    restrictions = coalesce(restrictions, ''),
    companion_name = coalesce(companion_name, ''),
    status = coalesce(status, 'ativo')
where ward is null or wing is null or bed is null or diet is null or restrictions is null or companion_name is null or status is null;
