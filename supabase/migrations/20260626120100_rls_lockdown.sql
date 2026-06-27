-- Batch 2b — RLS lockdown.
--
-- APPLY LAST. Only after the new server routes (Batches 1, 2a, 2b) are deployed
-- and verified in production. Once applied, the browser anon key can no longer
-- read or write members/attendance; every such operation goes through the
-- authenticated server routes (service role). See the deploy runbook.
--
-- RLS is already ENABLED on all three tables, so dropping the permissive
-- policies denies access by default; grants are revoked too for defense in depth.

-- 1. members — remove ALL anon / authenticated access.
drop policy if exists "Public insert members" on public.members;
drop policy if exists "Public read members"   on public.members;
drop policy if exists "Public update members" on public.members;
revoke select, insert, update, delete on public.members from anon, authenticated;

-- 2. attendance — remove ALL anon / authenticated access.
drop policy if exists "Public insert attendance" on public.attendance;
drop policy if exists "Public read attendance"   on public.attendance;
revoke select, insert, update, delete on public.attendance from anon, authenticated;

-- 3. events — anon may SELECT ACTIVE events only, and NOT the free-text
--    `description` column (column-level grant). No anon writes.
drop policy if exists "Public read events" on public.events;
revoke select, insert, update, delete on public.events from anon, authenticated;
grant select (id, name, event_date, is_active, created_at) on public.events to anon, authenticated;
create policy "Anon read active events" on public.events
  for select to anon, authenticated
  using (is_active = true);

-- 4. verify_pin — nothing client-side calls it anymore; PIN checks are
--    server-side only (service role).
revoke execute on function public.verify_pin(uuid, text) from anon, authenticated, public;
grant execute on function public.verify_pin(uuid, text) to service_role;

-- NOTE (Batch 4): the member-photos storage bucket intentionally remains
-- anon-INSERT + public-read for now (client-side photo upload still works).
-- No storage.objects policy is changed here; Batch 4 makes the bucket private
-- with signed-URL access.
