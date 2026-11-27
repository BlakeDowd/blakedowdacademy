-- Own booking (Acuity replacement) paid with Square.
-- Kinds: appointment, package, voucher today.
-- digital and subscription are reserved for online lessons and app access later.
-- The browser never talks to these tables. The app's server uses the service role.

create table if not exists public.booking_settings (
  id int primary key default 1 check (id = 1),
  timezone text not null default 'Australia/Sydney',
  slot_minutes int not null default 30 check (slot_minutes in (15, 30, 60)),
  buffer_minutes int not null default 15 check (buffer_minutes between 0 and 180),
  min_notice_minutes int not null default 120 check (min_notice_minutes between 0 and 10080),
  horizon_days int not null default 60 check (horizon_days between 1 and 365),
  -- Open times inside this window are cheaper when that day is still under half full.
  discount_within_days int not null default 3 check (discount_within_days between 0 and 30),
  discount_percent int not null default 20 check (discount_percent between 0 and 80),
  noshow_fee_cents int not null default 5000 check (noshow_fee_cents between 0 and 50000),
  location_label text not null default 'Stonecutters Ridge Golf Club',
  updated_at timestamptz not null default now()
);

insert into public.booking_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.booking_offers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  kind text not null check (kind in ('appointment', 'package', 'voucher', 'digital', 'subscription')),
  list_group text not null default 'lesson' check (list_group in ('lesson', 'voucher', 'shop')),
  redeems_offer_id uuid references public.booking_offers (id),
  credits int not null default 1 check (credits > 0),
  duration_minutes int check (duration_minutes is null or duration_minutes > 0),
  price_cents int not null check (price_cents >= 0),
  currency text not null default 'AUD',
  capacity int not null default 1 check (capacity > 0),
  active boolean not null default true,
  sort_order int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.booking_hours (
  id uuid primary key default gen_random_uuid(),
  weekday int not null check (weekday between 0 and 6),
  start_minute int not null check (start_minute between 0 and 1440),
  end_minute int not null check (end_minute between 0 and 1440),
  active boolean not null default true,
  check (end_minute > start_minute)
);

create table if not exists public.booking_blocks (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.booking_customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  phone text,
  newsletter_opt_in boolean not null default false,
  newsletter_opt_in_at timestamptz,
  profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.booking_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.booking_customers (id),
  offer_id uuid not null references public.booking_offers (id),
  kind text not null check (kind in ('appointment', 'package', 'voucher', 'digital', 'subscription')),
  amount_cents int not null check (amount_cents >= 0),
  list_price_cents int,
  currency text not null default 'AUD',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded')),
  purpose text not null default 'booking' check (purpose in ('booking', 'noshow')),
  newsletter_opt_in boolean not null default false,
  summary text,
  recipient_name text,
  recipient_email text,
  square_payment_link_id text,
  square_order_id text,
  square_payment_id text,
  checkout_url text,
  credit_code text,
  booking_id uuid,
  attention boolean not null default false,
  emailed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.booking_offers (id),
  customer_id uuid not null references public.booking_customers (id),
  order_id uuid references public.booking_orders (id),
  credit_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null check (status in ('held', 'confirmed', 'cancelled', 'expired', 'completed', 'noshow')),
  fee_order_id uuid,
  hold_expires_at timestamptz,
  note text,
  cancel_token text not null unique,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

alter table public.booking_orders
  drop constraint if exists booking_orders_booking_id_fkey;

alter table public.booking_orders
  add constraint booking_orders_booking_id_fkey
  foreign key (booking_id) references public.bookings (id);

create table if not exists public.booking_credits (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  offer_id uuid not null references public.booking_offers (id),
  source_offer_id uuid references public.booking_offers (id),
  order_id uuid references public.booking_orders (id),
  buyer_id uuid references public.booking_customers (id),
  recipient_name text,
  recipient_email text,
  remaining int not null check (remaining >= 0),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists booking_credits_code_key on public.booking_credits (upper(code));

alter table public.bookings
  drop constraint if exists bookings_fee_order_id_fkey;

alter table public.bookings
  add constraint bookings_fee_order_id_fkey
  foreign key (fee_order_id) references public.booking_orders (id);

alter table public.bookings
  drop constraint if exists bookings_credit_id_fkey;

alter table public.bookings
  add constraint bookings_credit_id_fkey
  foreign key (credit_id) references public.booking_credits (id);

-- Online lessons and app memberships land here when those sales are turned on.
create table if not exists public.booking_entitlements (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.booking_customers (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  offer_id uuid references public.booking_offers (id),
  kind text not null check (kind in ('digital', 'subscription')),
  status text not null default 'active' check (status in ('active', 'expired', 'cancelled')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  order_id uuid references public.booking_orders (id),
  created_at timestamptz not null default now()
);

create index if not exists booking_orders_square_order_idx
  on public.booking_orders (square_order_id);

create index if not exists bookings_starts_idx
  on public.bookings (starts_at desc);

create index if not exists bookings_status_starts_idx
  on public.bookings (status, starts_at);

-- Monday–Saturday, 8:00 am to 5:00 pm Sydney. Change these in the app.
insert into public.booking_hours (weekday, start_minute, end_minute, active)
select d, 8 * 60, 17 * 60, true
from generate_series(1, 6) as d
where not exists (select 1 from public.booking_hours);

insert into public.booking_offers
  (slug, name, description, kind, list_group, credits, duration_minutes, price_cents, capacity, sort_order)
values
  ('hour', '1 hour lesson', 'A private lesson for whatever is getting in the way: contact, direction, wedges, or putting.', 'appointment', 'lesson', 1, 60, 16000, 1, 10),
  ('two-hour', '2 hour lesson', 'More time on the same visit when you want to cover the full swing and the short game.', 'appointment', 'lesson', 1, 120, 28000, 1, 20),
  ('beginner', 'Beginner clinic', 'One hour if you are new, rusty, or not sure a full lesson is for you yet.', 'appointment', 'lesson', 1, 60, 3000, 1, 30),
  ('junior', 'Junior lesson', 'For golfers under 18. The session matches their age, and it is meant to be fun as well as useful.', 'appointment', 'lesson', 1, 60, 10000, 1, 40),
  ('on-course', 'On-course lesson', 'A playing lesson at Stonecutters Ridge. You pick a window and Blake arranges the tee time.', 'appointment', 'lesson', 1, 120, 28000, 1, 50),
  ('pack-5', '5 lesson pack', 'Five hours of coaching. You get a code and book each hour when it suits you.', 'package', 'lesson', 5, null, 70000, 1, 60),
  ('junior-pack', 'Junior pack', 'Three junior lessons. $60 less than booking them one by one. Book each one with the code.', 'package', 'lesson', 3, null, 24000, 1, 70),
  ('voucher-hour', '1 hour lesson', 'A private lesson they can use when it suits them.', 'voucher', 'voucher', 1, null, 16000, 1, 110),
  ('voucher-two-hour', '2 hour lesson', 'More time in one visit, for the full swing and the short game.', 'voucher', 'voucher', 1, null, 28000, 1, 120),
  ('voucher-pack-5', '5 lesson package', 'Five hours of coaching, for someone who wants a run of lessons.', 'voucher', 'voucher', 5, null, 70000, 1, 130),
  ('voucher-junior', 'Junior lesson', 'For a golfer under 18.', 'voucher', 'voucher', 1, null, 10000, 1, 140),
  ('voucher-junior-pack', 'Junior pack', 'Three junior lessons. $60 less than buying them one by one.', 'voucher', 'voucher', 3, null, 24000, 1, 150),
  ('voucher-on-course', 'On-course lesson', 'A playing lesson at Stonecutters Ridge, with a cart. Blake arranges the tee time.', 'voucher', 'voucher', 1, null, 28000, 1, 160)
on conflict (slug) do nothing;

update public.booking_offers as o
set redeems_offer_id = r.id
from public.booking_offers r
where o.redeems_offer_id is null
  and (
    (o.slug in ('pack-5', 'voucher-hour', 'voucher-pack-5') and r.slug = 'hour')
    or (o.slug in ('junior-pack', 'voucher-junior', 'voucher-junior-pack') and r.slug = 'junior')
    or (o.slug = 'voucher-two-hour' and r.slug = 'two-hour')
    or (o.slug = 'voucher-on-course' and r.slug = 'on-course')
  );

alter table public.booking_settings enable row level security;
alter table public.booking_offers enable row level security;
alter table public.booking_hours enable row level security;
alter table public.booking_blocks enable row level security;
alter table public.booking_customers enable row level security;
alter table public.booking_orders enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_credits enable row level security;
alter table public.booking_entitlements enable row level security;

revoke all on public.booking_settings from anon, authenticated;
revoke all on public.booking_offers from anon, authenticated;
revoke all on public.booking_hours from anon, authenticated;
revoke all on public.booking_blocks from anon, authenticated;
revoke all on public.booking_customers from anon, authenticated;
revoke all on public.booking_orders from anon, authenticated;
revoke all on public.bookings from anon, authenticated;
revoke all on public.booking_credits from anon, authenticated;
revoke all on public.booking_entitlements from anon, authenticated;

create or replace function public.booking_checkout(
  p_offer_slug text,
  p_start timestamptz,
  p_name text,
  p_email text,
  p_phone text,
  p_note text,
  p_credit_code text,
  p_recipient_name text,
  p_recipient_email text,
  p_newsletter boolean
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_settings public.booking_settings%rowtype;
  v_offer public.booking_offers%rowtype;
  v_customer_id uuid;
  v_order_id uuid;
  v_booking_id uuid;
  v_credit public.booking_credits%rowtype;
  v_local timestamp;
  v_dow int;
  v_minute int;
  v_end timestamptz;
  v_same int;
  v_other int;
  v_name text;
  v_email text;
  v_phone text;
  v_note text;
  v_summary text;
  v_recipient_name text;
  v_recipient_email text;
  v_token text;
  v_price int;
  v_spots int;
  v_booked int;
  v_quiet boolean;
  v_newsletter boolean;
begin
  perform pg_advisory_xact_lock(481516234);

  update public.bookings b
     set status = 'expired'
   where b.status = 'held'
     and b.hold_expires_at is not null
     and b.hold_expires_at < now()
     and not exists (
       select 1
         from public.booking_orders o
        where o.id = b.order_id
          and o.status = 'pending'
          and o.square_order_id is not null
     );

  select * into v_settings from public.booking_settings where id = 1;
  if not found then
    raise exception 'Booking is not set up yet.';
  end if;

  select * into v_offer
    from public.booking_offers
   where slug = trim(p_offer_slug)
     and active
   limit 1;
  if not found then
    raise exception 'That lesson is not available.';
  end if;

  if v_offer.kind in ('digital', 'subscription') then
    raise exception 'That is not on sale yet.';
  end if;

  v_name := trim(coalesce(p_name, ''));
  v_email := lower(trim(coalesce(p_email, '')));
  v_phone := nullif(trim(coalesce(p_phone, '')), '');
  v_note := nullif(left(trim(coalesce(p_note, '')), 400), '');
  v_newsletter := coalesce(p_newsletter, false);
  if char_length(v_name) < 2 or position('@' in v_email) < 2 then
    raise exception 'Add your name and email.';
  end if;

  insert into public.booking_customers (name, email, phone, newsletter_opt_in, newsletter_opt_in_at)
  values (
    v_name,
    v_email,
    v_phone,
    v_newsletter,
    case when v_newsletter then now() else null end
  )
  on conflict (email) do update
    set name = excluded.name,
        phone = coalesce(excluded.phone, public.booking_customers.phone),
        newsletter_opt_in = public.booking_customers.newsletter_opt_in or excluded.newsletter_opt_in,
        newsletter_opt_in_at = coalesce(public.booking_customers.newsletter_opt_in_at, excluded.newsletter_opt_in_at)
  returning id into v_customer_id;

  if v_offer.kind = 'appointment' then
    if p_start is null or v_offer.duration_minutes is null then
      raise exception 'Pick a time.';
    end if;
    if p_start <> date_trunc('minute', p_start) then
      raise exception 'Pick a time from the list.';
    end if;

    v_local := p_start at time zone v_settings.timezone;
    v_dow := extract(dow from v_local)::int;
    v_minute := (extract(hour from v_local)::int * 60) + extract(minute from v_local)::int;

    if v_minute % v_settings.slot_minutes <> 0 then
      raise exception 'Pick a time from the list.';
    end if;
    if p_start < now() + make_interval(mins => v_settings.min_notice_minutes) then
      raise exception 'That time is too soon. Pick a later one.';
    end if;
    if p_start > now() + make_interval(days => v_settings.horizon_days) then
      raise exception 'That time is too far ahead.';
    end if;

    v_end := p_start + make_interval(mins => v_offer.duration_minutes);

    if not exists (
      select 1
        from public.booking_hours h
       where h.active
         and h.weekday = v_dow
         and v_minute >= h.start_minute
         and v_minute + v_offer.duration_minutes <= h.end_minute
    ) then
      raise exception 'That time is outside the available hours.';
    end if;

    if exists (
      select 1
        from public.booking_blocks b
       where b.starts_at < v_end
         and b.ends_at > p_start
    ) then
      raise exception 'That time is blocked.';
    end if;

    select
      count(*) filter (where b.offer_id = v_offer.id),
      count(*) filter (where b.offer_id <> v_offer.id)
      into v_same, v_other
      from public.bookings b
     where b.status in ('held', 'confirmed')
       and b.starts_at < v_end + make_interval(mins => v_settings.buffer_minutes)
       and b.ends_at + make_interval(mins => v_settings.buffer_minutes) > p_start;

    if v_other > 0 or v_same >= v_offer.capacity then
      raise exception 'That time was just taken. Pick another.';
    end if;

    select coalesce(sum(
      (floor(((h.end_minute - h.start_minute - v_offer.duration_minutes)::numeric)
        / (v_offer.duration_minutes + v_settings.buffer_minutes)) + 1)::int
    ), 0)::int
      into v_spots
      from public.booking_hours h
     where h.active
       and h.weekday = v_dow
       and h.end_minute - h.start_minute >= v_offer.duration_minutes;

    select count(*)::int
      into v_booked
      from public.bookings b
     where b.status in ('held', 'confirmed')
       and (b.starts_at at time zone v_settings.timezone)::date = v_local::date;

    v_quiet := v_spots > 0 and v_booked * 2 < v_spots;
    v_price := v_offer.price_cents;
    if v_settings.discount_percent > 0
       and v_settings.discount_within_days > 0
       and v_quiet
       and p_start > now()
       and p_start <= now() + make_interval(days => v_settings.discount_within_days)
    then
      v_price := (round(v_offer.price_cents * (100 - v_settings.discount_percent) / 100.0 / 100.0) * 100)::int;
      if v_price < 100 then
        v_price := 100;
      end if;
      if v_price > v_offer.price_cents then
        v_price := v_offer.price_cents;
      end if;
    end if;

    v_summary := v_offer.name || ' · ' || to_char(v_local, 'Dy FMDD Mon, FMHH12:MI am');
    if v_price < v_offer.price_cents then
      v_summary := v_summary || ' · closer-in rate';
    end if;
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

    if nullif(trim(coalesce(p_credit_code, '')), '') is not null then
      select * into v_credit
        from public.booking_credits
       where upper(code) = upper(trim(p_credit_code))
       for update;
      if not found or v_credit.remaining < 1 then
        raise exception 'That code has no lessons left.';
      end if;
      if v_credit.expires_at is not null and v_credit.expires_at < now() then
        raise exception 'That code has expired.';
      end if;
      if v_credit.offer_id <> v_offer.id then
        raise exception 'That code is for a different lesson.';
      end if;

      insert into public.booking_orders (
        customer_id, offer_id, kind, amount_cents, list_price_cents, currency, status, summary, paid_at, credit_code, newsletter_opt_in
      ) values (
        v_customer_id, v_offer.id, 'appointment', 0, v_offer.price_cents, v_offer.currency, 'paid', v_summary, now(), v_credit.code, v_newsletter
      ) returning id into v_order_id;

      insert into public.bookings (
        offer_id, customer_id, order_id, credit_id, starts_at, ends_at, status, note, cancel_token
      ) values (
        v_offer.id, v_customer_id, v_order_id, v_credit.id, p_start, v_end, 'confirmed', v_note, v_token
      ) returning id into v_booking_id;

      update public.booking_orders set booking_id = v_booking_id where id = v_order_id;
      update public.booking_credits set remaining = remaining - 1 where id = v_credit.id;

      return jsonb_build_object(
        'mode', 'confirmed',
        'order_id', v_order_id,
        'booking_id', v_booking_id,
        'kind', 'appointment',
        'summary', v_summary,
        'offer_name', v_offer.name,
        'offer_slug', v_offer.slug,
        'starts_at', p_start,
        'customer_name', v_name,
        'customer_email', v_email,
        'customer_phone', v_phone,
        'cancel_token', v_token,
        'location', v_settings.location_label,
        'amount_cents', 0,
        'list_price_cents', v_offer.price_cents,
        'currency', v_offer.currency,
        'credit_code', v_credit.code,
        'newsletter', v_newsletter,
        'noshow_fee_cents', v_settings.noshow_fee_cents,
        'needs_followup', false
      );
    end if;

    insert into public.booking_orders (
      customer_id, offer_id, kind, amount_cents, list_price_cents, currency, status, summary, newsletter_opt_in
    ) values (
      v_customer_id, v_offer.id, 'appointment', v_price, v_offer.price_cents, v_offer.currency, 'pending', v_summary, v_newsletter
    ) returning id into v_order_id;

    insert into public.bookings (
      offer_id, customer_id, order_id, starts_at, ends_at, status, hold_expires_at, note, cancel_token
    ) values (
      v_offer.id, v_customer_id, v_order_id, p_start, v_end, 'held', now() + interval '30 minutes', v_note, v_token
    ) returning id into v_booking_id;

    update public.booking_orders set booking_id = v_booking_id where id = v_order_id;

    return jsonb_build_object(
      'mode', 'pay',
      'order_id', v_order_id,
      'booking_id', v_booking_id,
      'kind', 'appointment',
      'item_name', v_offer.name,
      'summary', v_summary,
      'amount_cents', v_price,
      'list_price_cents', v_offer.price_cents,
      'currency', v_offer.currency,
      'customer_email', v_email,
      'customer_name', v_name,
      'newsletter', v_newsletter,
      'noshow_fee_cents', v_settings.noshow_fee_cents
    );
  end if;

  if v_offer.kind in ('package', 'voucher') then
    if v_offer.redeems_offer_id is null then
      raise exception 'That pack is not set up yet.';
    end if;

    v_recipient_name := trim(coalesce(p_recipient_name, ''));
    v_recipient_email := lower(trim(coalesce(p_recipient_email, '')));
    if v_offer.kind = 'voucher' then
      if char_length(v_recipient_name) < 2 or position('@' in v_recipient_email) < 2 then
        raise exception 'Add the recipient name and email.';
      end if;
    else
      v_recipient_name := v_name;
      v_recipient_email := v_email;
    end if;

    v_summary := v_offer.name;
    insert into public.booking_orders (
      customer_id, offer_id, kind, amount_cents, list_price_cents, currency, status, summary, recipient_name, recipient_email, newsletter_opt_in
    ) values (
      v_customer_id, v_offer.id, v_offer.kind, v_offer.price_cents, v_offer.price_cents, v_offer.currency, 'pending', v_summary,
      v_recipient_name, v_recipient_email, v_newsletter
    ) returning id into v_order_id;

    return jsonb_build_object(
      'mode', 'pay',
      'order_id', v_order_id,
      'kind', v_offer.kind,
      'item_name', v_offer.name,
      'summary', v_summary,
      'amount_cents', v_offer.price_cents,
      'list_price_cents', v_offer.price_cents,
      'currency', v_offer.currency,
      'customer_email', v_email,
      'customer_name', v_name,
      'newsletter', v_newsletter
    );
  end if;

  raise exception 'That lesson is not available.';
end;
$$;

create or replace function public.booking_mark_paid(
  p_order_id uuid,
  p_square_payment_id text,
  p_square_order_id text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_order public.booking_orders%rowtype;
  v_offer public.booking_offers%rowtype;
  v_booking public.bookings%rowtype;
  v_customer public.booking_customers%rowtype;
  v_settings public.booking_settings%rowtype;
  v_redeem public.booking_offers%rowtype;
  v_code text;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_i int;
  v_followup boolean := false;
  v_same int;
  v_other int;
  v_end timestamptz;
begin
  select * into v_order from public.booking_orders where id = p_order_id for update;
  if not found then
    raise exception 'Order not found.';
  end if;

  select * into v_offer from public.booking_offers where id = v_order.offer_id;
  select * into v_customer from public.booking_customers where id = v_order.customer_id;
  select * into v_settings from public.booking_settings where id = 1;

  if v_order.status = 'paid' then
    return jsonb_build_object(
      'already', true,
      'order_id', v_order.id,
      'kind', v_order.kind,
      'needs_followup', v_order.attention
    );
  end if;

  if v_order.status <> 'pending' then
    raise exception 'This payment can no longer be completed.';
  end if;

  update public.booking_orders
     set status = 'paid',
         paid_at = now(),
         square_payment_id = coalesce(nullif(p_square_payment_id, ''), square_payment_id),
         square_order_id = coalesce(nullif(p_square_order_id, ''), square_order_id)
   where id = v_order.id;

  if coalesce(v_order.purpose, 'booking') = 'noshow' then
    null;
  elsif v_order.kind = 'appointment' and v_order.booking_id is not null then
    select * into v_booking from public.bookings where id = v_order.booking_id for update;
    v_end := v_booking.ends_at;

    if v_booking.status = 'expired' then
      select
        count(*) filter (where b.offer_id = v_booking.offer_id and b.id <> v_booking.id),
        count(*) filter (where b.offer_id <> v_booking.offer_id)
        into v_same, v_other
        from public.bookings b
       where b.status in ('held', 'confirmed')
         and b.id <> v_booking.id
         and b.starts_at < v_end + make_interval(mins => v_settings.buffer_minutes)
         and b.ends_at + make_interval(mins => v_settings.buffer_minutes) > v_booking.starts_at;
      if v_other > 0 or v_same >= v_offer.capacity then
        v_followup := true;
      else
        update public.bookings
           set status = 'confirmed', hold_expires_at = null
         where id = v_booking.id;
      end if;
    elsif v_booking.status = 'held' then
      update public.bookings
         set status = 'confirmed', hold_expires_at = null
       where id = v_booking.id;
    elsif v_booking.status <> 'confirmed' then
      v_followup := true;
    end if;

    if v_followup then
      update public.booking_orders set attention = true where id = v_order.id;
    end if;
  elsif v_order.kind in ('package', 'voucher') then
    select * into v_redeem from public.booking_offers where id = v_offer.redeems_offer_id;
    loop
      v_code := '';
      for v_i in 1..8 loop
        v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
      end loop;
      exit when not exists (select 1 from public.booking_credits where upper(code) = v_code);
    end loop;

    insert into public.booking_credits (
      code, offer_id, source_offer_id, order_id, buyer_id, recipient_name, recipient_email, remaining
    ) values (
      v_code, v_offer.redeems_offer_id, v_offer.id, v_order.id, v_order.customer_id,
      v_order.recipient_name, v_order.recipient_email, v_offer.credits
    );

    update public.booking_orders set credit_code = v_code where id = v_order.id;
  end if;

  return jsonb_build_object(
    'already', false,
    'order_id', v_order.id,
    'kind', v_order.kind,
    'summary', v_order.summary,
    'offer_name', v_offer.name,
    'offer_slug', v_offer.slug,
    'redeem_slug', case when v_order.kind = 'appointment' then v_offer.slug else v_redeem.slug end,
    'credits', v_offer.credits,
    'starts_at', case when v_order.booking_id is not null then (select starts_at from public.bookings where id = v_order.booking_id) else null end,
    'customer_name', v_customer.name,
    'customer_email', v_customer.email,
    'customer_phone', v_customer.phone,
    'recipient_name', v_order.recipient_name,
    'recipient_email', v_order.recipient_email,
    'credit_code', coalesce(v_code, v_order.credit_code),
    'cancel_token', (select cancel_token from public.bookings where id = v_order.booking_id),
    'location', v_settings.location_label,
    'amount_cents', v_order.amount_cents,
    'list_price_cents', v_order.list_price_cents,
    'currency', v_order.currency,
    'purpose', v_order.purpose,
    'newsletter', v_order.newsletter_opt_in,
    'noshow_fee_cents', v_settings.noshow_fee_cents,
    'needs_followup', v_followup
  );
end;
$$;

create or replace function public.booking_cancel_token(p_token text, p_apply boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_booking public.bookings%rowtype;
  v_offer public.booking_offers%rowtype;
  v_customer public.booking_customers%rowtype;
  v_settings public.booking_settings%rowtype;
begin
  select * into v_booking from public.bookings where cancel_token = trim(p_token) for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'This link is not a booking.');
  end if;

  select * into v_offer from public.booking_offers where id = v_booking.offer_id;
  select * into v_customer from public.booking_customers where id = v_booking.customer_id;
  select * into v_settings from public.booking_settings where id = 1;

  if v_booking.status = 'cancelled' then
    return jsonb_build_object(
      'ok', false,
      'message', 'This lesson is already cancelled.',
      'offer_name', v_offer.name,
      'starts_at', v_booking.starts_at,
      'location', v_settings.location_label
    );
  end if;

  if v_booking.status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'message', 'This lesson can no longer be cancelled from the link.');
  end if;

  if v_booking.starts_at < now() + interval '24 hours' then
    return jsonb_build_object(
      'ok', false,
      'message', 'This is inside 24 hours. Call Blake on 0421 409 662 to change it.',
      'offer_name', v_offer.name,
      'starts_at', v_booking.starts_at,
      'location', v_settings.location_label,
      'customer_name', v_customer.name
    );
  end if;

  if p_apply then
    if v_booking.credit_id is not null then
      update public.booking_credits set remaining = remaining + 1 where id = v_booking.credit_id;
    end if;
    update public.bookings set status = 'cancelled' where id = v_booking.id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'applied', p_apply,
    'message', case when p_apply then 'Cancelled. The time is free again.' else 'You can cancel this until 24 hours before.' end,
    'offer_name', v_offer.name,
    'starts_at', v_booking.starts_at,
    'location', v_settings.location_label,
    'customer_name', v_customer.name,
    'customer_email', v_customer.email,
    'paid_by_card', v_booking.credit_id is null
  );
end;
$$;

create or replace function public.booking_cancel_coach(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_booking public.bookings%rowtype;
  v_offer public.booking_offers%rowtype;
  v_customer public.booking_customers%rowtype;
  v_settings public.booking_settings%rowtype;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'That booking is gone.';
  end if;
  if v_booking.status not in ('held', 'confirmed') then
    raise exception 'That booking is already closed.';
  end if;

  if v_booking.credit_id is not null and v_booking.status = 'confirmed' then
    update public.booking_credits set remaining = remaining + 1 where id = v_booking.credit_id;
  end if;

  update public.bookings set status = 'cancelled' where id = v_booking.id;

  update public.booking_orders
     set status = 'failed'
   where id = v_booking.order_id
     and status = 'pending'
     and square_order_id is null;

  select * into v_offer from public.booking_offers where id = v_booking.offer_id;
  select * into v_customer from public.booking_customers where id = v_booking.customer_id;
  select * into v_settings from public.booking_settings where id = 1;

  return jsonb_build_object(
    'ok', true,
    'offer_name', v_offer.name,
    'starts_at', v_booking.starts_at,
    'location', v_settings.location_label,
    'customer_name', v_customer.name,
    'customer_email', v_customer.email,
    'paid_by_card', exists (
      select 1
        from public.booking_orders o
       where o.id = v_booking.order_id
         and o.status = 'paid'
         and o.amount_cents > 0
    )
  );
end;
$$;

create or replace function public.booking_mark_noshow(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_booking public.bookings%rowtype;
  v_offer public.booking_offers%rowtype;
  v_customer public.booking_customers%rowtype;
  v_settings public.booking_settings%rowtype;
  v_order_id uuid;
  v_summary text;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'That booking is gone.';
  end if;
  if v_booking.status = 'noshow' and v_booking.fee_order_id is not null then
    select id into v_order_id from public.booking_orders where id = v_booking.fee_order_id;
    return jsonb_build_object('ok', true, 'already', true, 'order_id', v_order_id);
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'Only a confirmed lesson can be marked as a no-show.';
  end if;
  if v_booking.starts_at > now() then
    raise exception 'That lesson has not started yet.';
  end if;

  select * into v_offer from public.booking_offers where id = v_booking.offer_id;
  select * into v_customer from public.booking_customers where id = v_booking.customer_id;
  select * into v_settings from public.booking_settings where id = 1;

  v_summary := 'No-show fee · ' || v_offer.name;

  if v_settings.noshow_fee_cents > 0 then
    insert into public.booking_orders (
      customer_id, offer_id, kind, amount_cents, list_price_cents, currency, status, summary, purpose
    ) values (
      v_booking.customer_id, v_booking.offer_id, 'appointment', v_settings.noshow_fee_cents, v_settings.noshow_fee_cents,
      v_offer.currency, 'pending', v_summary, 'noshow'
    ) returning id into v_order_id;
  end if;

  update public.bookings
     set status = 'noshow',
         fee_order_id = v_order_id
   where id = v_booking.id;

  return jsonb_build_object(
    'ok', true,
    'already', false,
    'order_id', v_order_id,
    'amount_cents', v_settings.noshow_fee_cents,
    'currency', v_offer.currency,
    'summary', v_summary,
    'offer_name', v_offer.name,
    'starts_at', v_booking.starts_at,
    'customer_name', v_customer.name,
    'customer_email', v_customer.email,
    'customer_phone', v_customer.phone,
    'location', v_settings.location_label
  );
end;
$$;

create or replace function public.booking_set_schedule(
  p_location text,
  p_buffer int,
  p_notice int,
  p_discount_days int,
  p_discount_percent int,
  p_noshow_cents int,
  p_hours jsonb
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row jsonb;
  v_weekday int;
  v_start int;
  v_end int;
  v_active boolean;
  v_slot int;
begin
  if p_buffer < 0 or p_buffer > 180 or p_notice < 0 or p_notice > 10080 then
    raise exception 'Those hours are not valid.';
  end if;
  if p_discount_days < 0 or p_discount_days > 30 or p_discount_percent < 0 or p_discount_percent > 80 then
    raise exception 'That closer-in rate is not valid.';
  end if;
  if p_noshow_cents < 0 or p_noshow_cents > 50000 then
    raise exception 'That no-show fee is not valid.';
  end if;
  if jsonb_typeof(p_hours) <> 'array' then
    raise exception 'Those hours are not valid.';
  end if;

  select slot_minutes into v_slot from public.booking_settings where id = 1;

  update public.booking_settings
     set location_label = left(trim(p_location), 120),
         buffer_minutes = p_buffer,
         min_notice_minutes = p_notice,
         discount_within_days = p_discount_days,
         discount_percent = p_discount_percent,
         noshow_fee_cents = p_noshow_cents,
         updated_at = now()
   where id = 1;

  delete from public.booking_hours;

  for v_row in select * from jsonb_array_elements(p_hours)
  loop
    v_weekday := (v_row->>'weekday')::int;
    v_start := (v_row->>'startMinute')::int;
    v_end := (v_row->>'endMinute')::int;
    v_active := coalesce((v_row->>'active')::boolean, false);
    if v_weekday < 0 or v_weekday > 6 or v_start < 0 or v_end > 1440 or v_end <= v_start then
      raise exception 'Those hours are not valid.';
    end if;
    if v_active and (v_start % v_slot <> 0 or v_end % v_slot <> 0) then
      raise exception 'Start and finish need to land on the booking grid.';
    end if;
    insert into public.booking_hours (weekday, start_minute, end_minute, active)
    values (v_weekday, v_start, v_end, v_active);
  end loop;
end;
$$;

revoke all on function public.booking_checkout(text, timestamptz, text, text, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.booking_mark_paid(uuid, text, text) from public, anon, authenticated;
revoke all on function public.booking_cancel_token(text, boolean) from public, anon, authenticated;
revoke all on function public.booking_cancel_coach(uuid) from public, anon, authenticated;
revoke all on function public.booking_mark_noshow(uuid) from public, anon, authenticated;
revoke all on function public.booking_set_schedule(text, int, int, int, int, int, jsonb) from public, anon, authenticated;

grant execute on function public.booking_checkout(text, timestamptz, text, text, text, text, text, text, text, boolean) to service_role;
grant execute on function public.booking_mark_paid(uuid, text, text) to service_role;
grant execute on function public.booking_cancel_token(text, boolean) to service_role;
grant execute on function public.booking_cancel_coach(uuid) to service_role;
grant execute on function public.booking_mark_noshow(uuid) to service_role;
grant execute on function public.booking_set_schedule(text, int, int, int, int, int, jsonb) to service_role;
