-- Verificação não destrutiva das invariantes de segurança do schema remoto.
-- Execute com: supabase db query --linked --file supabase/tests/rls_policy_inventory.sql
do $$
declare
  missing_rls text;
  missing_policy text;
  missing_audit_trigger boolean;
  missing_release_metadata boolean;
begin
  select string_agg(format('%I.%I', schemaname, tablename), ', ' order by tablename)
    into missing_rls
  from pg_tables
  where schemaname = 'public'
    and tablename in ('profiles', 'patients', 'admissions', 'diet_prescriptions', 'releases', 'movements', 'audit_events')
    and not rowsecurity;

  if missing_rls is not null then
    raise exception 'tables_without_rls: %', missing_rls;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_events'
      and policyname = 'supervisors view audit'
  ) then
    raise exception 'missing_audit_read_policy';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'administrators update profiles'
  ) then
    raise exception 'missing_profile_admin_update_policy';
  end if;

  select not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'movements'
      and t.tgname = 'audit_movements'
      and not t.tgisinternal
  ) into missing_audit_trigger;

  if missing_audit_trigger then
    raise exception 'missing_movements_audit_trigger';
  end if;

  select count(*) < 6
    into missing_release_metadata
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'releases'
    and column_name in ('printed_at', 'printed_by', 'delivered_at', 'delivered_by', 'cancelled_at', 'cancelled_by');

  if missing_release_metadata then
    raise exception 'missing_release_status_metadata';
  end if;
end;
$$;

select 'rls_policy_inventory_ok' as result;
