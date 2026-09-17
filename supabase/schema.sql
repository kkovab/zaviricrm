-- Zaviri Agency Outreach CRM — database schema
-- Run this once in your Supabase project: SQL Editor -> New query -> paste -> Run
-- Safe to re-run this whole file any time (e.g. after pulling new code) -
-- everything below only adds what's missing, it never wipes your data.

create extension if not exists "pgcrypto";

-- Custom, colorable pipeline statuses (like Notion tags). You manage these
-- from the app itself ("Manage Statuses" button) - this seed just gives you
-- the ones you started with. is_closed means "no more outreach needed once
-- an agency reaches this status" (it's excluded from overdue follow-ups and
-- sinks to the bottom of the priority sort). sort_order controls the order
-- open statuses appear in on the main table.
create table if not exists statuses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#737373',
  is_closed boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into statuses (name, color, is_closed, sort_order) values
  ('Onboarded - Trial', '#eab308', false, 0),
  ('Considering', '#d97706', false, 1),
  ('Attempted - No Answer', '#71717a', false, 2),
  ('Not Contacted', '#6b7280', false, 3),
  ('Converted - Paying', '#059669', true, 4),
  ('Declined', '#e11d48', true, 5),
  ('Churned', '#9f1239', true, 6)
on conflict (name) do nothing;

create table if not exists agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text,
  phone text,
  mobile_alt text,
  email text,
  location text,
  active_listings integer default 0,
  qualified boolean default false,
  oglasnik_profil text,
  website text,
  status_id uuid references statuses(id),
  date_first_contacted date,
  trial_start_date date,
  next_followup_date date,
  discount_offered text,
  discount_percent numeric default 0,
  what_they_know text,
  what_they_still_need text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Upgrade path for databases created before a column/table existed. ──
-- If you already ran an earlier version of this file, these bring your
-- database up to date without touching your existing data. Safe to run
-- again - each one only does something the first time.
alter table agencies add column if not exists contact_person text;
alter table agencies add column if not exists discount_percent numeric default 0;
alter table agencies add column if not exists status_id uuid references statuses(id);
-- Next follow-up is now something you set yourself, not auto-calculated
-- from the last logged follow-up + 7 days.
alter table agencies add column if not exists next_followup_date date;

-- If your agencies table still has the old free-text "status" column (from
-- before custom statuses existed), move its values over to status_id and
-- then drop it. Only does anything the first time you run this.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'agencies' and column_name = 'status'
  ) then
    update agencies a
    set status_id = s.id
    from statuses s
    where s.name = a.status and a.status_id is null;

    alter table agencies drop column status;
  end if;
end $$;

create table if not exists followups (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  date date not null default current_date,
  method text default 'Phone Call'
    check (method in ('Phone Call', 'WhatsApp', 'Email', 'In Person')),
  discussed text,
  outcome text,
  next_step text,
  created_at timestamptz not null default now()
);

create index if not exists idx_followups_agency_id on followups(agency_id);

-- Keep updated_at current on every edit
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_agencies_updated_at on agencies;
create trigger trg_agencies_updated_at
  before update on agencies
  for each row execute function set_updated_at();

-- This view does all the "spreadsheet formula" work: suggested pricing tier,
-- trial end date, days left, last follow-up date, follow-up count, and the
-- current status's name/color/closed-flag/sort order (joined in from the
-- statuses table). next_followup_date is NOT computed here - you set it
-- yourself per agency, and the view just passes it through. The app reads
-- from this view so nothing else needs to be recalculated by hand.
--
-- Pricing: zaviri.hr only sells the "Plus" package, minimum 10 listings per
-- package. An agency buying fewer than 10 (i.e. not buying a package at all)
-- pays full retail with no bulk discount. On top of the bulk tier, each
-- agency can also carry its own permanent discount_percent (e.g. Queen Stela
-- gets 30% off everything below) - that's applied after the tier price.
--
-- Dropped and recreated (rather than "create or replace") because Postgres
-- won't let create-or-replace insert/reorder columns in an existing view -
-- only append new ones at the end. Safe: nothing else in this schema
-- depends on this view.
drop view if exists agency_overview;
create view agency_overview as
with base as (
  select
    a.*,
    case
      when a.active_listings >= 1000 then 7.49
      when a.active_listings >= 500 then 8.49
      when a.active_listings >= 250 then 9.49
      when a.active_listings >= 100 then 10.49
      when a.active_listings >= 50 then 11.99
      when a.active_listings >= 25 then 13.49
      when a.active_listings >= 10 then 14.99
      else 20
    end as base_price_per_listing
  from agencies a
)
select
  b.id, b.name, b.contact_person, b.phone, b.mobile_alt, b.email, b.location,
  b.active_listings, b.qualified, b.oglasnik_profil, b.website,
  s.id as status_id,
  coalesce(s.name, 'Not Contacted') as status,
  coalesce(s.color, '#6b7280') as status_color,
  coalesce(s.is_closed, false) as status_is_closed,
  coalesce(s.sort_order, 0) as status_sort_order,
  b.date_first_contacted, b.trial_start_date, b.next_followup_date,
  b.discount_offered,
  b.discount_percent, b.what_they_know, b.what_they_still_need, b.notes,
  b.created_at, b.updated_at,
  round(b.base_price_per_listing * (1 - coalesce(b.discount_percent, 0) / 100.0), 2)
    as suggested_price_per_listing,
  round(
    b.active_listings * b.base_price_per_listing * (1 - coalesce(b.discount_percent, 0) / 100.0),
    2
  ) as est_monthly_value,
  case
    when b.trial_start_date is not null then b.trial_start_date + interval '30 days'
    else null
  end::date as trial_end_date,
  case
    when b.trial_start_date is not null
      then (b.trial_start_date + interval '30 days')::date - current_date
    else null
  end as days_left_in_trial,
  f.last_followup_date,
  coalesce(f.followup_count, 0) as followup_count
from base b
left join statuses s on s.id = b.status_id
left join (
  select agency_id, max(date) as last_followup_date, count(*) as followup_count
  from followups
  group by agency_id
) f on f.agency_id = b.id;

-- Row Level Security: locked down by default. The app's server-side API routes
-- use the service_role key, which bypasses RLS, so the app keeps working.
-- This just makes sure nobody can read/write your data directly through the
-- public anon key if it ever leaked.
alter table agencies enable row level security;
alter table followups enable row level security;
alter table statuses enable row level security;
