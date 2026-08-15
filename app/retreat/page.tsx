"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { createBrowserClient } from "@/lib/supabase"
import type { Event, MemberSummary, RetreatRegistrationSummary } from "@/lib/types"
import { RetreatEmailStep } from "@/components/retreat/retreat-email-step"
import { RetreatForm } from "@/components/retreat/retreat-form"
import { RetreatExtras } from "@/components/retreat/retreat-extras"
import { Button } from "@/components/ui/button"
import { ArrowLeft, CalendarDays, CheckCircle2, Loader2, PartyPopper, Pencil } from "lucide-react"

type RetreatStep = "email" | "new-form" | "member-extras" | "already" | "update" | "done"

const FILIPINO_DAYS = ["Linggo", "Lunes", "Martes", "Miyerkules", "Huwebes", "Biyernes", "Sabado"]

function eventDateLine(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (isNaN(d.getTime())) return dateStr
  const md = d.toLocaleDateString("en-US", { month: "long", day: "numeric" })
  return `${md} · ${FILIPINO_DAYS[d.getDay()]}`
}

function RetreatPageContent() {
  const searchParams = useSearchParams()
  const eventParam = searchParams.get("event") || ""
  // Day-of walk-in mode (linked from the staff check-in screen): same form,
  // but the registration is recorded directly as attended.
  const walkIn = searchParams.get("walkin") === "1"

  const [event, setEvent] = useState<Pick<Event, "id" | "name" | "event_date"> | null>(null)
  const [eventState, setEventState] = useState<"loading" | "ok" | "bad">(eventParam ? "loading" : "bad")

  const [step, setStep] = useState<RetreatStep>("email")
  const [email, setEmail] = useState("")
  const [member, setMember] = useState<MemberSummary | null>(null)
  const [registration, setRegistration] = useState<RetreatRegistrationSummary | null>(null)
  const [firstName, setFirstName] = useState("")
  const [updated, setUpdated] = useState(false)

  useEffect(() => {
    if (!eventParam) return
    async function fetchEvent() {
      const supabase = createBrowserClient()
      // Anon-readable columns only (description is excluded by RLS lockdown).
      const { data, error } = await supabase
        .from("events")
        .select("id, name, event_date, is_active")
        .eq("id", eventParam)
        .eq("is_active", true)
        .maybeSingle()

      if (error || !data) {
        setEventState("bad")
      } else {
        setEvent(data)
        setEventState("ok")
      }
    }
    fetchEvent()
  }, [eventParam])

  function handleMemberFound(
    m: MemberSummary,
    alreadyRegistered: boolean,
    reg: RetreatRegistrationSummary | null,
  ) {
    setMember(m)
    setRegistration(reg)
    setFirstName(m.first_name)
    setStep(alreadyRegistered ? "already" : "member-extras")
  }

  function handleUpdated() {
    setUpdated(true)
    setStep("done")
  }

  function handleNewPerson(e: string) {
    setEmail(e)
    setStep("new-form")
  }

  function handleSuccess(name: string) {
    setFirstName(name)
    setStep("done")
  }

  /** Back to the email step for a fresh person — clears the previous one. */
  function restart() {
    setMember(null)
    setRegistration(null)
    setUpdated(false)
    setStep("email")
  }

  const showBack = step === "new-form" || step === "member-extras" || step === "update"

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 w-full max-w-md mx-auto px-4 py-8 space-y-6">
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
              {walkIn ? "Walk-in Registration" : "Retreat Pre-registration"}
            </p>
          </div>
        </div>

        {/* Event banner */}
        {eventState === "ok" && event && (
          <div className="rounded-2xl bg-secondary border-2 border-foreground px-4 py-3 flex items-center gap-3">
            <CalendarDays className="size-5 shrink-0 text-foreground" />
            <div>
              <p className="text-base font-extrabold text-foreground leading-tight">{event.name}</p>
              <p className="text-[13px] font-semibold text-muted-foreground">
                {eventDateLine(event.event_date)}
              </p>
            </div>
          </div>
        )}

        {showBack && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => (step === "update" ? setStep("already") : restart())}
            className="text-muted-foreground hover:text-foreground min-h-[44px]"
          >
            <ArrowLeft className="size-4 mr-1" />
            Back
          </Button>
        )}

        {/* Card */}
        <div className="glass rounded-2xl p-6">
          {eventState === "loading" && (
            <div
              className="flex items-center justify-center gap-2 py-12 text-muted-foreground"
              role="status"
              aria-busy="true"
            >
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm font-medium">Loading…</span>
            </div>
          )}

          {eventState === "bad" && (
            <div className="text-center space-y-4 py-6">
              <p className="text-lg font-extrabold text-foreground">Hmm, that link doesn&apos;t look right.</p>
              <p className="text-sm font-medium text-muted-foreground">
                Please scan the retreat QR code again, or ask a leader for the
                correct link.
              </p>
              <Link href="/attend" className="inline-block">
                <Button variant="outline" size="lg" className="min-h-[44px]">
                  Go to regular check-in
                </Button>
              </Link>
            </div>
          )}

          {eventState === "ok" && step === "email" && (
            <RetreatEmailStep
              eventId={eventParam}
              onMemberFound={handleMemberFound}
              onNewPerson={handleNewPerson}
            />
          )}

          {eventState === "ok" && step === "new-form" && (
            <RetreatForm email={email} eventId={eventParam} walkIn={walkIn} onSuccess={handleSuccess} />
          )}

          {eventState === "ok" && step === "member-extras" && member && (
            <RetreatExtras member={member} eventId={eventParam} walkIn={walkIn} onSuccess={handleSuccess} />
          )}

          {eventState === "ok" && step === "update" && member && (
            <RetreatExtras
              member={member}
              eventId={eventParam}
              existing={registration ?? { category: null, is_core: false, has_baby_photo: false }}
              onSuccess={handleUpdated}
            />
          )}

          {eventState === "ok" && step === "already" && (
            <div className="flex flex-col items-center text-center space-y-5 py-6" role="status">
              <div className="w-20 h-20 rounded-full bg-secondary border-[2.5px] border-foreground flex items-center justify-center">
                <CheckCircle2 className="size-10 text-foreground" strokeWidth={2} />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-extrabold text-foreground">You&apos;re on the list!</h2>
                <p className="text-muted-foreground font-medium">
                  <span className="font-bold text-accent">{firstName}</span> is already
                  signed up for this event. See you there!
                </p>
              </div>
              <Button
                variant="outline"
                size="lg"
                className="w-full min-h-[48px] text-base"
                onClick={() => setStep("update")}
              >
                <Pencil className="size-4 mr-2" />
                Update my details
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="w-full min-h-[44px] text-base text-muted-foreground"
                onClick={restart}
              >
                Sign up another person
              </Button>
            </div>
          )}

          {eventState === "ok" && step === "done" && (
            <div className="flex flex-col items-center text-center space-y-6 py-8" role="status" aria-live="polite">
              <div className="animate-check-scale w-24 h-24 rounded-full bg-primary border-[2.5px] border-foreground shadow-pop flex items-center justify-center">
                <PartyPopper className="size-11 text-foreground" strokeWidth={2} />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-extrabold text-foreground">
                  {updated ? "Changes saved!" : walkIn ? "You're checked in!" : "You're pre-registered!"}
                </h2>
                <p className="text-lg text-muted-foreground">
                  {updated ? (
                    <>
                      Your registration for {event?.name ?? "the retreat"} is
                      updated, <span className="font-bold text-accent">{firstName}</span> —
                      your spot is still saved.
                    </>
                  ) : (
                    <>
                      {walkIn ? "Welcome to" : "See you at"} {event?.name ?? "the retreat"},{" "}
                      <span className="font-bold text-accent">{firstName}</span> — kita-kits!
                    </>
                  )}
                </p>
                {event && (
                  <p className="text-sm font-semibold text-muted-foreground">
                    {eventDateLine(event.event_date)}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="lg"
                className="w-full min-h-[44px] text-base text-muted-foreground"
                onClick={restart}
              >
                Sign up another person
              </Button>
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

export default function RetreatPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen bg-background flex items-center justify-center"
          role="status"
          aria-busy="true"
          aria-label="Loading retreat registration"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm font-medium">Loading…</span>
          </div>
        </div>
      }
    >
      <RetreatPageContent />
    </Suspense>
  )
}
