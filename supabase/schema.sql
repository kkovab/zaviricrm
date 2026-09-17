-- Zaviri Agency Outreach CRM — database schema
-- Run this once in your Supabase project: SQL Editor -> New query -> paste -> Run

create extension if not exists "pgcrypto";

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
  status text not null default 'Not Contacted'
    check (status in (
      'Not Contacted', 'Attempted - No Answer', 'Considering',
      'Onboarded - Trial', 'Converted - Paying', 'Declined', 'Churned'
    )),
  date_first_contacted date,
  trial_start_date date,
  discount_offered text,
  what_they_know text,
  what_they_still_need text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If you already ran an earlier version of this file, these lines add new
-- columns without touching your existing data. Safe to run again.
alter table agencies add column if not exists contact_person text;
-- Permanent per-agency discount off the bulk pricing tiers below, as a whole
-- number percent (e.g. 30 means 30% off). Separate from discount_offered,
-- which stays as a free-text note about what was offered/why.
alter table agencies add column if not exists discount_percent numeric default 0;

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
-- suggested next follow-up date. The app reads from this view so nothing
-- needs to be recalculated by hand.
--
-- Pricing: zaviri.hr only sells the "Plus" package, minimum 10 listings per
-- package. An agency buying fewer than 10 (i.e. not buying a package at all)
-- pays full retail with no bulk discount. On top of the bulk tier, each
-- agency can also carry its own permanent discount_percent (e.g. Queen Stela
-- gets 30% off everything below) - that's applied after the tier price.
create or replace view agency_overview as
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
  b.active_listings, b.qualified, b.oglasnik_profil, b.website, b.status,
  b.date_first_contacted, b.trial_start_date, b.discount_offered,
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
  coalesce(f.followup_count, 0) as followup_count,
  case
    when f.last_followup_date is not null then f.last_followup_date + interval '7 days'
    else null
  end::date as next_followup_suggested
from base b
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
