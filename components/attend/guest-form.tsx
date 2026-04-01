"use client"

import { useState } from "react"
import { createBrowserClient } from "@/lib/supabase"
import { syncMember, syncAttendance } from "@/lib/sync-sheets"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, UserCheck2 } from "lucide-react"

interface GuestFormProps {
  eventId: string
  onSuccess: (firstName: string) => void
}

export function GuestForm({ eventId, onSuccess }: GuestFormProps) {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [contactNumber, setContactNumber] = useState("")
  const [privacyConsent, setPrivacyConsent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!firstName.trim()) {
      setError("First name is required.")
      return
    }
    if (!lastName.trim()) {
      setError("Last name is required.")
      return
    }
    if (!privacyConsent) {
      setError("You must agree to the Privacy Policy.")
      return
    }

    setLoading(true)
    setError(null)

    try {
      const supabase = createBrowserClient()

      // Create a guest record with a placeholder email (guest-timestamp@guest.local)
      const guestEmail = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@guest.local`

      const { data: newMember, error: memberError } = await supabase
        .from("members")
        .insert({
          email: guestEmail,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          contact_number: contactNumber.trim() || null,
          is_guest: true,
          privacy_consent_at: new Date().toISOString(),
        })
        .select("id")
        .single()

      if (memberError) {
        setError("Failed to register. Please try again.")
        console.error(memberError)
        setLoading(false)
        return
      }

      // Record attendance
      const { error: attendError } = await supabase
        .from("attendance")
        .insert({ member_id: newMember.id, event_id: eventId })

      if (attendError) {
        console.error("Attendance error:", attendError)
      }

      // Sync to Google Sheets (fire-and-forget)
      syncMember(newMember.id)
      syncAttendance(newMember.id, eventId)

      onSuccess(firstName.trim())
    } catch {
      setError("Network error. Please check your connection.")
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="text-center space-y-1 mb-2">
        <h2 className="text-lg font-semibold text-foreground">Guest Check-in</h2>
        <p className="text-sm text-muted-foreground">
          Welcome! Just a few details and you&apos;re in.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="guest-first" className="text-muted-foreground">
            First Name <span className="text-orange-400">*</span>
          </Label>
          <Input
            id="guest-first"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Juan"
            className="h-12 text-base"
            autoFocus
            disabled={loading}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="guest-last" className="text-muted-foreground">
            Last Name <span className="text-orange-400">*</span>
          </Label>
          <Input
            id="guest-last"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Dela Cruz"
            className="h-12 text-base"
            disabled={loading}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="guest-contact" className="text-muted-foreground">
          Contact Number
        </Label>
        <Input
          id="guest-contact"
          type="tel"
          value={contactNumber}
          onChange={(e) => setContactNumber(e.target.value)}
          placeholder="09XX XXX XXXX (optional)"
          className="h-12 text-base"
          disabled={loading}
        />
      </div>

      {/* Privacy Consent */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Your name and contact are used for church attendance tracking only.
        </p>
        <div className="flex items-start gap-3">
          <Checkbox
            id="guest-privacy"
            checked={privacyConsent}
            onCheckedChange={(checked) => setPrivacyConsent(checked === true)}
            className="mt-0.5"
          />
          <label htmlFor="guest-privacy" className="text-sm text-foreground/80 leading-relaxed cursor-pointer">
            I agree to the{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-400 underline underline-offset-2 hover:text-orange-300"
            >
              Privacy Policy
            </a>
          </label>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <Button
        type="submit"
        variant="gradient"
        size="lg"
        className="w-full min-h-[48px] text-base font-semibold"
        disabled={loading}
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin mr-2" />
            Checking in...
          </>
        ) : (
          <>
            <UserCheck2 className="size-4 mr-2" />
            Check In as Guest
          </>
        )}
      </Button>
    </form>
  )
}
