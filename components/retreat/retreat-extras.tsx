"use client"

import { useState } from "react"
import type { MemberSummary, RetreatSelection, RetreatRegistrationSummary } from "@/lib/types"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { RetreatDetailsFields, computeAge, suggestCategory, showsBabyPhoto } from "./retreat-details-fields"
import { uploadBabyPhoto } from "./upload-baby-photo"
import { Loader2, CheckCircle2 } from "lucide-react"

interface RetreatExtrasProps {
  member: MemberSummary
  eventId: string
  /** Day-of walk-in: record directly as attended instead of pre-registered. */
  walkIn?: boolean
  /**
   * Present when an existing registration is being CORRECTED rather than
   * created: prefills the category and reports whether a photo is already on
   * file. Switches the form to update mode.
   */
  existing?: RetreatRegistrationSummary | null
  onSuccess: (firstName: string) => void
}

/**
 * Retreat pre-registration for a member already in the system: greet them,
 * then ask ONLY the retreat-specific questions. We ask the birthday even
 * though it may be on file — the lookup endpoint deliberately returns no PII
 * (that sits behind the PIN), and category depends on it. Nothing on the
 * member profile is written; the answers live on the attendance row.
 *
 * Core is pre-selected when the roster recognises them as core, but it's just
 * a prefill — the roster is often stale, so they can pick anything.
 */
export function RetreatExtras({ member, eventId, walkIn, existing, onSuccess }: RetreatExtrasProps) {
  const isUpdate = !!existing
  const [birthdate, setBirthdate] = useState("")
  const [selection, setSelection] = useState<RetreatSelection | null>(
    existing
      ? existing.is_core
        ? "core"
        : existing.category
      : member.is_core
        ? "core"
        : null,
  )
  const [guardianName, setGuardianName] = useState("")
  const [guardianContact, setGuardianContact] = useState("")
  const [babyPhotoFile, setBabyPhotoFile] = useState<File | null>(null)
  const [babyPhotoPreview, setBabyPhotoPreview] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initials = (member.first_name?.[0] || "") + (member.last_name?.[0] || "")

  function handleBabyPhoto(file: File | null) {
    if (babyPhotoPreview) URL.revokeObjectURL(babyPhotoPreview)
    if (!file) {
      setBabyPhotoFile(null)
      setBabyPhotoPreview(null)
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Photo must be under 5MB.")
      return
    }
    setError(null)
    setBabyPhotoFile(file)
    setBabyPhotoPreview(URL.createObjectURL(file))
  }

  function validate(): string | null {
    if (!birthdate) return "Birthday is required."
    const age = computeAge(birthdate)
    if (age === null || age < 0 || age > 100) return "Please enter a valid birthday."
    if (age < 12) return "The retreat is for ages 12 and up — please ask a leader to help you register."
    if (!selection) return "Please choose your category."
    // On an update the server keeps whatever is already on file, so only ask
    // for a photo when YA genuinely has none yet.
    if (selection === "ya" && !babyPhotoFile && !existing?.has_baby_photo) {
      return "Please add your baby or childhood photo."
    }
    // Same for guardian details — already-saved values satisfy the rule.
    if (age < 18 && !isUpdate && (!guardianName.trim() || !guardianContact.trim())) {
      return "We need your parent/guardian's name and contact number."
    }
    return null
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }

    setLoading(true)
    setError(null)

    try {
      let babyPhotoUrl: string | null = null
      if (showsBabyPhoto(selection) && babyPhotoFile) {
        try {
          babyPhotoUrl = await uploadBabyPhoto(babyPhotoFile)
        } catch {
          setError("Your photo couldn't be uploaded. Check your connection and try again.")
          setLoading(false)
          return
        }
      }

      const res = await fetch("/api/attend/retreat-register", {
        method: isUpdate ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          memberId: member.id,
          ...(isUpdate ? {} : { walkIn: walkIn === true }),
          retreat: {
            birthdate,
            // Core is a label on top of the age bracket: the bracket is still
            // stored (derived from the birthday) so reports keep both.
            category: selection === "core" ? suggestCategory(computeAge(birthdate)) : selection,
            is_core: selection === "core",
            baby_photo_url: babyPhotoUrl,
            guardian_name: guardianName.trim() || null,
            guardian_contact: guardianContact.trim() || null,
          },
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || "Failed to register. Please try again.")
        setLoading(false)
        return
      }

      onSuccess(member.first_name)
    } catch {
      setError("Network error. Please check your connection.")
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="flex items-center gap-3">
        <Avatar className="h-14 w-14 border-2 border-foreground">
          {member.photo_url ? <AvatarImage src={member.photo_url} alt={member.first_name} /> : null}
          <AvatarFallback className="text-lg font-bold bg-secondary text-foreground">
            {initials.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-extrabold leading-tight text-foreground">
              {isUpdate ? `Update your details, ${member.first_name}` : `Hi, ${member.first_name}!`}
            </h2>
            {member.is_core && (
              // Roster recognition — it only pre-selects Core below; the
              // registrant can still pick a different category.
              <span className="text-[11px] px-2 py-0.5 rounded-full font-bold bg-secondary text-foreground ring-1 ring-foreground">
                Core
              </span>
            )}
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            {isUpdate
              ? "You're already signed up — change anything below and save. Your spot stays."
              : member.is_core
                ? "We've pre-selected Core for you — change it below if that's not right."
                : "Just a few retreat questions and you're in."}
          </p>
        </div>
      </div>

      <RetreatDetailsFields
        idPrefix="rtx"
        birthdate={birthdate}
        onBirthdateChange={setBirthdate}
        selection={selection}
        onSelectionChange={setSelection}
        guardianName={guardianName}
        onGuardianNameChange={setGuardianName}
        guardianContact={guardianContact}
        onGuardianContactChange={setGuardianContact}
        babyPhotoFile={babyPhotoFile}
        babyPhotoPreview={babyPhotoPreview}
        onBabyPhotoSelect={handleBabyPhoto}
        disabled={loading}
      />

      {isUpdate && existing?.has_baby_photo && (
        <p className="text-xs font-medium text-muted-foreground">
          You already have a baby photo on file — you only need to pick one if
          you want to replace it.
        </p>
      )}

      {error && (
        <div className="rounded-xl border-2 border-destructive/40 bg-destructive/10 p-3 text-sm font-semibold text-destructive" role="alert">
          {error}
        </div>
      )}

      <Button type="submit" size="lg" className="w-full min-h-[52px] text-lg" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="size-5 animate-spin mr-2" />
            {isUpdate ? "Saving..." : "Signing you up..."}
          </>
        ) : (
          <>
            <CheckCircle2 className="size-5 mr-2" />
            {isUpdate ? "Save Changes" : walkIn ? "Check In" : "Pre-register"}
          </>
        )}
      </Button>
    </form>
  )
}
