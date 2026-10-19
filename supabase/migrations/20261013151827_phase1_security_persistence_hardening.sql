-- Fase 1: endurecimento do provisionamento de perfis e sincronização em tempo real.

-- O papel nunca é derivado de metadata controlada pelo usuário.
-- Novas contas entram como operador e só um administrador pode promover o perfil.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role, shift_name, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'Usuário'),
    'operador'::public.user_role,
    null,
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- Habilita as alterações das tabelas operacionais no canal Realtime do Supabase.
do $$
declare
  table_name text;
begin
  if to_regclass('pg_catalog.pg_publication') is null then
    return;
  end if;
  foreach table_name in array array['patients','admissions','diet_prescriptions','releases','movements'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
exception
  when undefined_object then
    null;
end;
$$;
