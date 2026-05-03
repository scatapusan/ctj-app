import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export type AttendStage = "event" | "identify" | "confirm" | "done"

const STAGES: { id: AttendStage; label: string }[] = [
  { id: "event", label: "Event" },
  { id: "identify", label: "Identify" },
  { id: "confirm", label: "Confirm" },
  { id: "done", label: "Done" },
]

interface StepIndicatorProps {
  current: AttendStage
}

function stageIndex(stage: AttendStage): number {
  return STAGES.findIndex((s) => s.id === stage)
}

export function StepIndicator({ current }: StepIndicatorProps) {
  const currentIdx = stageIndex(current)

  return (
    <ol
      className="flex items-center justify-center gap-2 sm:gap-3"
      aria-label="Check-in progress"
    >
      {STAGES.map((stage, i) => {
        const isComplete = i < currentIdx
        const isActive = i === currentIdx
        const isUpcoming = i > currentIdx

        return (
          <li
            key={stage.id}
            className="flex items-center gap-2 sm:gap-3"
          >
            <div className="flex flex-col items-center gap-1">
              <div
                aria-current={isActive ? "step" : undefined}
                className={cn(
                  "size-7 rounded-full flex items-center justify-center text-[11px] font-semibold transition-all duration-300 ring-1",
                  isComplete &&
                    "bg-orange-500/20 text-orange-300 ring-orange-500/40",
                  isActive &&
                    "bg-gradient-to-br from-orange-500 to-amber-500 text-white ring-orange-400/60 scale-110 shadow-lg shadow-orange-500/30",
                  isUpcoming &&
                    "bg-white/[0.04] text-muted-foreground/60 ring-white/[0.06]"
                )}
              >
                {isComplete ? <Check className="size-3.5" /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-[10px] font-medium transition-colors",
                  isActive && "text-orange-400",
                  isComplete && "text-foreground/70",
                  isUpcoming && "text-muted-foreground/50"
                )}
              >
                {stage.label}
              </span>
            </div>

            {i < STAGES.length - 1 && (
              <div
                aria-hidden="true"
                className={cn(
                  "h-px w-6 sm:w-10 -mt-4 transition-colors",
                  i < currentIdx
                    ? "bg-orange-500/40"
                    : "bg-white/[0.06]"
                )}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
