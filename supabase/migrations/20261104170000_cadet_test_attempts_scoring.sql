-- Cadet tests: multiple attempts per student/term + coach scoring style (like drills).

alter table public.cadet_curriculum_weeks
  add column if not exists test_score_type text
  check (
    test_score_type is null
    or test_score_type in ('makes', 'count', 'streak', 'strokes', 'completion')
  );

comment on column public.cadet_curriculum_weeks.test_score_type is
  'How the module test is scored: makes (out of max), count, streak, strokes (lower better), completion.';

-- Allow many attempts: drop one-row-per-term uniqueness (name may vary).
do $$
declare
  cname text;
begin
  for cname in
    select conname
    from pg_constraint
    where conrelid = 'public.cadet_module_test_results'::regclass
      and contype = 'u'
  loop
    execute format('alter table public.cadet_module_test_results drop constraint %I', cname);
  end loop;
end $$;

-- Optional attempts within the logged session (balls / puts / tries), like drill reps.
alter table public.cadet_module_test_results
  add column if not exists attempts smallint
  check (attempts is null or attempts between 1 and 500);

create index if not exists cadet_module_test_results_attempts_idx
  on public.cadet_module_test_results (curriculum_week_id, player_id, program_year, term, created_at desc);

notify pgrst, 'reload schema';
