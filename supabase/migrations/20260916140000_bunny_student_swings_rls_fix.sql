-- Ensure bunny_student_swings RLS allows signed-in users to save Send-to-Blake swings.
alter table public.bunny_student_swings enable row level security;

drop policy if exists "bunny_student_swings_select_authenticated" on public.bunny_student_swings;
create policy "bunny_student_swings_select_authenticated"
  on public.bunny_student_swings
  for select
  to authenticated
  using (true);

drop policy if exists "bunny_student_swings_insert_authenticated" on public.bunny_student_swings;
create policy "bunny_student_swings_insert_authenticated"
  on public.bunny_student_swings
  for insert
  to authenticated
  with check (true);

drop policy if exists "bunny_student_swings_update_authenticated" on public.bunny_student_swings;
create policy "bunny_student_swings_update_authenticated"
  on public.bunny_student_swings
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "bunny_student_swings_delete_authenticated" on public.bunny_student_swings;
create policy "bunny_student_swings_delete_authenticated"
  on public.bunny_student_swings
  for delete
  to authenticated
  using (true);

grant select, insert, update, delete on public.bunny_student_swings to authenticated;
grant all on public.bunny_student_swings to service_role;
