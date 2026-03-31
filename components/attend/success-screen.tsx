"use client"

import { Button } from "@/components/ui/button"
import { CheckCircle2, RotateCcw, Pencil } from "lucide-react"

interface SuccessScreenProps {
  firstName: string
  onReset: () => void
  onEditProfile?: () => void
}

export function SuccessScreen({ firstName, onReset, onEditProfile }: SuccessScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center space-y-6 py-8 relative">
      {/* Subtle glow behind checkmark */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 w-40 h-40 rounded-full bg-emerald-500/10 blur-[60px] animate-pulse-glow" />

      <div className="relative animate-check-scale">
        <CheckCircle2 className="size-20 text-emerald-400 drop-shadow-[0_0_20px_rgba(16,185,129,0.4)]" strokeWidth={1.5} />
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-bold gradient-text">
          Attendance Confirmed!
        </h2>
        <p className="text-lg text-muted-foreground">
          See you at fellowship,{" "}
          <span className="font-semibold text-emerald-400">{firstName}</span>!
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
      </div>
    </div>
  )
}
