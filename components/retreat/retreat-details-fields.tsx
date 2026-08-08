"use client"

import { useRef } from "react"
import type { RetreatCategory } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Camera, X } from "lucide-react"

/** Age on today's date from a yyyy-mm-dd birthdate string, or null. */
export function computeAge(birthdate: string): number | null {
  if (!birthdate) return null
  const d = new Date(`${birthdate}T00:00:00`)
  if (isNaN(d.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return age
}

/** Suggested category for an age: Youth 12–22, YA/Singles 23+. */
export function suggestCategory(age: number | null): RetreatCategory | null {
  if (age === null || age < 12) return null
  return age <= 22 ? "youth" : "ya"
}

interface RetreatDetailsFieldsProps {
  idPrefix: string
  birthdate: string
  onBirthdateChange: (value: string) => void
  category: RetreatCategory | null
  onCategoryChange: (value: RetreatCategory) => void
  guardianName: string
  onGuardianNameChange: (value: string) => void
  guardianContact: string
  onGuardianContactChange: (value: string) => void
  babyPhotoFile: File | null
  babyPhotoPreview: string | null
  onBabyPhotoSelect: (file: File | null) => void
  disabled?: boolean
}

/**
 * The retreat-specific answers, shared by the new-person form and the
 * existing-member step: birthday (required — category depends on it), computed
 * age, the category radio the ministry lead asked for, guardian fields for
 * minors, and the required YA baby-photo picker.
 */
export function RetreatDetailsFields({
  idPrefix,
  birthdate,
  onBirthdateChange,
  category,
  onCategoryChange,
  guardianName,
  onGuardianNameChange,
  guardianContact,
  onGuardianContactChange,
  babyPhotoFile,
  babyPhotoPreview,
  onBabyPhotoSelect,
  disabled,
}: RetreatDetailsFieldsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const age = computeAge(birthdate)
  const isMinor = age !== null && age < 18
  const tooYoung = age !== null && age >= 0 && age < 12

  function handleBirthdate(value: string) {
    onBirthdateChange(value)
    const suggested = suggestCategory(computeAge(value))
    if (suggested) onCategoryChange(suggested)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    onBabyPhotoSelect(file)
  }

  return (
    <div className="space-y-5">
      {/* Birthday + computed age */}
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-birthdate`} className="text-muted-foreground">
          Birthday <span className="text-destructive">*</span>
        </Label>
        <div className="flex items-center gap-3">
          <Input
            id={`${idPrefix}-birthdate`}
            type="date"
            value={birthdate}
            onChange={(e) => handleBirthdate(e.target.value)}
            className="h-12 text-base"
            required
            disabled={disabled}
          />
          {age !== null && age >= 0 && age <= 100 && (
            <span className="shrink-0 px-3 py-1.5 rounded-full bg-secondary border-2 border-foreground text-sm font-bold text-foreground">
              Age {age}
            </span>
          )}
        </div>
        {tooYoung && (
          <p className="text-sm font-semibold text-destructive" role="alert">
            The retreat is for ages 12 and up — please ask a leader to help you.
          </p>
        )}
      </div>

      {/* Category radio (auto-suggested from birthday, user-confirmable) */}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium leading-none text-muted-foreground mb-2">
          Category <span className="text-destructive">*</span>
        </legend>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              { value: "youth", label: "Youth", sub: "12–22 years old" },
              { value: "ya", label: "YA / Singles", sub: "23 and up" },
            ] as const
          ).map((opt) => {
            const selected = category === opt.value
            return (
              <label
                key={opt.value}
                className={`flex flex-col items-start gap-0.5 min-h-[56px] rounded-2xl px-4 py-3 cursor-pointer transition-all ${
                  selected
                    ? "bg-secondary border-[2.5px] border-foreground shadow-pop-sm"
                    : "bg-card border-2 border-border hover:border-foreground"
                }`}
              >
                <input
                  type="radio"
                  name={`${idPrefix}-category`}
                  value={opt.value}
                  checked={selected}
                  onChange={() => onCategoryChange(opt.value)}
                  className="sr-only"
                  disabled={disabled}
                />
                <span className={`text-base ${selected ? "font-extrabold" : "font-bold"} text-foreground`}>
                  {opt.label}
                </span>
                <span className="text-xs font-semibold text-muted-foreground">{opt.sub}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      {/* Guardian details — required for minors */}
      {isMinor && (
        <div className="space-y-4 rounded-2xl border-2 border-foreground bg-secondary/50 p-4">
          <p className="text-sm font-bold text-foreground">
            Since you&apos;re under 18, we need a parent or guardian we can reach.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-guardian-name`} className="text-muted-foreground">
              Parent/Guardian Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`${idPrefix}-guardian-name`}
              value={guardianName}
              onChange={(e) => onGuardianNameChange(e.target.value)}
              placeholder="Full name"
              className="h-12 text-base"
              required
              disabled={disabled}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idPrefix}-guardian-contact`} className="text-muted-foreground">
              Parent/Guardian Contact Number <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`${idPrefix}-guardian-contact`}
              type="tel"
              inputMode="tel"
              value={guardianContact}
              onChange={(e) => onGuardianContactChange(e.target.value)}
              placeholder="09XX XXX XXXX"
              className="h-12 text-base"
              required
              disabled={disabled}
            />
          </div>
          <p className="text-xs font-medium text-muted-foreground">
            By submitting, you confirm your parent/guardian consents to your
            registration and to CTJCC Marikina processing this information.
          </p>
        </div>
      )}

      {/* Baby photo — required for YA */}
      {category === "ya" && (
        <div className="space-y-2">
          <Label className="text-muted-foreground">
            Baby / Childhood Photo <span className="text-destructive">*</span>
          </Label>
          <p className="text-xs font-medium text-muted-foreground">
            A photo of you as a baby or young kid — it&apos;s for a retreat game.
            Keep it one you&apos;re happy for others to see!
          </p>
          {babyPhotoPreview ? (
            <div className="relative w-32 h-32">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={babyPhotoPreview}
                alt="Baby photo preview"
                className="w-full h-full rounded-xl object-cover border-2 border-foreground"
              />
              <button
                type="button"
                onClick={() => onBabyPhotoSelect(null)}
                aria-label="Remove baby photo"
                className="absolute -top-2 -right-2 rounded-full bg-destructive text-destructive-foreground p-1 border-2 border-card hover:bg-destructive/90"
                disabled={disabled}
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border py-6 text-muted-foreground hover:border-foreground hover:text-foreground transition-all group"
              disabled={disabled}
            >
              <div className="rounded-full bg-secondary p-3 group-hover:bg-secondary transition-colors">
                <Camera className="size-6" />
              </div>
              <span className="text-sm font-semibold">Tap to upload your baby photo</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFile}
            className="hidden"
            disabled={disabled}
          />
          {babyPhotoFile && !babyPhotoPreview && (
            <p className="text-xs font-medium text-muted-foreground">{babyPhotoFile.name}</p>
          )}
        </div>
      )}
    </div>
  )
}
