import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Server-side PIN verification via the verify_pin RPC (service-role client).
 * Returns true/false, or null on an unexpected error.
 *
 * NOTE: PINs are still compared in plaintext by the DB function today. Batch 3
 * replaces this with a hashed comparison + per-member lockout.
 */
export async function verifyPinServer(
  supabase: SupabaseClient,
  memberId: string,
  pin: string,
): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("verify_pin", { p_member_id: memberId, p_pin: pin })
  if (error) {
    console.error("verify_pin error:", error)
    return null
  }
  return data === true
}
