"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import type { Member, MemberSummary } from "@/lib/types"
import { EventSelector } from "@/components/attend/event-selector"
import { EmailLookup } from "@/components/attend/email-lookup"
import { WelcomeBack } from "@/components/attend/welcome-back"
import { RegistrationForm } from "@/components/attend/registration-form"
import { GuestForm } from "@/components/attend/guest-form"
import { PinEntry } from "@/components/attend/pin-entry"
import { EditProfile } from "@/components/attend/edit-profile"
import { SuccessScreen } from "@/components/attend/success-screen"
import { ProfileEmailLookup } from "@/components/attend/profile-email-lookup"
import { StepIndicator, type AttendStage } from "@/components/attend/step-indicator"
import { ArrowLeft, CheckCircle2, Pencil, Home, Loader2 } from "lucide-react"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"

type FlowStep =
  | "select-event"
  | "email-input"
  | "profile-email"
  | "welcome-back"
  | "registration"
  | "guest-form"
  | "pin-entry"
  | "edit-profile"
  | "success"
  | "already-checked-in"
  | "profile-saved"

function AttendPageContent() {
  const searchParams = useSearchParams()
  const eventParam = searchParams.get("event")

  const [step, setStep] = useState<FlowStep>(
    eventParam ? "email-input" : "select-event"
  )
  const [eventId, setEventId] = useState<string>(eventParam || "")
  // `member` is the minimal summary for pre-edit screens; `editMember` is the
  // full PII record, fetched only after the PIN. `editPin` re-authorizes saves.
  const [member, setMember] = useState<MemberSummary | null>(null)
  const [editMember, setEditMember] = useState<Member | null>(null)
  const [editPin, setEditPin] = useState("")
  const [email, setEmail] = useState("")
  const [firstName, setFirstName] = useState("")
  const [returnToStep, setReturnToStep] = useState<FlowStep>("welcome-back")

  function handleEventSelect(id: string) {
    setEventId(id)
    setStep("email-input")
  }

  function handleMemberFound(m: MemberSummary) {
    setMember(m)
    setFirstName(m.first_name)
    setStep("welcome-back")
  }

  function handleNewMember(newEmail: string) {
    setEmail(newEmail)
    setStep("registration")
  }

  function handleGuestCheckIn() {
    setStep("guest-form")
  }

  // Walk-in path straight from the event picker (no email lookup first).
  function handleGuestFromEvent(id: string) {
    setEventId(id)
    setStep("guest-form")
  }

  function handleGuestSuccess(name: string) {
    setFirstName(name)
    setStep("success")
  }

  function handleProfileLookup() {
    setStep("profile-email")
  }

  function handleProfileMemberFound(m: MemberSummary) {
    setMember(m)
    setFirstName(m.first_name)
    setReturnToStep("profile-saved")
    setStep("pin-entry")
  }

  function handleAlreadyCheckedIn(m: MemberSummary) {
    setMember(m)
    setFirstName(m.first_name)
    setStep("already-checked-in")
  }

  function handleSuccess() {
    setStep("success")
  }

  function handleRegistrationSuccess(name: string) {
    setFirstName(name)
    setStep("success")
  }

  function handleEditProfile(fromStep: FlowStep) {
    setReturnToStep(fromStep)
    setStep("pin-entry")
  }

  function handlePinVerified(full: Member, pin: string) {
    setEditMember(full)
    setEditPin(pin)
    setFirstName(full.first_name)
    setStep("edit-profile")
  }

  function handlePinCancel() {
    setStep(returnToStep)
  }

  function handleProfileSaved(updatedMember: Member) {
    setEditMember(updatedMember)
    setMember((prev) =>
      prev
        ? {
            ...prev,
            first_name: updatedMember.first_name,
            last_name: updatedMember.last_name,
            photo_url: updatedMember.photo_url,
          }
        : prev,
    )
    setFirstName(updatedMember.first_name)
    if (returnToStep === "profile-saved") {
      setStep("profile-saved")
    } else {
      setStep(returnToStep)
    }
  }

  function handleEditCancel() {
    setStep(returnToStep)
  }

  function handleReset() {
    setMember(null)
    setEditMember(null)
    setEditPin("")
    setEmail("")
    setFirstName("")
    setStep("email-input")
  }

  function handleBack() {
    if (step === "email-input" && !eventParam) {
      setStep("select-event")
    } else if (step === "profile-email") {
      setStep("select-event")
    } else if (step === "welcome-back" || step === "registration" || step === "guest-form") {
      setStep("email-input")
    } else if (step === "pin-entry") {
      if (returnToStep === "profile-saved") {
        setStep("profile-email")
      } else {
        setStep(returnToStep)
      }
    } else if (step === "edit-profile") {
      setStep(returnToStep === "profile-saved" ? "profile-email" : returnToStep)
    }
  }

  function handleProfileReset() {
    setMember(null)
    setEditMember(null)
    setEditPin("")
    setEmail("")
    setFirstName("")
    setStep("select-event")
  }

  const showBack =
    (step === "email-input" && !eventParam) ||
    step === "profile-email" ||
    step === "welcome-back" ||
    step === "registration" ||
    step === "guest-form" ||
    step === "pin-entry" ||
    step === "edit-profile"

  // Map internal flow steps → 4 visible stages for the StepIndicator
  function currentStage(): AttendStage | null {
    switch (step) {
      case "select-event":
        return "event"
      case "email-input":
        return "identify"
      case "welcome-back":
      case "registration":
      case "guest-form":
        return "confirm"
      case "success":
      case "already-checked-in":
        return "done"
      default:
        // pin-entry, edit-profile, profile-email, profile-saved are off the check-in path
        return null
    }
  }
  const stage = currentStage()

  return (
    <div className="min-h-screen bg-background relative">
      <div className="relative max-w-md mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <div className="w-10 h-10 shrink-0 rounded-full bg-primary border-2 border-foreground flex items-center justify-center font-black text-[13px] text-foreground">
            CTJ
          </div>
          <div className="text-left">
            <h1 className="text-xl font-extrabold tracking-tight text-foreground leading-tight">
              CTJCC Marikina
            </h1>
            <p className="text-xs font-semibold text-muted-foreground">
              Youth &amp; Young Adult Attendance
            </p>
          </div>
        </div>

        {/* Step indicator (check-in flow only) */}
        {stage && <StepIndicator current={stage} />}

        {/* Back button */}
        {showBack && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="text-muted-foreground hover:text-foreground min-h-[44px]"
          >
            <ArrowLeft className="size-4 mr-1" />
            Back
          </Button>
        )}

        {/* Flow content — glass card */}
        <div className="glass rounded-2xl p-6">
          {step === "select-event" && (
            <div className="space-y-5">
              <EventSelector onSelect={handleEventSelect} onGuest={handleGuestFromEvent} />
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t-2 border-border/30" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-3 font-semibold text-muted-foreground">or</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="lg"
                className="w-full min-h-[44px] text-base text-muted-foreground hover:text-foreground"
                onClick={handleProfileLookup}
              >
                <Pencil className="size-4 mr-2" />
                Update My Profile
              </Button>
            </div>
          )}

          {step === "profile-email" && (
            <ProfileEmailLookup onMemberFound={handleProfileMemberFound} />
          )}

          {step === "email-input" && (
            <EmailLookup
              eventId={eventId}
              onMemberFound={handleMemberFound}
              onNewMember={handleNewMember}
              onAlreadyCheckedIn={handleAlreadyCheckedIn}
              onGuestCheckIn={handleGuestCheckIn}
            />
          )}

          {step === "welcome-back" && member && (
            <WelcomeBack
              member={member}
              eventId={eventId}
              onSuccess={handleSuccess}
              onEditProfile={() => handleEditProfile("welcome-back")}
            />
          )}

          {step === "registration" && (
            <RegistrationForm
              email={email}
              eventId={eventId}
              onSuccess={handleRegistrationSuccess}
            />
          )}

          {step === "guest-form" && (
            <GuestForm
              eventId={eventId}
              onSuccess={handleGuestSuccess}
            />
          )}

          {step === "pin-entry" && member && (
            <PinEntry
              memberId={member.id}
              onVerified={handlePinVerified}
              onCancel={handlePinCancel}
            />
          )}

          {step === "edit-profile" && editMember && (
            <EditProfile
              member={editMember}
              pin={editPin}
              onSaved={handleProfileSaved}
              onCancel={handleEditCancel}
            />
          )}

          {step === "success" && (
            <SuccessScreen
              firstName={firstName}
              onReset={handleReset}
              onEditProfile={member ? () => handleEditProfile("success") : undefined}
            />
          )}

          {step === "profile-saved" && (
            <div className="flex flex-col items-center justify-center text-center space-y-6 py-8 relative">
              <div className="animate-check-scale w-24 h-24 rounded-full bg-primary border-[2.5px] border-foreground shadow-pop flex items-center justify-center">
                <CheckCircle2 className="size-12 text-foreground" strokeWidth={2} />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-extrabold text-foreground">Profile Updated!</h2>
                <p className="text-lg text-muted-foreground">
                  Looking good, <span className="font-bold text-accent">{firstName}</span>!
                </p>
              </div>
              <Button
                variant="ghost"
                size="lg"
                className="w-full min-h-[44px] text-base text-muted-foreground"
                onClick={handleProfileReset}
              >
                Back to Home
              </Button>
            </div>
          )}

          {step === "already-checked-in" && member && (
            <div className="flex flex-col items-center text-center space-y-4 py-6">
              <div className="relative">
                <Avatar className="h-20 w-20 border-2 border-foreground">
                  {member.photo_url ? (
                    <AvatarImage src={member.photo_url} alt={member.first_name} />
                  ) : null}
                  <AvatarFallback className="text-xl font-bold bg-secondary text-foreground">
                    {(member.first_name?.[0] || "").toUpperCase()}{(member.last_name?.[0] || "").toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-1 -right-1 rounded-full bg-foreground p-1.5 ring-2 ring-card">
                  <CheckCircle2 className="size-3.5 text-primary" />
                </div>
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-extrabold">Already checked in!</h2>
                <p className="text-muted-foreground font-medium">
                  <span className="font-bold text-accent">{firstName}</span> is already marked present for this event.
                </p>
              </div>
              <div className="w-full space-y-3 mt-2">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full min-h-[44px] text-base"
                  onClick={() => handleEditProfile("already-checked-in")}
                >
                  <Pencil className="size-4 mr-2" />
                  Update My Profile
                </Button>
                <Button
                  variant="ghost"
                  size="lg"
                  className="w-full min-h-[44px] text-base text-muted-foreground"
                  onClick={handleReset}
                >
                  Check in another person
                </Button>
                <Link href="/" className="block">
                  <Button
                    variant="ghost"
                    size="lg"
                    className="w-full min-h-[44px] text-base text-muted-foreground hover:text-foreground"
                  >
                    <Home className="size-4 mr-2" />
                    Back to Home
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs font-semibold text-muted-foreground space-y-1">
          <p>Come To Jesus Community Church of Marikina</p>
          <a href="/privacy" className="underline underline-offset-2 hover:text-foreground">
            Privacy Policy
          </a>
        </div>
      </div>
    </div>
  )
}

export default function AttendPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen bg-background flex items-center justify-center"
          role="status"
          aria-busy="true"
          aria-label="Loading attendance"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">Loading attendance…</span>
          </div>
        </div>
      }
    >
      <AttendPageContent />
    </Suspense>
  )
}
