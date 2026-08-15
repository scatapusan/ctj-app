-- Ministry request: see whether each registrant is Youth, YA, or Core.
--
-- Core is a ROLE, not an age bracket — a 19-year-old core leader is both
-- youth-aged AND core. So `category` stays the age bracket ('youth' | 'ya')
-- and core becomes its own boolean, snapshotted from the member's real core
-- flag at registration time. The UI and CSV then derive a single display
-- value (Core / Youth / YA) without the stored data losing either dimension.
--
-- Why a snapshot rather than joining members.is_youth_ya_core at read time:
-- core membership changes between years, and "who was core at the 2026
-- retreat" must stay answerable after the team turns over.
--
-- APPLY: Supabase SQL editor. Safe to re-run.

alter table public.attendance
  add column if not exists is_core boolean not null default false;

-- Backfill. The column did not exist before, so there is no per-event history
-- to recover; the member's current flag is the best available approximation.
-- It is exact for rows created from today onward, which covers the retreat.
update public.attendance a
   set is_core = true
  from public.members m
 where m.id = a.member_id
   and m.is_youth_ya_core = true
   and a.is_core = false;

-- NOTE: register_and_checkin is deliberately NOT widened again. It only ever
-- creates BRAND NEW members, who cannot already be core (the RPC never accepts
-- privilege flags), so the column default of false is always correct there.
-- Existing members register through a plain attendance insert, which is where
-- the snapshot is taken.
