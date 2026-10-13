-- Deleting a profile failed with: record "old" has no field "student_id".
-- PL/pgSQL doesn't short-circuit `tg_table_name = 'coaching_spaces' and old.student_id ...`, so the
-- profiles trigger read a column profiles doesn't have. Check the table first, then the column.

create or replace function public.coaching_assignments_follow_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.student_id is null and new.student_id is not null then
      update public.coaching_assignments set student_id = new.student_id where student_id = new.id;
    end if;
    return new;
  end if;
  if tg_table_name = 'coaching_spaces' then
    if old.student_id is not null then
      return old;
    end if;
  end if;
  delete from public.coaching_assignments where student_id = old.id;
  return old;
end;
$$;
