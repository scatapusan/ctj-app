"use client"

import { useState } from "react"
import { createBrowserClient, MEMBER_COLUMNS } from "@/lib/supabase"
import type { Member } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Loader2, Mail } from "lucide-react"

interface ProfileEmailLookupProps {
  onMemberFound: (member: Member) => void
}

export function ProfileEmailLookup({ onMemberFound }: ProfileEmailLookupProps) {
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
        setError("No account found with this email. Please check in to an event first to register.")
        setLoading(false)
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
      <div className="text-center space-y-1 pb-2">
        <h2 className="text-lg font-semibold gradient-text">Update Your Profile</h2>
        <p className="text-sm text-muted-foreground">
          Enter your email to find your profile
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="profile-email" className="text-muted-foreground">
          Email Address
        </Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-orange-400/60" />
          <Input
            id="profile-email"
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
          "Find My Profile"
        )}
      </Button>
    </form>
  )
}
