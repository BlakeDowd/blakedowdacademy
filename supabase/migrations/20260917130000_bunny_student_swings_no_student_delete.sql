-- Students must not be able to delete swing inbox rows (or anything via RLS delete).
-- Coaches delete through the API (service role / server), which also removes the Bunny video.
drop policy if exists "bunny_student_swings_delete_authenticated" on public.bunny_student_swings;

-- Keep select/insert/update for signed-in users so students can send swings.
-- Delete is intentionally omitted for the authenticated role.
revoke delete on public.bunny_student_swings from authenticated;
grant select, insert, update on public.bunny_student_swings to authenticated;
grant all on public.bunny_student_swings to service_role;
