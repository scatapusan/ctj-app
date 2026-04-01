import {
  createBrowserClient as _createBrowserClient,
  createServerClient as _createServerClient,
} from '@supabase/ssr'

/** All member columns EXCEPT `pin` — use this instead of select("*") */
export const MEMBER_COLUMNS = "id,email,first_name,last_name,middle_name,contact_number,facebook_link,address,birthdate,photo_url,discipler_name,disciples,prospect_disciples,lifeline_leader,lifeline_co_leaders,lifeline_members,ministry_involvements,is_youth_ya_core,completed_reach,completed_fresh_start,completed_freedom_day,completed_grand_day,is_admin,nickname,gender,marital_status,spouse_name,children_names,father_name,mother_name,emergency_contact_name,emergency_contact_number,occupation,date_joined_ctjcc,spiritual_birthday,baptized_in_water,member_group,is_guest,privacy_consent_at,created_at,updated_at"
import { type ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies'

export function createBrowserClient() {
  return _createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export function createServerClient(cookieStore: ReadonlyRequestCookies) {
  return _createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll called from a Server Component — cookies can't be set.
            // Middleware handles session refresh instead.
          }
        },
      },
    }
  )
}
