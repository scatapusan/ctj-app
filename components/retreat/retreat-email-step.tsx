"use client"

import { useState } from "react"
import type { MemberSummary } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Loader2, Mail } from "lucide-react"

interface RetreatEmailStepProps {
  eventId: string
  /** Known member, plus whether an attendance row for this event already exists. */
  onMemberFound: (member: MemberSummary, alreadyRegistered: boolean) => void
  onNewPerson: (email: string) => void
}

/**
 * Retreat entry step: one email field. Known emails go to the short
 * existing-member step (no duplicate-registration errors); unknown emails go
 * to the full form. Reuses /api/attend/lookup (rate-limited server-side).
 */
export function RetreatEmailStep({ eventId, onMemberFound, onNewPerson }: RetreatEmailStepProps) {
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
      const res = await fetch("/api/attend/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, eventId }),
      })

      if (res.status === 429) {
        setError("Too many lookups. Please wait a moment and try again.")
        setLoading(false)
        return
      }
      if (!res.ok) {
        setError("Something went wrong. Please try again.")
        setLoading(false)
        return
      }

      const data = await res.json()
      if (!data.found) {
        onNewPerson(trimmed)
        return
      }
      onMemberFound(data.member as MemberSummary, data.alreadyCheckedIn === true)
    } catch {
      setError("Network error. Please check your connection.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-extrabold leading-tight text-foreground">
          Let&apos;s get you signed up
        </h2>
        <p className="text-sm font-medium text-muted-foreground">
          Enter your email — we&apos;ll check if we already know you.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="retreat-email" className="text-muted-foreground">
          Email Address
        </Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            id="retreat-email"
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
        <p className="text-sm font-semibold text-destructive" role="alert">{error}</p>
      )}

      <Button type="submit" size="lg" className="w-full min-h-[48px] text-base" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin mr-2" />
            Checking...
          </>
        ) : (
          "Continue"
        )}
      </Button>
    </form>
  )
}
