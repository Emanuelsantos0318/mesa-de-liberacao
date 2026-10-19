-- Corrective hardening based on Supabase Database Advisors.
-- Event-trigger functions are not part of the public RPC surface.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

create index releases_printed_by_idx on public.releases(printed_by);
create index releases_delivered_by_idx on public.releases(delivered_by);
create index releases_cancelled_by_idx on public.releases(cancelled_by);

-- Avoid overlapping permissive SELECT policies caused by FOR ALL.
drop policy "operators manage patients" on public.patients;
create policy "operators insert patients" on public.patients for insert to authenticated with check ((select private.can_write_operational()));
create policy "operators update patients" on public.patients for update to authenticated using ((select private.can_write_operational())) with check ((select private.can_write_operational()));
create policy "operators delete patients" on public.patients for delete to authenticated using ((select private.can_write_operational()));

drop policy "operators manage admissions" on public.admissions;
create policy "operators insert admissions" on public.admissions for insert to authenticated with check ((select private.can_write_operational()));
create policy "operators update admissions" on public.admissions for update to authenticated using ((select private.can_write_operational())) with check ((select private.can_write_operational()));
create policy "operators delete admissions" on public.admissions for delete to authenticated using ((select private.can_write_operational()));

drop policy "operators manage diets" on public.diet_prescriptions;
create policy "operators insert diets" on public.diet_prescriptions for insert to authenticated with check ((select private.can_write_operational()));
create policy "operators update diets" on public.diet_prescriptions for update to authenticated using ((select private.can_write_operational())) with check ((select private.can_write_operational()));
create policy "operators delete diets" on public.diet_prescriptions for delete to authenticated using ((select private.can_write_operational()));

drop policy "operators manage releases" on public.releases;
create policy "operators insert releases" on public.releases for insert to authenticated with check ((select private.can_write_operational()));
create policy "operators update releases" on public.releases for update to authenticated using ((select private.can_write_operational())) with check ((select private.can_write_operational()));
create policy "operators delete releases" on public.releases for delete to authenticated using ((select private.can_write_operational()));

drop policy "administrators manage profiles" on public.profiles;
create policy "administrators insert profiles" on public.profiles for insert to authenticated with check ((select private.is_administrator()));
create policy "administrators update profiles" on public.profiles for update to authenticated using ((select private.is_administrator())) with check ((select private.is_administrator()));
create policy "administrators delete profiles" on public.profiles for delete to authenticated using ((select private.is_administrator()));
