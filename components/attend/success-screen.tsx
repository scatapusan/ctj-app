"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { CheckCircle2, RotateCcw, Pencil, Home } from "lucide-react"

interface SuccessScreenProps {
  firstName: string
  /** Event name for context (omitted when arriving via a QR deep link). */
  eventName?: string
  onReset: () => void
  onEditProfile?: () => void
}

export function SuccessScreen({ firstName, eventName, onReset, onEditProfile }: SuccessScreenProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center text-center space-y-6 py-8 relative"
    >
      <div className="animate-check-scale w-24 h-24 rounded-full bg-primary border-[2.5px] border-foreground shadow-pop flex items-center justify-center">
        <CheckCircle2 className="size-12 text-foreground" strokeWidth={2} />
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-extrabold text-foreground">
          Attendance Confirmed!
        </h2>
        <p className="text-lg text-muted-foreground">
          See you at {eventName || "fellowship"},{" "}
          <span className="font-bold text-accent">{firstName}</span> — kita-kits!
        </p>
      </div>

      <div className="w-full pt-4 space-y-3">
        {onEditProfile && (
          <Button
            variant="outline"
            size="lg"
            className="w-full min-h-[48px] text-base"
            onClick={onEditProfile}
          >
            <Pencil className="size-4 mr-2" />
            Update My Profile
          </Button>
        )}

        <Button
          variant="ghost"
          size="lg"
          className="w-full min-h-[44px] text-base text-muted-foreground"
          onClick={onReset}
        >
          <RotateCcw className="size-4 mr-2" />
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
  )
}
