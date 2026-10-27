-- Players can save their own drawing layer on a coaching video without overwriting the coach's.
-- Player rows use video_key like "bunny:<id>#u:<user_id>" (or file:…#u:…).

drop policy if exists "coaching_video_annotations_insert" on public.coaching_video_annotations;
create policy "coaching_video_annotations_insert"
  on public.coaching_video_annotations
  for insert
  to authenticated
  with check (
    public.is_coach()
    or (
      student_id = auth.uid()
      and video_key like '%#u:' || auth.uid()::text
    )
  );

drop policy if exists "coaching_video_annotations_update" on public.coaching_video_annotations;
create policy "coaching_video_annotations_update"
  on public.coaching_video_annotations
  for update
  to authenticated
  using (
    public.is_coach()
    or (
      student_id = auth.uid()
      and video_key like '%#u:' || auth.uid()::text
    )
  )
  with check (
    public.is_coach()
    or (
      student_id = auth.uid()
      and video_key like '%#u:' || auth.uid()::text
    )
  );

drop policy if exists "coaching_video_annotations_delete" on public.coaching_video_annotations;
create policy "coaching_video_annotations_delete"
  on public.coaching_video_annotations
  for delete
  to authenticated
  using (
    public.is_coach()
    or (
      student_id = auth.uid()
      and video_key like '%#u:' || auth.uid()::text
    )
  );
