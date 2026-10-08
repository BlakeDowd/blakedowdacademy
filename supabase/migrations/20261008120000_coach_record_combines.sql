-- Coaches can run a combine with a player in a lesson and save the result to the player's profile.
-- recorded_by keeps who entered the row (the coach for lesson tests, otherwise the player).

alter table public.practice
  add column if not exists recorded_by uuid default auth.uid() references auth.users (id) on delete set null;

alter table public.practice_logs
  add column if not exists recorded_by uuid default auth.uid() references auth.users (id) on delete set null;

drop policy if exists "practice_insert_own" on public.practice;
create policy "practice_insert_own"
  on public.practice
  for insert
  to authenticated
  with check (
    recorded_by is not distinct from auth.uid()
    and (auth.uid() = user_id or public.is_coach())
  );

drop policy if exists "practice_logs_insert_own" on public.practice_logs;
create policy "practice_logs_insert_own"
  on public.practice_logs
  for insert
  to authenticated
  with check (
    recorded_by is not distinct from auth.uid()
    and (auth.uid() = user_id or public.is_coach())
  );
