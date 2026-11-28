-- In-app notifications + Web Push subscriptions (PWA).

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('coaching', 'prize', 'challenge', 'system')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 280),
  href text check (href is null or char_length(href) <= 240),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists app_notifications_user_created_idx
  on public.app_notifications (user_id, created_at desc);

create index if not exists app_notifications_user_unread_idx
  on public.app_notifications (user_id)
  where read_at is null;

alter table public.app_notifications enable row level security;

drop policy if exists "app_notifications_select_own" on public.app_notifications;
create policy "app_notifications_select_own" on public.app_notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "app_notifications_update_own" on public.app_notifications;
create policy "app_notifications_update_own" on public.app_notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Inserts are done via service role from the notify API (or coaches via RPC below).
grant select, update on public.app_notifications to authenticated;
grant all on public.app_notifications to service_role;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (endpoint)
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_select_own" on public.push_subscriptions;
create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "push_subscriptions_insert_own" on public.push_subscriptions;
create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "push_subscriptions_update_own" on public.push_subscriptions;
create policy "push_subscriptions_update_own" on public.push_subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "push_subscriptions_delete_own" on public.push_subscriptions;
create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

comment on table public.app_notifications is
  'In-app notification inbox (coaching videos, prize winners, etc.).';
comment on table public.push_subscriptions is
  'Web Push endpoints for PWA lock-screen notifications.';
