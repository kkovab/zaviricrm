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

-- If you already ran an earlier version of this file, this line adds the
-- new column without touching your existing data. Safe to run again.
alter table agencies add column if not exists contact_person text;

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
create or replace view agency_overview as
select
  a.*,
  case
    when a.active_listings >= 25 then 13
    when a.active_listings >= 10 then 15
    else 20
  end as suggested_price_per_listing,
  a.active_listings * (
    case
      when a.active_listings >= 25 then 13
      when a.active_listings >= 10 then 15
      else 20
    end
  ) as est_monthly_value,
  case
    when a.trial_start_date is not null then a.trial_start_date + interval '30 days'
    else null
  end::date as trial_end_date,
  case
    when a.trial_start_date is not null
      then (a.trial_start_date + interval '30 days')::date - current_date
    else null
  end as days_left_in_trial,
  f.last_followup_date,
  coalesce(f.followup_count, 0) as followup_count,
  case
    when f.last_followup_date is not null then f.last_followup_date + interval '7 days'
    else null
  end::date as next_followup_suggested
from agencies a
left join (
  select agency_id, max(date) as last_followup_date, count(*) as followup_count
  from followups
  group by agency_id
) f on f.agency_id = a.id;

-- Row Level Security: locked down by default. The app's server-side API routes
-- use the service_role key, which bypasses RLS, so the app keeps working.
-- This just makes sure nobody can read/write your data directly through the
-- public anon key if it ever leaked.
alter table agencies enable row level security;
alter table followups enable row level security;
