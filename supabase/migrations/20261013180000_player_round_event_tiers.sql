-- Players can pick the event tier (plus event name, course rating and slope) when they log their own round.
-- It counts straight away. Once a coach has tagged a round, only coaches can change it.
-- Run after 20261013160000_round_event_tiers.sql.

create or replace function public.rounds_protect_event_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_coach() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if old.event_set_by is not null and old.event_set_by is distinct from auth.uid() then
      new.event_tier := old.event_tier;
      new.event_name := old.event_name;
      new.course_rating := old.course_rating;
      new.slope_rating := old.slope_rating;
      new.event_set_by := old.event_set_by;
      new.event_set_at := old.event_set_at;
      return new;
    end if;
    if new.event_tier is not distinct from old.event_tier
      and new.event_name is not distinct from old.event_name
      and new.course_rating is not distinct from old.course_rating
      and new.slope_rating is not distinct from old.slope_rating then
      new.event_set_by := old.event_set_by;
      new.event_set_at := old.event_set_at;
      return new;
    end if;
  end if;

  if new.event_tier is null and new.event_name is null and new.course_rating is null and new.slope_rating is null then
    new.event_set_by := null;
    new.event_set_at := null;
  else
    new.event_set_by := auth.uid();
    new.event_set_at := now();
  end if;
  return new;
end;
$$;

comment on column public.rounds.event_tier is
  'club_comp (Stonecutters comps), regional, state (incl. JNJG), national. Null = social round (not counted). '
  'Players set it when logging; once a coach tags the round only coaches can change it.';

notify pgrst, 'reload schema';
