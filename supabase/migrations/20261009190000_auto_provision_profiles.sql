-- Provisiona automaticamente um perfil do usuário quando o Auth cria uma conta nova.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, full_name, role, shift_name, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'Usuário'),
    case lower(coalesce(new.raw_user_meta_data->>'role', 'operador'))
      when 'operador' then 'operador'::public.user_role
      when 'supervisor' then 'supervisor'::public.user_role
      when 'administrador' then 'administrador'::public.user_role
      else 'operador'::public.user_role
    end,
    new.raw_user_meta_data->>'shift_name',
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
