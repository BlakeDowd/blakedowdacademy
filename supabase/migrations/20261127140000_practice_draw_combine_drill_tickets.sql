-- Enable in-app ticket earning: 1 hour practice, 1 combine, or 1 drill = 1 ticket.

update public.practice_draw_campaigns
set
  minutes_per_ticket = 60,
  earn_rules = jsonb_build_object(
    'practice_minutes_per_ticket', 60,
    'combine_tickets', 1,
    'drill_tickets', 1,
    'tool_tickets', 0
  )
where status = 'active';

-- If no active campaign exists yet, seed one.
insert into public.practice_draw_campaigns (
  title,
  prize,
  minutes_per_ticket,
  earn_rules,
  status
)
select
  'Community activity draw',
  '50% off a lesson',
  60,
  jsonb_build_object(
    'practice_minutes_per_ticket', 60,
    'combine_tickets', 1,
    'drill_tickets', 1,
    'tool_tickets', 0
  ),
  'active'
where not exists (
  select 1 from public.practice_draw_campaigns where status = 'active'
);

comment on table public.practice_draw_campaigns is
  'Community promo draws. Tickets: 60 practice minutes, or 1 combine, or 1 drill.';
