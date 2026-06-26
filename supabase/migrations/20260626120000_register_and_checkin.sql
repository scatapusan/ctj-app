-- Batch 2a — atomic registration + first check-in.
--
-- Fixes S2 (non-atomic register -> orphaned member if attendance insert failed)
-- by inserting the member and their attendance row in ONE transaction.
--
-- Security:
--   * Privilege flags (is_admin, is_youth_ya_core) are NEVER taken from the
--     caller payload — they are simply omitted from the INSERT and fall back to
--     their table defaults (false). Self-registrants cannot grant themselves
--     admin/core access.
--   * EXECUTE is revoked from PUBLIC and granted only to service_role, so the
--     function is callable solely by the server routes (service-role client),
--     never by an anon browser client.

create or replace function public.register_and_checkin(p_member jsonb, p_event_id uuid)
returns public.members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.members;
begin
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

  insert into public.attendance (member_id, event_id)
  values (v_member.id, p_event_id);

  return v_member;
end;
$$;

revoke all on function public.register_and_checkin(jsonb, uuid) from public;
grant execute on function public.register_and_checkin(jsonb, uuid) to service_role;
