"use client"

import { useState, useRef } from "react"
import { createBrowserClient, MEMBER_COLUMNS } from "@/lib/supabase"
import { differenceInYears, parse } from "date-fns"
import type { Member } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Loader2, Camera, X, Save, Lock } from "lucide-react"

interface EditProfileProps {
  member: Member
  onSaved: (updatedMember: Member) => void
  onCancel: () => void
}

export function EditProfile({ member, onSaved, onCancel }: EditProfileProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Pre-filled state
  const [firstName, setFirstName] = useState(member.first_name)
  const [middleName, setMiddleName] = useState(member.middle_name || "")
  const [lastName, setLastName] = useState(member.last_name)
  const [birthdate, setBirthdate] = useState(member.birthdate || "")
  const [contactNumber, setContactNumber] = useState(member.contact_number || "")
  const [facebookLink, setFacebookLink] = useState(member.facebook_link || "")
  const [address, setAddress] = useState(member.address || "")
  const [disciplerName, setDisciplerName] = useState(member.discipler_name || "")
  const [disciples, setDisciples] = useState(member.disciples || "")
  const [prospectDisciples, setProspectDisciples] = useState(member.prospect_disciples || "")
  const [lifelineLeader, setLifelineLeader] = useState(member.lifeline_leader || "")
  const [lifelineCoLeaders, setLifelineCoLeaders] = useState(member.lifeline_co_leaders || "")
  const [lifelineMembers, setLifelineMembers] = useState(member.lifeline_members || "")
  const [ministryInvolvements, setMinistryInvolvements] = useState(member.ministry_involvements || "")

  // Toggles
  const [isYouthYaCore, setIsYouthYaCore] = useState(member.is_youth_ya_core)
  const [completedReach, setCompletedReach] = useState(member.completed_reach)
  const [completedFreshStart, setCompletedFreshStart] = useState(member.completed_fresh_start)
  const [completedFreedomDay, setCompletedFreedomDay] = useState(member.completed_freedom_day)
  const [completedGrandDay, setCompletedGrandDay] = useState(member.completed_grand_day)

  // Photo
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(member.photo_url)
  const [photoChanged, setPhotoChanged] = useState(false)

  // PIN change (optional)
  const [showPinChange, setShowPinChange] = useState(false)
  const [currentPin, setCurrentPin] = useState("")
  const [newPin, setNewPin] = useState("")
  const [confirmPin, setConfirmPin] = useState("")
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinSuccess, setPinSuccess] = useState(false)
  const [pinLoading, setPinLoading] = useState(false)

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
    setPhotoChanged(true)
    setError(null)
  }

  function removePhoto() {
    setPhotoFile(null)
    if (photoPreview && photoChanged) URL.revokeObjectURL(photoPreview)
    setPhotoPreview(null)
    setPhotoChanged(true)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (!firstName.trim()) errors.firstName = "First name is required"
    if (!lastName.trim()) errors.lastName = "Last name is required"
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleChangePin() {
    setPinError(null)
    setPinSuccess(false)

    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
      setPinError("PIN must be exactly 4 digits.")
      return
    }
    if (newPin !== confirmPin) {
      setPinError("New PINs don't match.")
      return
    }
    if (!currentPin) {
      setPinError("Enter your current PIN.")
      return
    }

    setPinLoading(true)

    try {
      const supabase = createBrowserClient()

      // Verify current PIN first
      const { data: valid, error: rpcError } = await supabase.rpc("verify_pin", {
        p_member_id: member.id,
        p_pin: currentPin,
      })

      if (rpcError) {
        setPinError("Something went wrong. Please try again.")
        setPinLoading(false)
        return
      }

      if (!valid) {
        setPinError("Current PIN is incorrect.")
        setPinLoading(false)
        return
      }

      // Update the PIN
      const { error: updateError } = await supabase
        .from("members")
        .update({ pin: newPin })
        .eq("id", member.id)

      if (updateError) {
        setPinError("Failed to update PIN. Please try again.")
        setPinLoading(false)
        return
      }

      setPinSuccess(true)
      setCurrentPin("")
      setNewPin("")
      setConfirmPin("")
      setTimeout(() => setShowPinChange(false), 1500)
    } catch {
      setPinError("Network error. Please check your connection.")
    } finally {
      setPinLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    setError(null)

    try {
      const supabase = createBrowserClient()
      let photoUrl: string | null = member.photo_url

      // Upload new photo if changed
      if (photoChanged && photoFile) {
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
      } else if (photoChanged && !photoFile) {
        // Photo was removed
        photoUrl = null
      }

      const updateData = {
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
        updated_at: new Date().toISOString(),
      }

      const { data: updated, error: updateError } = await supabase
        .from("members")
        .update(updateData)
        .eq("id", member.id)
        .select(MEMBER_COLUMNS)
        .single()

      if (updateError) {
        setError("Failed to update profile. Please try again.")
        console.error(updateError)
        setLoading(false)
        return
      }

      onSaved(updated as Member)
    } catch {
      setError("Network error. Please check your connection.")
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="text-center space-y-1 pb-2">
        <h2 className="text-lg font-semibold gradient-text">Edit Your Profile</h2>
        <p className="text-sm text-muted-foreground">Update your information below</p>
      </div>

      {/* Personal Info */}
      <section className="space-y-4">
        <SectionHeader>Personal Information</SectionHeader>

        <div className="space-y-1.5">
          <Label htmlFor="edit-email" className="text-muted-foreground">Email</Label>
          <Input
            id="edit-email"
            type="email"
            value={member.email}
            readOnly
            className="h-12 text-base opacity-60"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-first-name" className="text-muted-foreground">
              First Name <span className="text-emerald-400">*</span>
            </Label>
            <Input
              id="edit-first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="h-12 text-base"
              aria-invalid={!!fieldErrors.firstName}
            />
            {fieldErrors.firstName && (
              <p className="text-xs text-red-400">{fieldErrors.firstName}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-last-name" className="text-muted-foreground">
              Last Name <span className="text-emerald-400">*</span>
            </Label>
            <Input
              id="edit-last-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="h-12 text-base"
              aria-invalid={!!fieldErrors.lastName}
            />
            {fieldErrors.lastName && (
              <p className="text-xs text-red-400">{fieldErrors.lastName}</p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-middle-name" className="text-muted-foreground">Middle Name</Label>
          <Input
            id="edit-middle-name"
            value={middleName}
            onChange={(e) => setMiddleName(e.target.value)}
            className="h-12 text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-birthdate" className="text-muted-foreground">Birthdate</Label>
          <Input
            id="edit-birthdate"
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
          <Label htmlFor="edit-contact" className="text-muted-foreground">Contact Number</Label>
          <Input
            id="edit-contact"
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
          <Label htmlFor="edit-facebook" className="text-muted-foreground">Facebook Link / Name</Label>
          <Input
            id="edit-facebook"
            value={facebookLink}
            onChange={(e) => setFacebookLink(e.target.value)}
            placeholder="facebook.com/yourname or your display name"
            className="h-12 text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-address" className="text-muted-foreground">Complete Address</Label>
          <Input
            id="edit-address"
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
          <Label htmlFor="edit-discipler" className="text-muted-foreground">Discipler Name</Label>
          <Input
            id="edit-discipler"
            value={disciplerName}
            onChange={(e) => setDisciplerName(e.target.value)}
            placeholder="Leave empty if none"
            className="h-12 text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-disciples" className="text-muted-foreground">Names of Disciples</Label>
          <Textarea
            id="edit-disciples"
            value={disciples}
            onChange={(e) => setDisciples(e.target.value)}
            placeholder="Separate by comma"
            className="text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-prospect" className="text-muted-foreground">Prospect Disciples</Label>
          <Textarea
            id="edit-prospect"
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
          <Label htmlFor="edit-ll-leader" className="text-muted-foreground">Lifeline Leader</Label>
          <Input
            id="edit-ll-leader"
            value={lifelineLeader}
            onChange={(e) => setLifelineLeader(e.target.value)}
            className="h-12 text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-ll-co" className="text-muted-foreground">Lifeline Co-Leaders</Label>
          <Input
            id="edit-ll-co"
            value={lifelineCoLeaders}
            onChange={(e) => setLifelineCoLeaders(e.target.value)}
            className="h-12 text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-ll-members" className="text-muted-foreground">Lifeline Members</Label>
          <Input
            id="edit-ll-members"
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
          <Label htmlFor="edit-ministry" className="text-muted-foreground">Current Ministry Involvements</Label>
          <Textarea
            id="edit-ministry"
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
          <ToggleRow label="Youth / YA Core" checked={isYouthYaCore} onCheckedChange={setIsYouthYaCore} />

          <div className="h-px bg-white/[0.06]" />

          <p className="text-xs text-emerald-400/70 font-medium uppercase tracking-wider">
            Completed Seminars
          </p>

          <ToggleRow label="REACH Seminar" checked={completedReach} onCheckedChange={setCompletedReach} />
          <ToggleRow label="Fresh Start" checked={completedFreshStart} onCheckedChange={setCompletedFreshStart} />
          <ToggleRow label="Freedom Day" checked={completedFreedomDay} onCheckedChange={setCompletedFreedomDay} />
          <ToggleRow label="Grand Day" checked={completedGrandDay} onCheckedChange={setCompletedGrandDay} />
        </div>
      </section>

      <Separator className="bg-white/[0.06]" />

      {/* Change PIN */}
      <section className="space-y-4">
        <SectionHeader>Security</SectionHeader>

        {!showPinChange ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-sm"
            onClick={() => setShowPinChange(true)}
          >
            <Lock className="size-3.5 mr-1.5" />
            Change My PIN
          </Button>
        ) : (
          <div className="space-y-3 rounded-xl bg-white/[0.02] border border-white/[0.06] p-4">
            <div className="space-y-1.5">
              <Label htmlFor="current-pin" className="text-muted-foreground">Current PIN</Label>
              <Input
                id="current-pin"
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={currentPin}
                onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="Enter current 4-digit PIN"
                className="h-12 text-base tracking-widest text-center"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-pin" className="text-muted-foreground">New PIN</Label>
                <Input
                  id="new-pin"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="####"
                  className="h-12 text-base tracking-widest text-center"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-pin" className="text-muted-foreground">Confirm</Label>
                <Input
                  id="confirm-pin"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="####"
                  className="h-12 text-base tracking-widest text-center"
                />
              </div>
            </div>

            {pinError && (
              <p className="text-sm text-red-400">{pinError}</p>
            )}
            {pinSuccess && (
              <p className="text-sm text-emerald-400">PIN updated successfully!</p>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="gradient"
                size="sm"
                onClick={handleChangePin}
                disabled={pinLoading}
                className="flex-1"
              >
                {pinLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "Update PIN"
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowPinChange(false)
                  setPinError(null)
                  setPinSuccess(false)
                  setCurrentPin("")
                  setNewPin("")
                  setConfirmPin("")
                }}
                disabled={pinLoading}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </section>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-3">
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
              Saving...
            </>
          ) : (
            <>
              <Save className="size-5 mr-2" />
              Save Changes
            </>
          )}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="w-full min-h-[44px] text-base text-muted-foreground"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </Button>
      </div>
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
