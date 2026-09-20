-- Run this manually in Supabase SQL Editor. Codex does not execute it.
-- It creates a separate list of future follow-ups, then copies the existing
-- single next_followup_date / next_followup_note into that list once.

begin;

create extension if not exists "pgcrypto";

create table if not exists scheduled_followups (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references agencies(id) on delete cascade,
  date date not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_scheduled_followups_agency_date
  on scheduled_followups(agency_id, date asc, created_at asc);

insert into scheduled_followups (agency_id, date, reason)
select a.id, a.next_followup_date, a.next_followup_note
from agencies a
where a.next_followup_date is not null
  and not exists (
    select 1
    from scheduled_followups sf
    where sf.agency_id = a.id
      and sf.date = a.next_followup_date
      and sf.reason is not distinct from a.next_followup_note
  );

alter table scheduled_followups enable row level security;

commit;
