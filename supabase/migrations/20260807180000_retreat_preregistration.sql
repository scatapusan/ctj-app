-- Retreat pre-registration (Aug 2026) — ADDITIVE and backward-compatible.
--
-- 1. attendance.status: 'registered' (pre-registered, not yet at the event)
--    or 'attended'. DEFAULT 'attended' so every existing insert path — the
--    check-in route, register_and_checkin's legacy 2-arg call, the guest flow —
--    keeps working byte-for-byte, and all existing rows stay 'attended'.
-- 2. attendance.attended_at: when a pre-registered person was marked attended
--    on the day. For rows that go straight to 'attended' (regular check-ins,
--    walk-ins) checked_in_at already IS the attended time; attended_at is
--    backfilled/stamped to match so day-of queries can rely on one column.
-- 3. Event-scoped retreat registration data lives on the attendance row, NOT
--    on members: category (Youth 12–22 / YA 23+), the YA baby-photo URL, and
--    guardian contact info for minors. These are per-event answers; putting
--    them here means re-registering next year can ask again without
--    overwriting anything on the member profile.
-- 4. register_and_checkin gains OPTIONAL p_status / p_retreat parameters with
--    defaults that reproduce the old behavior exactly; the existing 2-argument
--    PostgREST call keeps resolving to this function unchanged. (Batch 2a
--    atomicity is preserved — still one transaction for member + attendance.)
--
-- APPLY: run in the Supabase SQL editor (or supabase db push). Safe to apply
-- while the current app version is live.

-- 1 + 2. Status / attended_at ------------------------------------------------
alter table public.attendance
  add column if not exists status text not null default 'attended',
  add column if not exists attended_at timestamptz;

do $$ begin
  alter table public.attendance
    add constraint attendance_status_check check (status in ('registered', 'attended'));
exception when duplicate_object then null; end $$;

-- Existing rows were all real check-ins: their attended time is checked_in_at.
update public.attendance set attended_at = checked_in_at where attended_at is null;

-- 3. Retreat registration fields --------------------------------------------
alter table public.attendance
  add column if not exists category text,
  add column if not exists baby_photo_url text,
  add column if not exists guardian_name text,
  add column if not exists guardian_contact text;

do $$ begin
  alter table public.attendance
    add constraint attendance_category_check check (category is null or category in ('youth', 'ya'));
exception when duplicate_object then null; end $$;

-- 4. register_and_checkin: optional status + retreat metadata ----------------
-- Adding defaulted parameters changes the function signature, so drop the old
-- 2-arg version first; the CREATE below still satisfies 2-arg calls via the
-- parameter defaults. Grants are re-applied (drop removes them).
drop function if exists public.register_and_checkin(jsonb, uuid);

create or replace function public.register_and_checkin(
  p_member jsonb,
  p_event_id uuid,
  p_status text default 'attended',
  p_retreat jsonb default null
)
returns public.members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.members;
begin
  if p_status not in ('registered', 'attended') then
    raise exception 'invalid status %', p_status;
  end if;

  -- Privilege flags (is_admin, is_youth_ya_core) are NEVER taken from the
  -- caller payload — omitted from the INSERT so they fall back to false.
  insert into public.members (
    email, first_name, middle_name, last_name, nickname, gender, birthdate,
    contact_number, facebook_link, address, occupation,
    father_name, mother_name, emergency_contact_name, emergency_contact_number,
    discipler_name, disciples, prospect_disciples,
    lifeline_leader, lifeline_co_leaders, lifeline_members, ministry_involvements,
    completed_reach, completed_fresh_start, completed_freedom_day, completed_grand_day,
    baptized_in_water, photo_url, is_guest, privacy_consent_at, pin
  ) values (
    lower(trim(p_member->>'email')),
    trim(p_member->>'first_name'),
    nullif(trim(p_member->>'middle_name'), ''),
    trim(p_member->>'last_name'),
    nullif(trim(p_member->>'nickname'), ''),
    nullif(p_member->>'gender', ''),
    nullif(p_member->>'birthdate', '')::date,
    nullif(trim(p_member->>'contact_number'), ''),
    nullif(trim(p_member->>'facebook_link'), ''),
    nullif(trim(p_member->>'address'), ''),
    nullif(trim(p_member->>'occupation'), ''),
    nullif(trim(p_member->>'father_name'), ''),
    nullif(trim(p_member->>'mother_name'), ''),
    nullif(trim(p_member->>'emergency_contact_name'), ''),
    nullif(trim(p_member->>'emergency_contact_number'), ''),
    nullif(trim(p_member->>'discipler_name'), ''),
    nullif(trim(p_member->>'disciples'), ''),
    nullif(trim(p_member->>'prospect_disciples'), ''),
    nullif(trim(p_member->>'lifeline_leader'), ''),
    nullif(trim(p_member->>'lifeline_co_leaders'), ''),
    nullif(trim(p_member->>'lifeline_members'), ''),
    nullif(trim(p_member->>'ministry_involvements'), ''),
    coalesce((p_member->>'completed_reach')::boolean, false),
    coalesce((p_member->>'completed_fresh_start')::boolean, false),
    coalesce((p_member->>'completed_freedom_day')::boolean, false),
    coalesce((p_member->>'completed_grand_day')::boolean, false),
    coalesce((p_member->>'baptized_in_water')::boolean, false),
    nullif(p_member->>'photo_url', ''),
    coalesce((p_member->>'is_guest')::boolean, false),
    now(),
    coalesce(nullif(p_member->>'pin', ''), '1234')
  )
  returning * into v_member;

  insert into public.attendance (
    member_id, event_id, status, attended_at,
    category, baby_photo_url, guardian_name, guardian_contact
  ) values (
    v_member.id,
    p_event_id,
    p_status,
    case when p_status = 'attended' then now() else null end,
    nullif(p_retreat->>'category', ''),
    nullif(p_retreat->>'baby_photo_url', ''),
    nullif(trim(coalesce(p_retreat->>'guardian_name', '')), ''),
    nullif(trim(coalesce(p_retreat->>'guardian_contact', '')), '')
  );

  return v_member;
end;
$$;

revoke all on function public.register_and_checkin(jsonb, uuid, text, jsonb) from public;
grant execute on function public.register_and_checkin(jsonb, uuid, text, jsonb) to service_role;
