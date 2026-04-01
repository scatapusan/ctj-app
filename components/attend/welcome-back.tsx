"use client"

import { useState } from "react"
import { createBrowserClient } from "@/lib/supabase"
import { syncMember, syncAttendance } from "@/lib/sync-sheets"
import type { Member } from "@/lib/types"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Loader2, HandMetal, Pencil } from "lucide-react"

interface WelcomeBackProps {
  member: Member
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
      const supabase = createBrowserClient()
      const { error: insertError } = await supabase
        .from("attendance")
        .insert({ member_id: member.id, event_id: eventId })

      if (insertError) {
        if (insertError.code === "23505") {
          onSuccess()
          return
        }
        setError("Failed to record attendance. Please try again.")
        console.error(insertError)
        setLoading(false)
        return
      }

      // Sync to Google Sheets (fire-and-forget)
      syncMember(member.id)
      syncAttendance(member.id, eventId)

      onSuccess()
    } catch {
      setError("Network error. Please check your connection.")
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center text-center space-y-6 py-4">
      <div className="relative">
        <Avatar className="h-24 w-24 ring-2 ring-orange-500/30 shadow-glow">
          {member.photo_url ? (
            <AvatarImage src={member.photo_url} alt={member.first_name} />
          ) : null}
          <AvatarFallback className="text-2xl font-semibold bg-orange-500/10 text-orange-400">
            {initials.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="absolute -bottom-1 -right-1 rounded-full bg-orange-500 p-1.5 ring-2 ring-background">
          <HandMetal className="size-3.5 text-white" />
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-lg text-muted-foreground">Welcome back!</p>
        <p className="text-3xl font-bold gradient-text">
          {member.first_name}
        </p>
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      <Button
        variant="gradient"
        size="lg"
        className="w-full min-h-[52px] text-lg font-semibold"
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
        className="w-full min-h-[44px] text-base text-muted-foreground hover:text-orange-400"
        onClick={onEditProfile}
      >
        <Pencil className="size-4 mr-2" />
        Edit My Profile
      </Button>
    </div>
  )
}
