-- Fase 2: invariantes de consistência para leitos e liberações.

-- Um leito só pode ter uma internação aberta por vez. Leitos vazios não
-- participam do índice para permitir cadastro incompleto durante a triagem.
create unique index if not exists one_open_admission_per_bed
  on public.admissions (
    lower(btrim(ward)),
    lower(btrim(wing)),
    lower(btrim(bed))
  )
  where ended_at is null
    and nullif(btrim(ward), '') is not null
    and nullif(btrim(wing), '') is not null
    and nullif(btrim(bed), '') is not null;

-- A liberação deve apontar para uma prescrição da mesma internação.
create or replace function private.validate_release_links()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.diet_prescriptions prescription
    where prescription.id = new.prescription_id
      and prescription.admission_id = new.admission_id
  ) then
    raise exception 'release_prescription_admission_mismatch';
  end if;

  if not exists (
    select 1
    from public.admissions admission
    where admission.id = new.admission_id
      and admission.ended_at is null
  ) then
    raise exception 'release_admission_is_closed';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_release_links() from public, anon, authenticated;
drop trigger if exists validate_release_links on public.releases;
create constraint trigger validate_release_links
after insert or update of admission_id, prescription_id on public.releases
deferrable initially deferred
for each row execute function private.validate_release_links();

comment on index public.one_open_admission_per_bed is
  'Garante um paciente por leito/ala/enfermaria enquanto a internação estiver aberta.';
