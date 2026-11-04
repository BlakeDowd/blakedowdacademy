-- Grade bands are pathway hole groups (3 / 5 / 7 / 10), not colour belts.

comment on column public.cadet_curriculum_weeks.test_grade_marks is
  'JSON array of {id,label,mark} grade bands for 3/5/7/10-hole. Higher-is-better: score >= mark. Strokes: score <= mark.';

-- Remap any colour-belt ids already saved on curriculum weeks.
update public.cadet_curriculum_weeks
set test_grade_marks = (
  select jsonb_agg(
    jsonb_build_object(
      'id',
      case coalesce(elem->>'id', '')
        when 'white' then '3'
        when 'yellow' then '5'
        when 'blue' then '7'
        when 'red' then '10'
        else elem->>'id'
      end,
      'label',
      case coalesce(elem->>'id', '')
        when 'white' then '3-hole'
        when 'yellow' then '5-hole'
        when 'blue' then '7-hole'
        when 'red' then '10-hole'
        when '3' then '3-hole'
        when '5' then '5-hole'
        when '7' then '7-hole'
        when '10' then '10-hole'
        else coalesce(elem->>'label', elem->>'id')
      end,
      'mark',
      (elem->>'mark')::numeric
    )
    order by ord
  )
  from jsonb_array_elements(coalesce(test_grade_marks, '[]'::jsonb)) with ordinality as t(elem, ord)
)
where test_grade_marks is not null
  and jsonb_typeof(test_grade_marks) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(test_grade_marks) e
    where e->>'id' in ('white', 'yellow', 'blue', 'red')
  );

-- Remap logged attempt grades.
update public.cadet_module_test_results
set grade = case grade
  when 'white' then '3'
  when 'yellow' then '5'
  when 'blue' then '7'
  when 'red' then '10'
  else grade
end
where grade in ('white', 'yellow', 'blue', 'red');

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
