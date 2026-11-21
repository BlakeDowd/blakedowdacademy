-- Course par for logged rounds so players can record score relative to par
-- for whichever course they played (not the "holes made at par" counter).

alter table public.rounds
  add column if not exists course_par smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rounds_course_par_range'
  ) then
    alter table public.rounds
      add constraint rounds_course_par_range
      check (course_par is null or (course_par between 27 and 90));
  end if;
end $$;

comment on column public.rounds.course_par is
  'Total par for the course played (e.g. 72). Used with score for to-par.';
