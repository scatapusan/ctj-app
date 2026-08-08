"use client"

import { useState } from "react"
import type { RetreatCategory } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { RetreatDetailsFields, computeAge } from "./retreat-details-fields"
import { uploadBabyPhoto } from "./upload-baby-photo"
import { Loader2, UserPlus } from "lucide-react"

interface RetreatFormProps {
  email: string
  eventId: string
  onSuccess: (firstName: string) => void
}

/** Retreat pre-registration for someone who isn't in the system yet. */
export function RetreatForm({ email, eventId, onSuccess }: RetreatFormProps) {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [nickname, setNickname] = useState("")
  const [address, setAddress] = useState("")
  const [contactNumber, setContactNumber] = useState("")

  const [birthdate, setBirthdate] = useState("")
  const [category, setCategory] = useState<RetreatCategory | null>(null)
  const [guardianName, setGuardianName] = useState("")
  const [guardianContact, setGuardianContact] = useState("")
  const [babyPhotoFile, setBabyPhotoFile] = useState<File | null>(null)
  const [babyPhotoPreview, setBabyPhotoPreview] = useState<string | null>(null)

  const [privacyConsent, setPrivacyConsent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    if (!firstName.trim() || !lastName.trim()) return "First and last name are required."
    if (!birthdate) return "Birthday is required."
    const age = computeAge(birthdate)
    if (age === null || age < 0 || age > 100) return "Please enter a valid birthday."
    if (age < 12) return "The retreat is for ages 12 and up — please ask a leader to help you register."
    if (!category) return "Please choose your category."
    if (category === "ya" && !babyPhotoFile) return "Please add your baby or childhood photo."
    if (age < 18 && (!guardianName.trim() || !guardianContact.trim())) {
      return "We need your parent/guardian's name and contact number."
    }
    if (!privacyConsent) return "Please agree to the Privacy Policy."
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
      if (category === "ya" && babyPhotoFile) {
        try {
          babyPhotoUrl = await uploadBabyPhoto(babyPhotoFile)
        } catch {
          setError("Your photo couldn't be uploaded. Check your connection and try again.")
          setLoading(false)
          return
        }
      }

      const res = await fetch("/api/attend/retreat-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          email,
          privacyConsent,
          member: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            nickname: nickname.trim() || null,
            birthdate,
            address: address.trim() || null,
            contact_number: contactNumber.trim() || null,
          },
          retreat: {
            birthdate,
            category,
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

      onSuccess(firstName.trim())
    } catch {
      setError("Network error. Please check your connection.")
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl font-extrabold leading-tight text-foreground">Sign up for the retreat</h2>
        <p className="text-sm font-medium text-muted-foreground">
          Registering as <span className="font-bold text-accent">{email}</span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="rt-first-name" className="text-muted-foreground">
            First Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="rt-first-name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="h-12 text-base"
            autoComplete="given-name"
            required
            disabled={loading}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rt-last-name" className="text-muted-foreground">
            Last Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="rt-last-name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="h-12 text-base"
            autoComplete="family-name"
            required
            disabled={loading}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rt-nickname" className="text-muted-foreground">Nickname</Label>
        <Input
          id="rt-nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="e.g. JD"
          className="h-12 text-base"
          disabled={loading}
        />
      </div>

      <RetreatDetailsFields
        idPrefix="rt"
        birthdate={birthdate}
        onBirthdateChange={setBirthdate}
        category={category}
        onCategoryChange={setCategory}
        guardianName={guardianName}
        onGuardianNameChange={setGuardianName}
        guardianContact={guardianContact}
        onGuardianContactChange={setGuardianContact}
        babyPhotoFile={babyPhotoFile}
        babyPhotoPreview={babyPhotoPreview}
        onBabyPhotoSelect={handleBabyPhoto}
        disabled={loading}
      />

      <div className="space-y-1.5">
        <Label htmlFor="rt-address" className="text-muted-foreground">Address</Label>
        <Input
          id="rt-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Street, Barangay, City"
          className="h-12 text-base"
          autoComplete="street-address"
          disabled={loading}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rt-contact" className="text-muted-foreground">Contact Number</Label>
        <Input
          id="rt-contact"
          type="tel"
          inputMode="tel"
          value={contactNumber}
          onChange={(e) => setContactNumber(e.target.value)}
          placeholder="09XX XXX XXXX"
          className="h-12 text-base"
          autoComplete="tel"
          disabled={loading}
        />
      </div>

      <div className="flex items-start gap-3 rounded-xl border-2 border-foreground bg-secondary/50 p-4">
        <Checkbox
          id="rt-privacy-consent"
          checked={privacyConsent}
          onCheckedChange={(checked) => setPrivacyConsent(checked === true)}
          className="mt-0.5"
          disabled={loading}
        />
        <label htmlFor="rt-privacy-consent" className="text-sm font-medium text-foreground leading-relaxed cursor-pointer">
          I have read and agree to the{" "}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline underline-offset-2"
          >
            Privacy Policy
          </a>
        </label>
      </div>

      {error && (
        <div className="rounded-xl border-2 border-destructive/40 bg-destructive/10 p-3 text-sm font-semibold text-destructive" role="alert">
          {error}
        </div>
      )}

      <Button type="submit" size="lg" className="w-full min-h-[52px] text-lg" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="size-5 animate-spin mr-2" />
            Signing you up...
          </>
        ) : (
          <>
            <UserPlus className="size-5 mr-2" />
            Pre-register
          </>
        )}
      </Button>
    </form>
  )
}
