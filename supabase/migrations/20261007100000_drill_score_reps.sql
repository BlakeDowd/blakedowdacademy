-- Optional attempts per logged session (balls hit, putts taken...), shown on every drill.
-- Today's target still moves on the score alone.

alter table public.drill_score_logs add column if not exists reps integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'drill_score_logs_reps_nonnegative'
  ) then
    alter table public.drill_score_logs
      add constraint drill_score_logs_reps_nonnegative check (reps is null or reps >= 0);
  end if;
end $$;

notify pgrst, 'reload schema';
