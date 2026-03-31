"use client"

import { useState, useRef } from "react"
import { createBrowserClient } from "@/lib/supabase"
import { differenceInYears, parse } from "date-fns"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Loader2, Camera, X, UserPlus } from "lucide-react"

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
  const [isYouthYaCore, setIsYouthYaCore] = useState(false)
  const [completedReach, setCompletedReach] = useState(false)
  const [completedFreshStart, setCompletedFreshStart] = useState(false)
  const [completedFreedomDay, setCompletedFreedomDay] = useState(false)
  const [completedGrandDay, setCompletedGrandDay] = useState(false)

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
        } else {
          const { data: urlData } = supabase.storage
            .from("member-photos")
            .getPublicUrl(fileName)
          photoUrl = urlData.publicUrl
        }
      }

      const { data: newMember, error: memberError } = await supabase
        .from("members")
        .insert({
          email,
          first_name: firstName.trim(),
          middle_name: middleName.trim() || null,
          last_name: lastName.trim(),
          birthdate: birthdate || null,
          contact_number: contactNumber.trim() || null,
          facebook_link: facebookLink.trim() || null,
          address: address.trim() || null,
          photo_url: photoUrl,
          discipler_name: disciplerName.trim() || null,
          disciples: disciples.trim() || null,
          prospect_disciples: prospectDisciples.trim() || null,
          lifeline_leader: lifelineLeader.trim() || null,
          lifeline_co_leaders: lifelineCoLeaders.trim() || null,
          lifeline_members: lifelineMembers.trim() || null,
          ministry_involvements: ministryInvolvements.trim() || null,
          is_youth_ya_core: isYouthYaCore,
          completed_reach: completedReach,
          completed_fresh_start: completedFreshStart,
          completed_freedom_day: completedFreedomDay,
          completed_grand_day: completedGrandDay,
        })
        .select("id")
        .single()

      if (memberError) {
        if (memberError.code === "23505") {
          setError("This email is already registered. Go back and try again.")
        } else {
          setError("Failed to register. Please try again.")
          console.error(memberError)
        }
        setLoading(false)
        return
      }

      const { error: attendError } = await supabase
        .from("attendance")
        .insert({ member_id: newMember.id, event_id: eventId })

      if (attendError) {
        console.error("Attendance error:", attendError)
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
              First Name <span className="text-emerald-400">*</span>
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
              <p className="text-xs text-red-400">{fieldErrors.firstName}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last-name" className="text-muted-foreground">
              Last Name <span className="text-emerald-400">*</span>
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
              <p className="text-xs text-red-400">{fieldErrors.lastName}</p>
            )}
          </div>
        </div>

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
              Age: <span className="font-medium text-emerald-400">{age} years old</span>
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

      <Separator className="bg-white/[0.06]" />

      {/* Social & Address */}
      <section className="space-y-4">
        <SectionHeader>Social & Address</SectionHeader>

        <div className="space-y-1.5">
          <Label htmlFor="facebook" className="text-muted-foreground">Facebook Link / Name</Label>
          <Input
            id="facebook"
            value={facebookLink}
            onChange={(e) => setFacebookLink(e.target.value)}
            placeholder="facebook.com/yourname or your display name"
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

      <Separator className="bg-white/[0.06]" />

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
              className="w-full h-full rounded-xl object-cover ring-2 ring-emerald-500/30"
            />
            <button
              type="button"
              onClick={removePhoto}
              className="absolute -top-2 -right-2 rounded-full bg-red-500 text-white p-1 shadow-lg hover:bg-red-400 transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-emerald-500/20 py-8 text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-400 transition-all duration-300 group"
          >
            <div className="rounded-full bg-emerald-500/10 p-3 group-hover:bg-emerald-500/20 transition-colors">
              <Camera className="size-6" />
            </div>
            <span className="text-sm font-medium">Tap to take or upload a photo</span>
          </button>
        )}
      </section>

      <Separator className="bg-white/[0.06]" />

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

      <Separator className="bg-white/[0.06]" />

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

      <Separator className="bg-white/[0.06]" />

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

      <Separator className="bg-white/[0.06]" />

      {/* Status Toggles */}
      <section className="space-y-4">
        <SectionHeader>Status</SectionHeader>

        <div className="space-y-3">
          <ToggleRow
            label="Youth / YA Core"
            checked={isYouthYaCore}
            onCheckedChange={setIsYouthYaCore}
          />

          <div className="h-px bg-white/[0.06]" />

          <p className="text-xs text-emerald-400/70 font-medium uppercase tracking-wider">
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
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <Button
        type="submit"
        variant="gradient"
        size="lg"
        className="w-full min-h-[52px] text-lg font-semibold"
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
    <h3 className="text-xs font-semibold text-emerald-400/80 uppercase tracking-wider">
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
