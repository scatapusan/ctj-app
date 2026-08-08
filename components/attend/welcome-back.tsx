"use client"

import { useState } from "react"
import type { MemberSummary } from "@/lib/types"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Loader2, Hand, Pencil } from "lucide-react"

interface WelcomeBackProps {
  member: MemberSummary
  eventId: string
  onSuccess: () => void
  onEditProfile: () => void
}

export function WelcomeBack({ member, eventId, onSuccess, onEditProfile }: WelcomeBackProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initials =
    (member.first_name?.[0] || "") + (member.last_name?.[0] || "")

  async function handleConfirm() {
    setLoading(true)
    setError(null)

    try {
      // Check-in + Google Sheets sync now happen server-side (service role).
      // A repeat check-in is treated as success by the route.
      const res = await fetch("/api/attend/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, memberId: member.id }),
      })

      if (!res.ok) {
        setError("Failed to record attendance. Please try again.")
        setLoading(false)
        return
      }

      onSuccess()
    } catch {
      setError("Network error. Please check your connection.")
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center text-center space-y-6 py-4">
      <div className="relative">
        <Avatar className="h-24 w-24 border-[2.5px] border-foreground shadow-pop">
          {member.photo_url ? (
            <AvatarImage src={member.photo_url} alt={member.first_name} />
          ) : null}
          <AvatarFallback className="text-2xl font-bold bg-secondary text-foreground">
            {initials.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="absolute -bottom-1 -right-1 rounded-full bg-primary border-2 border-foreground p-1.5">
          <Hand className="size-3.5 text-foreground" />
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-lg font-medium text-muted-foreground">Welcome back!</p>
        <p className="text-3xl font-extrabold text-foreground">
          {member.first_name}
        </p>
      </div>

      {error && (
        <p className="text-sm font-semibold text-destructive" role="alert">{error}</p>
      )}

      <Button
        size="lg"
        className="w-full min-h-[52px] text-lg"
        onClick={handleConfirm}
        disabled={loading}
      >
        {loading ? (
          <>
            <Loader2 className="size-5 animate-spin mr-2" />
            Confirming...
          </>
        ) : (
          "Confirm Attendance"
        )}
      </Button>

      <Button
        variant="ghost"
        size="lg"
        className="w-full min-h-[44px] text-base text-muted-foreground hover:text-foreground"
        onClick={onEditProfile}
      >
        <Pencil className="size-4 mr-2" />
        Edit My Profile
      </Button>
    </div>
  )
}
