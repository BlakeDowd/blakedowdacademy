-- Coaches can add/update/delete drills from the app. Everyone can still read the catalog.

alter table public.drills enable row level security;

drop policy if exists "drills_select_public" on public.drills;
create policy "drills_select_public"
  on public.drills
  for select
  using (true);

drop policy if exists "drills_insert_authenticated" on public.drills;
drop policy if exists "drills_insert_coach" on public.drills;
create policy "drills_insert_coach"
  on public.drills
  for insert
  to authenticated
  with check (public.is_coach());

drop policy if exists "drills_update_authenticated" on public.drills;
drop policy if exists "drills_update_coach" on public.drills;
create policy "drills_update_coach"
  on public.drills
  for update
  to authenticated
  using (public.is_coach())
  with check (public.is_coach());

drop policy if exists "drills_delete_authenticated" on public.drills;
drop policy if exists "drills_delete_coach" on public.drills;
create policy "drills_delete_coach"
  on public.drills
  for delete
  to authenticated
  using (public.is_coach());
