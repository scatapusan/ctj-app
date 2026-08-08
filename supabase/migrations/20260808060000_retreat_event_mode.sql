-- Retreat event mode + attended_at invariant. ADDITIVE and backward-compatible.
--
-- WHY: the Aug 30 retreat appeared in the regular /attend event picker, so
-- selecting it ran the old one-step check-in — writing status='attended' three
-- weeks early with none of the retreat data (category, baby photo, guardian).
-- Events now declare which flow they use, and the app routes accordingly.
--
-- Also fixes an inconsistency the previous migration left behind: the ordinary
-- check-in path inserts attendance rows WITHOUT attended_at, so live check-ins
-- were landing as status='attended' with attended_at null. A trigger now keeps
-- the invariant true no matter which path writes the row.
--
-- APPLY BEFORE DEPLOYING the matching app version. (The app degrades safely if
-- deployed first — the event picker falls back to a mode-less query — but the
-- retreat would stay selectable in /attend until this is applied.)

-- 1. events.registration_mode ------------------------------------------------
alter table public.events
  add column if not exists registration_mode text not null default 'checkin';

do $$ begin
  alter table public.events
    add constraint events_registration_mode_check
    check (registration_mode in ('checkin', 'retreat'));
exception when duplicate_object then null; end $$;

-- The RLS lockdown grants events columns individually, so the browser cannot
-- read a new column until it is granted explicitly.
grant select (registration_mode) on public.events to anon, authenticated;

-- 2. Mark the Aug 30 retreat (created 2026-08-07). Idempotent; safe to re-run.
update public.events
   set registration_mode = 'retreat'
 where id = 'b8e614c0-954b-46d5-aa4e-a3620d359c66';

-- 3. attended_at invariant ---------------------------------------------------
-- Rule: a row with status='attended' always has attended_at; a row with
-- status='registered' never does.
create or replace function public.attendance_sync_attended_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'attended' then
    if new.attended_at is null then
      -- On INSERT the row IS the attendance, so checked_in_at is the moment.
      -- On UPDATE the row was pre-registered earlier, so "now" is the moment.
      if tg_op = 'INSERT' then
        new.attended_at := coalesce(new.checked_in_at, now());
      else
        new.attended_at := now();
      end if;
    end if;
  elsif new.status = 'registered' then
    new.attended_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_sync_attended_at on public.attendance;
create trigger attendance_sync_attended_at
  before insert or update on public.attendance
  for each row execute function public.attendance_sync_attended_at();

-- Backfill rows written between the previous migration and this one.
update public.attendance
   set attended_at = checked_in_at
 where status = 'attended' and attended_at is null;
