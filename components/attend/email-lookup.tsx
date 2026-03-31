"use client"

import { useState } from "react"
import { createBrowserClient } from "@/lib/supabase"
import type { Member } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Loader2, Mail } from "lucide-react"

interface EmailLookupProps {
  eventId: string
  onMemberFound: (member: Member) => void
  onNewMember: (email: string) => void
  onAlreadyCheckedIn: (memberName: string) => void
}

export function EmailLookup({
  eventId,
  onMemberFound,
  onNewMember,
  onAlreadyCheckedIn,
}: EmailLookupProps) {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        .select("*")
        .eq("email", trimmed)
        .maybeSingle()

      if (memberError) {
        setError("Something went wrong. Please try again.")
        console.error(memberError)
        setLoading(false)
        return
      }

      if (!member) {
        onNewMember(trimmed)
        return
      }

      const { data: existingAttendance } = await supabase
        .from("attendance")
        .select("id")
        .eq("member_id", member.id)
        .eq("event_id", eventId)
        .maybeSingle()

      if (existingAttendance) {
        onAlreadyCheckedIn(member.first_name)
        return
      }

      onMemberFound(member as Member)
    } catch {
      setError("Network error. Please check your connection.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email" className="text-muted-foreground">
          Email Address
        </Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-emerald-400/60" />
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
