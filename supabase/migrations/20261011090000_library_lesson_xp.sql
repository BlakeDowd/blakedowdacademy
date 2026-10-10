-- Completing a Library lesson earns the 50 XP the lesson card shows. Each completion row is
-- stamped with the XP it paid, so the award happens once per player per lesson and the backfill
-- below is safe to re-run. Requires drill_xp_apply from 20261008190000_drill_xp_awards.sql.

alter table public.library_lesson_completions add column if not exists xp integer;

create or replace function public.library_lesson_completions_award_xp()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.library_lesson_completions
     set xp = 50
   where user_id = new.user_id and lesson_id = new.lesson_id and xp is null;
  if found then
    perform public.drill_xp_apply(new.user_id, 50);
  end if;
  return null;
end;
$$;

-- AFTER INSERT so a repeat completion (upsert that skips the existing row) pays nothing.
drop trigger if exists library_lesson_completions_award_xp on public.library_lesson_completions;
create trigger library_lesson_completions_award_xp
  after insert on public.library_lesson_completions
  for each row execute function public.library_lesson_completions_award_xp();

-- Pay out lessons completed before this existed.
with paid as (
  update public.library_lesson_completions
     set xp = 50
   where xp is null
  returning user_id, xp
), totals as (
  select user_id, sum(xp)::integer as xp from paid group by user_id
)
update public.profiles p
   set total_xp = greatest(0, coalesce(p.total_xp, 0) + t.xp),
       current_level = public.xp_level(greatest(0, coalesce(p.total_xp, 0) + t.xp)::integer)
  from totals t
 where p.id = t.user_id;

notify pgrst, 'reload schema';
