"use client"

import { useState, useRef } from "react"
import { createBrowserClient } from "@/lib/supabase"
import { toast } from "@/lib/toast"
import { differenceInYears, parse } from "date-fns"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { Loader2, Camera, X, UserPlus, Lock } from "lucide-react"

interface RegistrationFormProps {
  email: string
  eventId: string
  onSuccess: (firstName: string) => void
}

export function RegistrationForm({
  email,
  eventId,
  onSuccess,
}: RegistrationFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Required
  const [firstName, setFirstName] = useState("")
  const [middleName, setMiddleName] = useState("")
  const [lastName, setLastName] = useState("")

  // New church-compatible fields (youth-appropriate)
  const [nickname, setNickname] = useState("")
  const [gender, setGender] = useState("")
  const [fatherName, setFatherName] = useState("")
  const [motherName, setMotherName] = useState("")
  const [emergencyContactName, setEmergencyContactName] = useState("")
  const [emergencyContactNumber, setEmergencyContactNumber] = useState("")
  const [occupation, setOccupation] = useState("")
  const [baptizedInWater, setBaptizedInWater] = useState(false)

  // Optional
  const [birthdate, setBirthdate] = useState("")
  const [contactNumber, setContactNumber] = useState("")
  const [facebookLink, setFacebookLink] = useState("")
  const [address, setAddress] = useState("")
  const [disciplerName, setDisciplerName] = useState("")
  const [disciples, setDisciples] = useState("")
  const [prospectDisciples, setProspectDisciples] = useState("")
  const [lifelineLeader, setLifelineLeader] = useState("")
  const [lifelineCoLeaders, setLifelineCoLeaders] = useState("")
  const [lifelineMembers, setLifelineMembers] = useState("")
  const [ministryInvolvements, setMinistryInvolvements] = useState("")

  // Toggles
  const [completedReach, setCompletedReach] = useState(false)
  const [completedFreshStart, setCompletedFreshStart] = useState(false)
  const [completedFreedomDay, setCompletedFreedomDay] = useState(false)
  const [completedGrandDay, setCompletedGrandDay] = useState(false)

  // Privacy consent
  const [privacyConsent, setPrivacyConsent] = useState(false)

  // PIN (optional, defaults to 1234)
  const [pin, setPin] = useState("")

  // Photo
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  // Form state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Computed age
  const age = birthdate
    ? differenceInYears(new Date(), parse(birthdate, "yyyy-MM-dd", new Date()))
    : null

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      setError("Photo must be under 5MB.")
      return
    }

    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setError(null)
  }

  function removePhoto() {
    setPhotoFile(null)
    if (photoPreview) URL.revokeObjectURL(photoPreview)
    setPhotoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!firstName.trim()) errors.firstName = "First name is required"
    if (!lastName.trim()) errors.lastName = "Last name is required"
    if (!privacyConsent) errors.privacy = "You must agree to the Privacy Policy"
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    setError(null)

    try {
      const supabase = createBrowserClient()
      let photoUrl: string | null = null

      if (photoFile) {
        const ext = photoFile.name.split(".").pop()
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

        const { error: uploadError } = await supabase.storage
          .from("member-photos")
          .upload(fileName, photoFile)

        if (uploadError) {
          console.error("Photo upload error:", uploadError)
          toast.warning("Profile photo couldn't be uploaded", {
            description: "We saved your registration — try adding a photo later.",
          })
        } else {
          const { data: urlData } = supabase.storage
            .from("member-photos")
            .getPublicUrl(fileName)
          photoUrl = urlData.publicUrl
        }
      }

      // Member creation, atomic first check-in, and Google Sheets sync now run
      // server-side (service role). Privilege flags are never sent/accepted.
      const res = await fetch("/api/attend/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          email,
          privacyConsent,
          member: {
            first_name: firstName.trim(),
            middle_name: middleName.trim() || null,
            last_name: lastName.trim(),
            nickname: nickname.trim() || null,
            gender: gender || null,
            birthdate: birthdate || null,
            contact_number: contactNumber.trim() || null,
            facebook_link: facebookLink.trim() || null,
            address: address.trim() || null,
            occupation: occupation.trim() || null,
            father_name: fatherName.trim() || null,
            mother_name: motherName.trim() || null,
            emergency_contact_name: emergencyContactName.trim() || null,
            emergency_contact_number: emergencyContactNumber.trim() || null,
            discipler_name: disciplerName.trim() || null,
            disciples: disciples.trim() || null,
            prospect_disciples: prospectDisciples.trim() || null,
            lifeline_leader: lifelineLeader.trim() || null,
            lifeline_co_leaders: lifelineCoLeaders.trim() || null,
            lifeline_members: lifelineMembers.trim() || null,
            ministry_involvements: ministryInvolvements.trim() || null,
            completed_reach: completedReach,
            completed_fresh_start: completedFreshStart,
            completed_freedom_day: completedFreedomDay,
            completed_grand_day: completedGrandDay,
            baptized_in_water: baptizedInWater,
            photo_url: photoUrl,
            ...(pin.length === 4 ? { pin } : {}),
          },
        }),
      })

      if (!res.ok) {
        if (res.status === 409) {
          setError("This email is already registered. Go back and try again.")
        } else {
          setError("Failed to register. Please try again.")
        }
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
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Personal Info */}
      <section className="space-y-4">
        <SectionHeader>Personal Information</SectionHeader>

        <div className="space-y-1.5">
          <Label htmlFor="email-display" className="text-muted-foreground">Email</Label>
          <Input
            id="email-display"
            type="email"
            value={email}
            readOnly
            className="h-12 text-base opacity-60"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="first-name" className="text-muted-foreground">
              First Name <span className="text-accent">*</span>
            </Label>
            <Input
              id="first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Juan"
              className="h-12 text-base"
              aria-invalid={!!fieldErrors.firstName}
            />
            {fieldErrors.firstName && (
              <p className="text-xs text-destructive">{fieldErrors.firstName}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last-name" className="text-muted-foreground">
              Last Name <span className="text-accent">*</span>
            </Label>
            <Input
              id="last-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Dela Cruz"
              className="h-12 text-base"
              aria-invalid={!!fieldErrors.lastName}
            />
            {fieldErrors.lastName && (
              <p className="text-xs text-destructive">{fieldErrors.lastName}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="middle-name" className="text-muted-foreground">Middle Name</Label>
            <Input
              id="middle-name"
              value={middleName}
              onChange={(e) => setMiddleName(e.target.value)}
              placeholder="Santos"
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nickname" className="text-muted-foreground">Nickname</Label>
            <Input
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. JD"
              className="h-12 text-base"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="gender" className="text-muted-foreground">Gender</Label>
            <select
              id="gender"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="flex w-full h-12 rounded-xl border-2 border-input bg-card px-3 py-2 text-base text-foreground ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-foreground"
            >
              <option value="" className="bg-card">Select</option>
              <option value="Male" className="bg-card">Male</option>
              <option value="Female" className="bg-card">Female</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="occupation" className="text-muted-foreground">Occupation</Label>
            <Input
              id="occupation"
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              placeholder="Student, etc."
              className="h-12 text-base"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="birthdate" className="text-muted-foreground">Birthdate</Label>
          <Input
            id="birthdate"
            type="date"
            value={birthdate}
            onChange={(e) => setBirthdate(e.target.value)}
            className="h-12 text-base"
          />
          {age !== null && age >= 0 && (
            <p className="text-sm text-muted-foreground">
              Age: <span className="font-medium text-accent">{age} years old</span>
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="contact" className="text-muted-foreground">Contact Number</Label>
          <Input
            id="contact"
            type="tel"
            value={contactNumber}
            onChange={(e) => setContactNumber(e.target.value)}
            placeholder="09XX XXX XXXX"
            className="h-12 text-base"
          />
        </div>
      </section>

      <Separator className="bg-secondary/60" />

      {/* Social & Address */}
      <section className="space-y-4">
        <SectionHeader>Social & Address</SectionHeader>

        <div className="space-y-1.5">
          <Label htmlFor="facebook" className="text-muted-foreground">Facebook Link / Name</Label>
          <Input
            id="facebook"
            value={facebookLink}
            onChange={(e) => setFacebookLink(e.target.value)}
            placeholder="facebook.com/yourname"
            className="h-12 text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="address" className="text-muted-foreground">Complete Address</Label>
          <Input
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, Barangay, City"
            className="h-12 text-base"
          />
        </div>
      </section>

      <Separator className="bg-secondary/60" />

      {/* Family */}
      <section className="space-y-4">
        <SectionHeader>Family</SectionHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="father-name" className="text-muted-foreground">Father&apos;s Name</Label>
            <Input
              id="father-name"
              value={fatherName}
              onChange={(e) => setFatherName(e.target.value)}
              placeholder="Full name"
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mother-name" className="text-muted-foreground">Mother&apos;s Name</Label>
            <Input
              id="mother-name"
              value={motherName}
              onChange={(e) => setMotherName(e.target.value)}
              placeholder="Full name"
              className="h-12 text-base"
            />
          </div>
        </div>
      </section>

      <Separator className="bg-secondary/60" />

      {/* Emergency Contact */}
      <section className="space-y-4">
        <SectionHeader>Emergency Contact</SectionHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ec-name" className="text-muted-foreground">Contact Person</Label>
            <Input
              id="ec-name"
              value={emergencyContactName}
              onChange={(e) => setEmergencyContactName(e.target.value)}
              placeholder="Name"
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ec-number" className="text-muted-foreground">Contact Number</Label>
            <Input
              id="ec-number"
              type="tel"
              value={emergencyContactNumber}
              onChange={(e) => setEmergencyContactNumber(e.target.value)}
              placeholder="09XX XXX XXXX"
              className="h-12 text-base"
            />
          </div>
        </div>
      </section>

      <Separator className="bg-secondary/60" />

      {/* Photo */}
      <section className="space-y-4">
        <SectionHeader>Photo</SectionHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handlePhotoSelect}
          className="hidden"
        />

        {photoPreview ? (
          <div className="relative w-32 h-32 mx-auto">
            <img
              src={photoPreview}
              alt="Preview"
              className="w-full h-full rounded-xl object-cover ring-2 ring-foreground"
            />
            <button
              type="button"
              onClick={removePhoto}
              className="absolute -top-2 -right-2 rounded-full bg-destructive text-destructive-foreground p-1 border-2 border-card hover:bg-destructive/90 transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border py-8 text-muted-foreground hover:border-foreground hover:text-foreground transition-all duration-300 group"
          >
            <div className="rounded-full bg-secondary p-3 group-hover:bg-secondary transition-colors">
              <Camera className="size-6" />
            </div>
            <span className="text-sm font-medium">Tap to take or upload a photo</span>
          </button>
        )}
      </section>

      <Separator className="bg-secondary/60" />

      {/* Discipleship */}
      <section className="space-y-4">
        <SectionHeader>Discipleship</SectionHeader>

        <div className="space-y-1.5">
          <Label htmlFor="discipler" className="text-muted-foreground">Discipler Name</Label>
          <Input
            id="discipler"
            value={disciplerName}
            onChange={(e) => setDisciplerName(e.target.value)}
            placeholder="Leave empty if none"
            className="h-12 text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="disciples" className="text-muted-foreground">Names of Disciples</Label>
          <Textarea
            id="disciples"
            value={disciples}
            onChange={(e) => setDisciples(e.target.value)}
            placeholder="Separate by comma"
            className="text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="prospect-disciples" className="text-muted-foreground">Prospect Disciples</Label>
          <Textarea
            id="prospect-disciples"
            value={prospectDisciples}
            onChange={(e) => setProspectDisciples(e.target.value)}
            placeholder="Separate by comma"
            className="text-base"
          />
        </div>
      </section>

      <Separator className="bg-secondary/60" />

      {/* Lifeline */}
      <section className="space-y-4">
        <SectionHeader>Lifeline Group</SectionHeader>

        <div className="space-y-1.5">
          <Label htmlFor="ll-leader" className="text-muted-foreground">Lifeline Leader</Label>
          <Input
            id="ll-leader"
            value={lifelineLeader}
            onChange={(e) => setLifelineLeader(e.target.value)}
            className="h-12 text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ll-co-leaders" className="text-muted-foreground">Lifeline Co-Leaders</Label>
          <Input
            id="ll-co-leaders"
            value={lifelineCoLeaders}
            onChange={(e) => setLifelineCoLeaders(e.target.value)}
            className="h-12 text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ll-members" className="text-muted-foreground">Lifeline Members</Label>
          <Input
            id="ll-members"
            value={lifelineMembers}
            onChange={(e) => setLifelineMembers(e.target.value)}
            className="h-12 text-base"
          />
        </div>
      </section>

      <Separator className="bg-secondary/60" />

      {/* Ministry */}
      <section className="space-y-4">
        <SectionHeader>Ministry</SectionHeader>

        <div className="space-y-1.5">
          <Label htmlFor="ministry" className="text-muted-foreground">Current Ministry Involvements</Label>
          <Textarea
            id="ministry"
            value={ministryInvolvements}
            onChange={(e) => setMinistryInvolvements(e.target.value)}
            placeholder="e.g. Worship Team, Tech, Ushering"
            className="text-base"
          />
        </div>
      </section>

      <Separator className="bg-secondary/60" />

      {/* Status Toggles */}
      <section className="space-y-4">
        <SectionHeader>Status</SectionHeader>

        <div className="space-y-3">
          <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
            Completed Seminars
          </p>

          <ToggleRow
            label="REACH Seminar"
            checked={completedReach}
            onCheckedChange={setCompletedReach}
          />
          <ToggleRow
            label="Fresh Start"
            checked={completedFreshStart}
            onCheckedChange={setCompletedFreshStart}
          />
          <ToggleRow
            label="Freedom Day"
            checked={completedFreedomDay}
            onCheckedChange={setCompletedFreedomDay}
          />
          <ToggleRow
            label="Grand Day"
            checked={completedGrandDay}
            onCheckedChange={setCompletedGrandDay}
          />

          <div className="h-px bg-secondary/60" />

          <ToggleRow
            label="Baptized in Water"
            checked={baptizedInWater}
            onCheckedChange={setBaptizedInWater}
          />
        </div>
      </section>

      <Separator className="bg-secondary/60" />

      {/* PIN Setup */}
      <section className="space-y-4">
        <SectionHeader>Security PIN</SectionHeader>
        <p className="text-xs font-medium text-muted-foreground">
          Set a 4-digit PIN to protect your profile. If you skip this, a starter
          PIN is assigned — ask a leader to help you change it anytime.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="pin" className="text-muted-foreground">
            <Lock className="size-3.5 inline mr-1" />
            4-Digit PIN
          </Label>
          <Input
            id="pin"
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="4 digits"
            className="h-12 text-base tracking-widest text-center max-w-[200px]"
          />
        </div>
      </section>

      <Separator className="bg-secondary/60" />

      {/* Privacy Consent */}
      <section className="space-y-3">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Your information is collected for church attendance tracking and member care by CTJCC Marikina.
        </p>
        <div className="flex items-start gap-3 rounded-xl border-2 border-foreground bg-secondary/50 p-4">
          <Checkbox
            id="privacy-consent"
            checked={privacyConsent}
            onCheckedChange={(checked) => setPrivacyConsent(checked === true)}
            className="mt-0.5"
          />
          <label htmlFor="privacy-consent" className="text-sm font-medium text-foreground leading-relaxed cursor-pointer">
            I have read and agree to the{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent underline underline-offset-2 hover:text-accent"
            >
              Privacy Policy
            </a>
          </label>
        </div>
        {fieldErrors.privacy && (
          <p className="text-xs text-destructive">{fieldErrors.privacy}</p>
        )}
      </section>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full min-h-[52px] text-lg"
        disabled={loading}
      >
        {loading ? (
          <>
            <Loader2 className="size-5 animate-spin mr-2" />
            Registering...
          </>
        ) : (
          <>
            <UserPlus className="size-5 mr-2" />
            Register & Check In
          </>
        )}
      </Button>
    </form>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-extrabold text-foreground uppercase tracking-wider">
      {children}
    </h3>
  )
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  onCheckedChange: (val: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <Label className="text-base font-normal cursor-pointer text-foreground/80">{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}
