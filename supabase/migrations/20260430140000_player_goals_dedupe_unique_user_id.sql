-- Goals "never save": PostgREST upsert(..., onConflict: 'user_id') needs a UNIQUE/PK on user_id.
-- If the table was created with a surrogate primary key, each save INSERTs another row and
-- .maybeSingle() fails — the UI then treats the load as "no row" and resets the form.

DELETE FROM public.player_goals a
WHERE EXISTS (
  SELECT 1
  FROM public.player_goals b
  WHERE b.user_id = a.user_id
    AND (
      b.updated_at > a.updated_at
      OR (b.updated_at IS NOT DISTINCT FROM a.updated_at AND b.ctid > a.ctid)
    )
);

DO $$
BEGIN
  ALTER TABLE public.player_goals ADD CONSTRAINT player_goals_user_id_uniq UNIQUE (user_id);
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

NOTIFY pgrst, 'reload schema';
