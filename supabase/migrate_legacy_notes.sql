-- Run manually only after schema.sql has created the agency_notes table.
-- This turns each existing legacy agencies.notes value into the first item in
-- that agency's note history, then clears the legacy field. Phone-list notes
-- remain excluded because they belong in phone_numbers instead.

begin;

insert into agency_notes (agency_id, content, created_at)
select
  a.id,
  a.notes,
  coalesce(a.updated_at, a.created_at, now())
from agencies a
where nullif(trim(a.notes), '') is not null
  and a.notes !~* '^\s*Svi\s+telefoni:'
  and not exists (
    select 1
    from agency_notes n
    where n.agency_id = a.id
      and n.content = a.notes
  );

update agencies
set notes = null
where nullif(trim(notes), '') is not null
  and notes !~* '^\s*Svi\s+telefoni:';

commit;
