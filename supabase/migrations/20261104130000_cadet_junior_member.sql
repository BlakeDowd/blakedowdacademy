-- Cadet pathway top step: Junior Member (above 10-hole).

alter table public.cadet_enrollments
  add column if not exists is_junior_member boolean not null default false;

notify pgrst, 'reload schema';
