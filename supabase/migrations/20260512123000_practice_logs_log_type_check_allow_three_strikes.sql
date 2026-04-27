-- Fix INSERT failures for new protocols like `three_strikes`:
--   new row for relation "practice_logs" violates check constraint "practice_logs_log_type_check" (23514)
--
-- Some deployments still carry an older strict CHECK list on `practice_logs.log_type`.
-- Replace it with a forward-compatible snake_case guard so new protocol ids can be added
-- without another DB migration every time.

alter table public.practice_logs
  drop constraint if exists practice_logs_log_type_check;

alter table public.practice_logs
  add constraint practice_logs_log_type_check
  check (
    log_type is not null
    and btrim(log_type) <> ''
    and log_type ~ '^[a-z][a-z0-9_]*$'
  );
