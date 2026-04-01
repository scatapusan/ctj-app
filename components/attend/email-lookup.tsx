"use client"

import { useState } from "react"
import { createBrowserClient, MEMBER_COLUMNS } from "@/lib/supabase"
import type { Member } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Loader2, Mail, UserPlus, UserCheck2 } from "lucide-react"

interface EmailLookupProps {
  eventId: string
  onMemberFound: (member: Member) => void
  onNewMember: (email: string) => void
  onAlreadyCheckedIn: (member: Member) => void
  onGuestCheckIn: () => void
}

export function EmailLookup({
  eventId,
  onMemberFound,
  onNewMember,
  onAlreadyCheckedIn,
  onGuestCheckIn,
}: EmailLookupProps) {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showNotFound, setShowNotFound] = useState(false)
  const [notFoundEmail, setNotFoundEmail] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const trimmed = email.trim().toLowerCase()
    if (!trimmed) {
      setError("Please enter your email address.")
      return
    }

    setLoading(true)

    try {
      const supabase = createBrowserClient()

      const { data: member, error: memberError } = await supabase
        .from("members")
        .select(MEMBER_COLUMNS)
        .eq("email", trimmed)
        .maybeSingle()

      if (memberError) {
        setError("Something went wrong. Please try again.")
        console.error(memberError)
        setLoading(false)
        return
      }

      if (!member) {
        setNotFoundEmail(trimmed)
        setShowNotFound(true)
        setLoading(false)
        return
      }

      const { data: existingAttendance } = await supabase
        .from("attendance")
        .select("id")
        .eq("member_id", member.id)
        .eq("event_id", eventId)
        .maybeSingle()

      if (existingAttendance) {
        onAlreadyCheckedIn(member as Member)
        return
      }

      onMemberFound(member as Member)
    } catch {
      setError("Network error. Please check your connection.")
    } finally {
      setLoading(false)
    }
  }

  // Show choice screen when member not found
  if (showNotFound) {
    return (
      <div className="space-y-5 text-center">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            No account found for <span className="text-orange-400 font-medium">{notFoundEmail}</span>
          </p>
          <p className="text-sm text-muted-foreground">How would you like to proceed?</p>
        </div>

        <div className="space-y-3">
          <Button
            variant="gradient"
            size="lg"
            className="w-full min-h-[48px] text-base font-semibold"
            onClick={() => onNewMember(notFoundEmail)}
          >
            <UserPlus className="size-4 mr-2" />
            Register as Member
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/[0.06]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-3 text-muted-foreground/60">or</span>
            </div>
          </div>

          <Button
            variant="outline"
            size="lg"
            className="w-full min-h-[48px] text-base"
            onClick={onGuestCheckIn}
          >
            <UserCheck2 className="size-4 mr-2" />
            I&apos;m a Guest
          </Button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => { setShowNotFound(false); setEmail("") }}
        >
          Try a different email
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email" className="text-muted-foreground">
          Email Address
        </Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-orange-400/60" />
          <Input
            id="email"
            type="email"
            placeholder="your.email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 pl-10 text-base"
            autoComplete="email"
            autoFocus
            disabled={loading}
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
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
            Looking you up...
          </>
        ) : (
          "Submit"
        )}
      </Button>
    </form>
  )
}
