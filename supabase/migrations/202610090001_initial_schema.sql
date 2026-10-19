-- Mesa de Liberação: schema inicial, criado para Supabase/PostgreSQL.
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;

create type public.user_role as enum ('operador', 'supervisor', 'administrador');
create type public.admission_status as enum ('ativo', 'suspenso', 'alta', 'obito');
create type public.release_status as enum ('pendente', 'impresso', 'entregue', 'cancelado');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.user_role not null default 'operador',
  shift_name text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.patients (
  id uuid primary key default gen_random_uuid(),
  hospital_record text not null unique,
  full_name text not null,
  birth_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admissions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id),
  ward text not null, wing text not null, bed text not null,
  status public.admission_status not null default 'ativo',
  companion_name text,
  started_at timestamptz not null default now(), ended_at timestamptz,
  created_by uuid not null references public.profiles(id),
  check ((status in ('alta', 'obito')) = (ended_at is not null))
);
create unique index one_open_admission_per_patient on public.admissions(patient_id) where ended_at is null;
create index admissions_patient_id_idx on public.admissions(patient_id);
create index admissions_created_by_idx on public.admissions(created_by);

create table public.diet_prescriptions (
  id uuid primary key default gen_random_uuid(),
  admission_id uuid not null references public.admissions(id),
  diet_name text not null,
  restrictions text not null default '',
  requester_name text not null,
  active boolean not null default true,
  effective_at timestamptz not null default now(),
  replaced_at timestamptz,
  created_by uuid not null references public.profiles(id)
);
create unique index one_active_diet_per_admission on public.diet_prescriptions(admission_id) where active;
create index diet_prescriptions_admission_id_idx on public.diet_prescriptions(admission_id);
create index diet_prescriptions_created_by_idx on public.diet_prescriptions(created_by);

create table public.releases (
  id uuid primary key default gen_random_uuid(),
  admission_id uuid not null references public.admissions(id),
  prescription_id uuid not null references public.diet_prescriptions(id),
  meal_name text not null,
  exit_at timestamptz not null,
  status public.release_status not null default 'pendente',
  requester_name text not null,
  notes text not null default '',
  printed_at timestamptz, printed_by uuid references public.profiles(id),
  delivered_at timestamptz, delivered_by uuid references public.profiles(id),
  cancelled_at timestamptz, cancelled_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id)
);
create index releases_queue_idx on public.releases(exit_at, status);
create index releases_admission_id_idx on public.releases(admission_id);
create index releases_prescription_id_idx on public.releases(prescription_id);
create index releases_created_by_idx on public.releases(created_by);

create table public.movements (
  id uuid primary key default gen_random_uuid(),
  admission_id uuid not null references public.admissions(id),
  movement_type text not null check (movement_type in ('admissao','transferencia','suspensao','reativacao','alta','obito')),
  details jsonb not null default '{}', created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id)
);
create index movements_admission_id_idx on public.movements(admission_id);
create index movements_created_by_idx on public.movements(created_by);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(), actor_id uuid references public.profiles(id),
  table_name text not null, record_id uuid not null, action text not null,
  before_data jsonb, after_data jsonb, created_at timestamptz not null default now()
);
create index audit_events_record_idx on public.audit_events(table_name, record_id, created_at desc);
create index audit_events_actor_id_idx on public.audit_events(actor_id);

create or replace function private.audit_row() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_events(actor_id, table_name, record_id, action, before_data, after_data)
  values (auth.uid(), tg_table_name, coalesce(new.id, old.id), tg_op, to_jsonb(old), to_jsonb(new));
  return coalesce(new, old);
end; $$;
revoke all on function private.audit_row() from public, anon, authenticated;
create trigger audit_patients after insert or update or delete on public.patients for each row execute function private.audit_row();
create trigger audit_admissions after insert or update or delete on public.admissions for each row execute function private.audit_row();
create trigger audit_diets after insert or update or delete on public.diet_prescriptions for each row execute function private.audit_row();
create trigger audit_releases after insert or update or delete on public.releases for each row execute function private.audit_row();

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.admissions enable row level security;
alter table public.diet_prescriptions enable row level security;
alter table public.releases enable row level security;
alter table public.movements enable row level security;
alter table public.audit_events enable row level security;

create or replace function private.can_read_operational() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and active);
$$;
create or replace function private.can_write_operational() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and active and role in ('operador', 'administrador'));
$$;
create or replace function private.can_view_audit() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and active and role in ('supervisor', 'administrador'));
$$;
create or replace function private.is_administrator() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles where id = (select auth.uid()) and active and role = 'administrador');
$$;
revoke all on function private.can_read_operational() from public, anon;
revoke all on function private.can_write_operational() from public, anon;
revoke all on function private.can_view_audit() from public, anon;
revoke all on function private.is_administrator() from public, anon;
grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

grant usage on schema public to authenticated;
grant select, insert, update on public.patients, public.admissions, public.diet_prescriptions, public.releases, public.movements to authenticated;
grant select on public.profiles, public.audit_events to authenticated;
create policy "authorized staff read patients" on public.patients for select to authenticated using ((select private.can_read_operational()));
create policy "operators manage patients" on public.patients for all to authenticated using ((select private.can_write_operational())) with check ((select private.can_write_operational()));
create policy "authorized staff read admissions" on public.admissions for select to authenticated using ((select private.can_read_operational()));
create policy "operators manage admissions" on public.admissions for all to authenticated using ((select private.can_write_operational())) with check ((select private.can_write_operational()));
create policy "authorized staff read diets" on public.diet_prescriptions for select to authenticated using ((select private.can_read_operational()));
create policy "operators manage diets" on public.diet_prescriptions for all to authenticated using ((select private.can_write_operational())) with check ((select private.can_write_operational()));
create policy "authorized staff read releases" on public.releases for select to authenticated using ((select private.can_read_operational()));
create policy "operators manage releases" on public.releases for all to authenticated using ((select private.can_write_operational())) with check ((select private.can_write_operational()));
create policy "authorized staff read movements" on public.movements for select to authenticated using ((select private.can_read_operational()));
create policy "operators create movements" on public.movements for insert to authenticated with check ((select private.can_write_operational()));
create policy "users view their profile" on public.profiles for select to authenticated using (id = (select auth.uid()) or (select private.is_administrator()));
create policy "administrators manage profiles" on public.profiles for all to authenticated using ((select private.is_administrator())) with check ((select private.is_administrator()));
create policy "supervisors view audit" on public.audit_events for select to authenticated using ((select private.can_view_audit()));
