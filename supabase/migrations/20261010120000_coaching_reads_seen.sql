-- "Seen" on coaching posts: a player can see when coaches last opened their space,
-- and coaches can see when any player last opened theirs. Writes stay limited to your own row.

drop policy if exists "coaching_reads_space_select" on public.coaching_reads;
create policy "coaching_reads_space_select"
  on public.coaching_reads for select to authenticated
  using (student_id = auth.uid() or public.is_coach());

notify pgrst, 'reload schema';
