-- Let players correct the earned date on their own trophies (the app backdates
-- earned_at to the entry that first met the requirement).
drop policy if exists "Users can update own trophies" on public.user_trophies;
create policy "Users can update own trophies"
  on public.user_trophies
  for update
  using (auth.uid()::text = user_id::text)
  with check (auth.uid()::text = user_id::text);
