-- Batch 4 — private member-photos bucket.
--
-- Today the bucket is public-read AND anonymously listable with the anon key
-- that ships inside the site's own JavaScript, so every profile photo and every
-- retreat baby photo can be enumerated and downloaded by anyone. This closes
-- that: the bucket goes private, uploads move to a server route (service role),
-- and photos are served to signed-in admin/core through short-lived signed URLs.
--
-- Stored values change meaning: members.photo_url and attendance.baby_photo_url
-- stop being absolute public URLs and become OBJECT PATHS inside the bucket
-- (e.g. 'baby-1786166356633-ej1nor96lw.jpeg'). The app tolerates both — a value
-- that still looks like a URL is passed through untouched — so deploy order is
-- not critical, but MIGRATION FIRST is cleanest.
--
-- APPLY: Supabase SQL editor. Safe to re-run.

-- 1. Convert stored absolute URLs to bucket-relative paths ---------------------
-- Matches any host so it works regardless of project ref / self-hosting.
update public.members
   set photo_url = regexp_replace(
         photo_url, '^https?://[^/]+/storage/v1/object/(public|sign)/member-photos/', ''
       )
 where photo_url ~ '^https?://[^/]+/storage/v1/object/(public|sign)/member-photos/';

update public.attendance
   set baby_photo_url = regexp_replace(
         baby_photo_url, '^https?://[^/]+/storage/v1/object/(public|sign)/member-photos/', ''
       )
 where baby_photo_url ~ '^https?://[^/]+/storage/v1/object/(public|sign)/member-photos/';

-- Strip any leftover query string from previously-signed URLs.
update public.members
   set photo_url = split_part(photo_url, '?', 1)
 where photo_url like '%?%' and photo_url not like 'http%';

update public.attendance
   set baby_photo_url = split_part(baby_photo_url, '?', 1)
 where baby_photo_url like '%?%' and baby_photo_url not like 'http%';

-- 2. Lock the bucket down -----------------------------------------------------
-- Guarded so this migration also applies cleanly to the local test database,
-- which has no `storage` schema.
do $$
declare
  pol record;
begin
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'storage' and table_name = 'buckets'
  ) then
    -- Stops /storage/v1/object/public/... from serving these files at all.
    update storage.buckets set public = false where id = 'member-photos';

    -- Remove every policy that grants access to this bucket, so the anon key
    -- in the browser bundle can no longer list, download, or upload. The
    -- service role bypasses RLS entirely and is unaffected.
    for pol in
      select policyname
        from pg_policies
       where schemaname = 'storage'
         and tablename = 'objects'
         and (coalesce(qual, '') like '%member-photos%'
              or coalesce(with_check, '') like '%member-photos%')
    loop
      execute format('drop policy if exists %I on storage.objects', pol.policyname);
    end loop;
  end if;
end $$;

-- 3. Verify after applying ----------------------------------------------------
--   select id, public from storage.buckets where id = 'member-photos';
--     -> public must be false
--
--   select policyname, roles, cmd, qual from pg_policies
--    where schemaname='storage' and tablename='objects';
--     -> review anything left. A policy written WITHOUT a bucket_id filter
--        applies to every bucket and will NOT have been dropped above; if one
--        grants anon access, remove it in Storage -> Policies.
