-- Per-test grading: numeric pass mark used to auto-grade attempts.

alter table public.cadet_curriculum_weeks
  add column if not exists test_pass_mark numeric
  check (test_pass_mark is null or test_pass_mark >= 0);

comment on column public.cadet_curriculum_weeks.test_pass_mark is
  'Numeric pass threshold. For makes/count/streak: score >= mark passes. For strokes: score <= mark passes. Null = coach grades manually.';

comment on column public.cadet_curriculum_weeks.test_standard is
  'Written grading guidelines / pass criteria shown to coaches when logging attempts.';

notify pgrst, 'reload schema';
