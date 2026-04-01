"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import type { Member } from "@/lib/types"
import { EventSelector } from "@/components/attend/event-selector"
import { EmailLookup } from "@/components/attend/email-lookup"
import { WelcomeBack } from "@/components/attend/welcome-back"
import { RegistrationForm } from "@/components/attend/registration-form"
import { GuestForm } from "@/components/attend/guest-form"
import { PinEntry } from "@/components/attend/pin-entry"
import { EditProfile } from "@/components/attend/edit-profile"
import { SuccessScreen } from "@/components/attend/success-screen"
import { ProfileEmailLookup } from "@/components/attend/profile-email-lookup"
import { ArrowLeft, CheckCircle2, Sparkles, Pencil } from "lucide-react"
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
  const [member, setMember] = useState<Member | null>(null)
  const [email, setEmail] = useState("")
  const [firstName, setFirstName] = useState("")
  const [returnToStep, setReturnToStep] = useState<FlowStep>("welcome-back")

  function handleEventSelect(id: string) {
    setEventId(id)
    setStep("email-input")
  }

  function handleMemberFound(m: Member) {
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

  function handleGuestSuccess(name: string) {
    setFirstName(name)
    setStep("success")
  }

  function handleProfileLookup() {
    setStep("profile-email")
  }

  function handleProfileMemberFound(m: Member) {
    setMember(m)
    setFirstName(m.first_name)
    setReturnToStep("profile-saved")
    setStep("pin-entry")
  }

  function handleAlreadyCheckedIn(m: Member) {
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

  function handlePinVerified() {
    setStep("edit-profile")
  }

  function handlePinCancel() {
    setStep(returnToStep)
  }

  function handleProfileSaved(updatedMember: Member) {
    setMember(updatedMember)
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

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-80 h-80 rounded-full bg-orange-500/[0.07] blur-[100px] animate-float" />
        <div className="absolute top-1/3 -right-32 w-64 h-64 rounded-full bg-blue-500/[0.05] blur-[80px] animate-float-slow" />
        <div className="absolute -bottom-20 left-1/4 w-72 h-72 rounded-full bg-amber-600/[0.04] blur-[90px] animate-float" style={{ animationDelay: "2s" }} />
      </div>

      <div className="relative max-w-md mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-3 pt-2">
          <div className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 p-4 ring-1 ring-white/[0.1] glow-orange">
            <Sparkles className="size-8 text-orange-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight gradient-text">
            CTJCC Marikina
          </h1>
          <p className="text-sm text-muted-foreground">
            Youth & Young Adult Attendance
          </p>
        </div>

        {/* Back button */}
        {showBack && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="text-muted-foreground hover:text-orange-400"
          >
            <ArrowLeft className="size-4 mr-1" />
            Back
          </Button>
        )}

        {/* Flow content — glass card */}
        <div className="glass rounded-2xl p-6">
          {step === "select-event" && (
            <div className="space-y-6">
              <EventSelector onSelect={handleEventSelect} />
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/[0.06]" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-3 text-muted-foreground/60">or</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="lg"
                className="w-full min-h-[44px] text-base text-muted-foreground hover:text-orange-400"
                onClick={handleProfileLookup}
              >
                <Pencil className="size-4 mr-2" />
                Just Update My Profile
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

          {step === "edit-profile" && member && (
            <EditProfile
              member={member}
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
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full bg-orange-500/10 blur-[60px] animate-pulse-glow" />
              <div className="relative animate-check-scale">
                <CheckCircle2 className="size-20 text-orange-400 drop-shadow-[0_0_20px_rgba(245,145,30,0.4)]" strokeWidth={1.5} />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold gradient-text">Profile Updated!</h2>
                <p className="text-lg text-muted-foreground">
                  Looking good, <span className="font-semibold text-orange-400">{firstName}</span>!
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
                <Avatar className="h-20 w-20 ring-2 ring-blue-500/30 shadow-glow-blue">
                  {member.photo_url ? (
                    <AvatarImage src={member.photo_url} alt={member.first_name} />
                  ) : null}
                  <AvatarFallback className="text-xl font-semibold bg-blue-500/10 text-blue-400">
                    {(member.first_name?.[0] || "").toUpperCase()}{(member.last_name?.[0] || "").toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-1 -right-1 rounded-full bg-blue-500 p-1.5 ring-2 ring-background">
                  <CheckCircle2 className="size-3.5 text-white" />
                </div>
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">Already checked in!</h2>
                <p className="text-muted-foreground">
                  <span className="font-medium text-orange-400">{firstName}</span> is already marked present for this event.
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
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground/50 space-y-1">
          <p>Come To Jesus Community Church of Marikina</p>
          <a href="/privacy" className="underline underline-offset-2 hover:text-muted-foreground/70">
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
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <AttendPageContent />
    </Suspense>
  )
}
