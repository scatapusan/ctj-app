"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import type { Member } from "@/lib/types"
import { EventSelector } from "@/components/attend/event-selector"
import { EmailLookup } from "@/components/attend/email-lookup"
import { WelcomeBack } from "@/components/attend/welcome-back"
import { RegistrationForm } from "@/components/attend/registration-form"
import { EditProfile } from "@/components/attend/edit-profile"
import { SuccessScreen } from "@/components/attend/success-screen"
import { ArrowLeft, CheckCircle2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

type FlowStep =
  | "select-event"
  | "email-input"
  | "welcome-back"
  | "registration"
  | "edit-profile"
  | "success"
  | "already-checked-in"

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

  function handleAlreadyCheckedIn(name: string) {
    setFirstName(name)
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
    setStep("edit-profile")
  }

  function handleProfileSaved(updatedMember: Member) {
    setMember(updatedMember)
    setFirstName(updatedMember.first_name)
    setStep(returnToStep)
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
    } else if (step === "welcome-back" || step === "registration") {
      setStep("email-input")
    } else if (step === "edit-profile") {
      setStep(returnToStep)
    }
  }

  const showBack =
    (step === "email-input" && !eventParam) ||
    step === "welcome-back" ||
    step === "registration" ||
    step === "edit-profile"

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Animated background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-80 h-80 rounded-full bg-emerald-500/[0.07] blur-[100px] animate-float" />
        <div className="absolute top-1/3 -right-32 w-64 h-64 rounded-full bg-cyan-500/[0.05] blur-[80px] animate-float-slow" />
        <div className="absolute -bottom-20 left-1/4 w-72 h-72 rounded-full bg-emerald-600/[0.04] blur-[90px] animate-float" style={{ animationDelay: "2s" }} />
      </div>

      <div className="relative max-w-md mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-3 pt-2">
          <div className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 p-4 ring-1 ring-white/[0.1] glow-emerald">
            <Sparkles className="size-8 text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight gradient-text">
            CTJ Marikina
          </h1>
          <p className="text-sm text-muted-foreground">
            Youth and YA Attendance
          </p>
        </div>

        {/* Back button */}
        {showBack && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="text-muted-foreground hover:text-emerald-400"
          >
            <ArrowLeft className="size-4 mr-1" />
            Back
          </Button>
        )}

        {/* Flow content — glass card */}
        <div className="glass rounded-2xl p-6">
          {step === "select-event" && (
            <EventSelector onSelect={handleEventSelect} />
          )}

          {step === "email-input" && (
            <EmailLookup
              eventId={eventId}
              onMemberFound={handleMemberFound}
              onNewMember={handleNewMember}
              onAlreadyCheckedIn={handleAlreadyCheckedIn}
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

          {step === "already-checked-in" && (
            <div className="flex flex-col items-center text-center space-y-4 py-6">
              <div className="rounded-full bg-cyan-500/10 p-4 ring-1 ring-cyan-500/20">
                <CheckCircle2 className="size-12 text-cyan-400" strokeWidth={1.5} />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">Already checked in!</h2>
                <p className="text-muted-foreground">
                  <span className="font-medium text-emerald-400">{firstName}</span> is already marked present for this event.
                </p>
              </div>
              <Button
                variant="outline"
                size="lg"
                className="w-full min-h-[44px] text-base mt-2"
                onClick={handleReset}
              >
                Check in another person
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground/50">
          Christ the Joy Church Marikina
        </p>
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
