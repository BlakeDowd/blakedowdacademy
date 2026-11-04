-- Per-test grade marks (3 / 5 / 7 / 10-hole) + grade on each attempt.

alter table public.cadet_curriculum_weeks
  add column if not exists test_grade_marks jsonb;

comment on column public.cadet_curriculum_weeks.test_grade_marks is
  'JSON array of {id,label,mark} grade bands for 3/5/7/10-hole. Higher-is-better: score >= mark. Strokes: score <= mark.';

alter table public.cadet_module_test_results
  add column if not exists grade text;

-- Prefer hole-group grades; 042000 tightens the check if an older colour-belt constraint was applied.
do $$
begin
  alter table public.cadet_module_test_results
    drop constraint if exists cadet_module_test_results_grade_check;
exception
  when undefined_object then null;
end $$;

alter table public.cadet_module_test_results
  drop constraint if exists cadet_module_test_results_grade_check;

alter table public.cadet_module_test_results
  add constraint cadet_module_test_results_grade_check
  check (
    grade is null
    or grade in ('3', '5', '7', '10')
  );

comment on column public.cadet_module_test_results.grade is
  'Auto-ranked pathway grade (3/5/7/10-hole) from test_grade_marks for this attempt.';

notify pgrst, 'reload schema';
