-- Lock swing files and legacy swing tables to "the student it belongs to, plus coaches".
-- Previously any signed-in user could read (and in places delete) every student's files and rows.
-- Server routes use the service role, so downloads and deletes keep working.

-- swing-submissions: raw copies of student swing videos, stored as "{student_id}/{video}.ext".
drop policy if exists "swing_submissions_select_authenticated" on storage.objects;
drop policy if exists "swing_submissions_insert_authenticated" on storage.objects;
drop policy if exists "swing_submissions_delete_authenticated" on storage.objects;
drop policy if exists "swing_submissions_select_own_or_coach" on storage.objects;
drop policy if exists "swing_submissions_insert_own_or_coach" on storage.objects;
drop policy if exists "swing_submissions_update_own_or_coach" on storage.objects;
drop policy if exists "swing_submissions_delete_coach" on storage.objects;

create policy "swing_submissions_select_own_or_coach"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'swing-submissions'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_coach())
  );

create policy "swing_submissions_insert_own_or_coach"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'swing-submissions'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_coach())
  );

-- Uploads use upsert, which needs update on the student's own files.
create policy "swing_submissions_update_own_or_coach"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'swing-submissions'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_coach())
  )
  with check (
    bucket_id = 'swing-submissions'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_coach())
  );

create policy "swing_submissions_delete_coach"
  on storage.objects for delete to authenticated
  using (bucket_id = 'swing-submissions' and public.is_coach());

-- coach-feedback: legacy coach uploads, stored as "{student_id}/...".
drop policy if exists "coach_feedback_select_authenticated" on storage.objects;
drop policy if exists "coach_feedback_insert_authenticated" on storage.objects;
drop policy if exists "coach_feedback_delete_authenticated" on storage.objects;
drop policy if exists "coach_feedback_select_own_or_coach" on storage.objects;
drop policy if exists "coach_feedback_insert_coach" on storage.objects;
drop policy if exists "coach_feedback_delete_coach" on storage.objects;

create policy "coach_feedback_select_own_or_coach"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'coach-feedback'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_coach())
  );

create policy "coach_feedback_insert_coach"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'coach-feedback' and public.is_coach());

create policy "coach_feedback_delete_coach"
  on storage.objects for delete to authenticated
  using (bucket_id = 'coach-feedback' and public.is_coach());

-- coach_swing_feedback (legacy table, now mirrored in coaching_posts).
drop policy if exists "coach_swing_feedback_select_own_or_authenticated" on public.coach_swing_feedback;
drop policy if exists "coach_swing_feedback_insert_authenticated" on public.coach_swing_feedback;
drop policy if exists "coach_swing_feedback_delete_authenticated" on public.coach_swing_feedback;
drop policy if exists "coach_swing_feedback_select_own_or_coach" on public.coach_swing_feedback;
drop policy if exists "coach_swing_feedback_insert_coach" on public.coach_swing_feedback;
drop policy if exists "coach_swing_feedback_delete_coach" on public.coach_swing_feedback;

create policy "coach_swing_feedback_select_own_or_coach"
  on public.coach_swing_feedback for select to authenticated
  using (student_id = auth.uid() or public.is_coach());

create policy "coach_swing_feedback_insert_coach"
  on public.coach_swing_feedback for insert to authenticated
  with check (public.is_coach());

create policy "coach_swing_feedback_delete_coach"
  on public.coach_swing_feedback for delete to authenticated
  using (public.is_coach());

-- bunny_student_swings: students see and write only their own swing records.
drop policy if exists "bunny_student_swings_select_authenticated" on public.bunny_student_swings;
drop policy if exists "bunny_student_swings_insert_authenticated" on public.bunny_student_swings;
drop policy if exists "bunny_student_swings_update_authenticated" on public.bunny_student_swings;
drop policy if exists "bunny_student_swings_select_own_or_coach" on public.bunny_student_swings;
drop policy if exists "bunny_student_swings_insert_own_or_coach" on public.bunny_student_swings;
drop policy if exists "bunny_student_swings_update_own_or_coach" on public.bunny_student_swings;

create policy "bunny_student_swings_select_own_or_coach"
  on public.bunny_student_swings for select to authenticated
  using (uploaded_by = auth.uid() or public.is_coach());

create policy "bunny_student_swings_insert_own_or_coach"
  on public.bunny_student_swings for insert to authenticated
  with check (uploaded_by = auth.uid() or public.is_coach());

create policy "bunny_student_swings_update_own_or_coach"
  on public.bunny_student_swings for update to authenticated
  using (uploaded_by = auth.uid() or public.is_coach())
  with check (uploaded_by = auth.uid() or public.is_coach());

-- student_swings: old pre-Bunny table, no longer used by the app. Coaches only.
drop policy if exists "student_swings_select_authenticated" on public.student_swings;
drop policy if exists "student_swings_delete_authenticated" on public.student_swings;
drop policy if exists "student_swings_select_coach" on public.student_swings;
drop policy if exists "student_swings_delete_coach" on public.student_swings;

create policy "student_swings_select_coach"
  on public.student_swings for select to authenticated
  using (public.is_coach());

create policy "student_swings_delete_coach"
  on public.student_swings for delete to authenticated
  using (public.is_coach());

notify pgrst, 'reload schema';
