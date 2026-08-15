-- Core becomes self-selected on the retreat form (ministry decision, Aug 14):
-- the roster's is_youth_ya_core is stale and under-reports, so the registrant
-- picks Youth / YA / Core themselves (the roster flag only prefills the form)
-- and admins correct mistakes in the console. attendance.is_core therefore now
-- records the registrant's CHOICE rather than a roster snapshot.
--
-- This migration widens register_and_checkin (the new-person path) to carry
-- that choice into the attendance row via p_retreat.is_core. Same signature as
-- 20260807180000, so CREATE OR REPLACE suffices and existing grants persist.
--
-- SECURITY UNCHANGED: p_retreat.is_core writes the ATTENDANCE row only. The
-- members INSERT still never reads is_admin / is_youth_ya_core from the caller
-- payload — a self-declared Core registration cannot grant any privilege.
--
-- APPLY: Supabase SQL editor (or supabase db push). Safe to re-run. The app
-- also works before this is applied — the route backstops the flag with a
-- follow-up attendance UPDATE — but with it the write is atomic.

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
    category, is_core, baby_photo_url, guardian_name, guardian_contact
  ) values (
    v_member.id,
    p_event_id,
    p_status,
    case when p_status = 'attended' then now() else null end,
    nullif(p_retreat->>'category', ''),
    -- The registrant's self-selected Core label (attendance data, not a role).
    coalesce((p_retreat->>'is_core')::boolean, false),
    nullif(p_retreat->>'baby_photo_url', ''),
    nullif(trim(coalesce(p_retreat->>'guardian_name', '')), ''),
    nullif(trim(coalesce(p_retreat->>'guardian_contact', '')), '')
  );

  return v_member;
end;
$$;

-- Re-affirmed for fresh databases; CREATE OR REPLACE preserves them otherwise.
revoke all on function public.register_and_checkin(jsonb, uuid, text, jsonb) from public;
grant execute on function public.register_and_checkin(jsonb, uuid, text, jsonb) to service_role;
