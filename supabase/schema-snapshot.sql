-- CTJ schema snapshot (catalog-derived, schema-only, ZERO rows)
-- Source: production public schema. Generated for local-DB import + migration authoring.

CREATE TABLE public.attendance (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  member_id uuid NOT NULL,
  event_id uuid NOT NULL,
  checked_in_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.events (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  description text,
  event_date date NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.members (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  email text NOT NULL,
  first_name text NOT NULL,
  middle_name text,
  last_name text NOT NULL,
  birthdate date,
  contact_number text,
  facebook_link text,
  address text,
  photo_url text,
  discipler_name text,
  disciples text,
  prospect_disciples text,
  lifeline_leader text,
  lifeline_co_leaders text,
  lifeline_members text,
  ministry_involvements text,
  is_youth_ya_core boolean DEFAULT false NOT NULL,
  completed_reach boolean DEFAULT false NOT NULL,
  completed_fresh_start boolean DEFAULT false NOT NULL,
  completed_freedom_day boolean DEFAULT false NOT NULL,
  completed_grand_day boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  pin text DEFAULT '1234'::text NOT NULL,
  is_admin boolean DEFAULT false NOT NULL,
  nickname text,
  gender text,
  marital_status text,
  spouse_name text,
  children_names text,
  father_name text,
  mother_name text,
  emergency_contact_name text,
  emergency_contact_number text,
  occupation text,
  date_joined_ctjcc text,
  spiritual_birthday text,
  baptized_in_water boolean DEFAULT false NOT NULL,
  member_group text,
  is_guest boolean DEFAULT false,
  privacy_consent_at timestamp with time zone
);

-- Constraints (PK / UNIQUE / CHECK / FK)
ALTER TABLE attendance ADD CONSTRAINT attendance_pkey PRIMARY KEY (id);
ALTER TABLE events ADD CONSTRAINT events_pkey PRIMARY KEY (id);
ALTER TABLE members ADD CONSTRAINT members_pkey PRIMARY KEY (id);
ALTER TABLE attendance ADD CONSTRAINT attendance_member_id_event_id_key UNIQUE (member_id, event_id);
ALTER TABLE members ADD CONSTRAINT members_email_key UNIQUE (email);
ALTER TABLE attendance ADD CONSTRAINT attendance_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
ALTER TABLE attendance ADD CONSTRAINT attendance_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;

-- Functions
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.verify_pin(p_member_id uuid, p_pin text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
AS $function$ SELECT EXISTS ( SELECT 1 FROM members WHERE id = p_member_id AND pin = p_pin ); $function$
;

-- Triggers

-- Row Level Security + policies
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public insert attendance" ON public.attendance AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (true);
CREATE POLICY "Public read attendance" ON public.attendance AS PERMISSIVE FOR SELECT TO public
  USING (true);
CREATE POLICY "Public read events" ON public.events AS PERMISSIVE FOR SELECT TO public
  USING (true);
CREATE POLICY "Public insert members" ON public.members AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (true);
CREATE POLICY "Public read members" ON public.members AS PERMISSIVE FOR SELECT TO public
  USING (true);
CREATE POLICY "Public update members" ON public.members AS PERMISSIVE FOR UPDATE TO public
  USING (true);
