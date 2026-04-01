import { createClient } from "@supabase/supabase-js"

/** Supabase client for API route handlers — uses service role key to bypass RLS */
export function createRouteHandlerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
