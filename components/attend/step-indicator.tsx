import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

export type AttendStage = "event" | "identify" | "confirm" | "done"

const STAGES: { id: AttendStage; label: string }[] = [
  { id: "event", label: "Event" },
  { id: "identify", label: "You" },
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
                  "size-7 rounded-full flex items-center justify-center text-[12px] font-bold transition-all duration-300 border-2",
                  isComplete &&
                    "bg-primary border-foreground text-foreground",
                  isActive &&
                    "bg-primary border-foreground text-foreground scale-110 shadow-pop-sm",
                  isUpcoming &&
                    "bg-card border-border text-muted-foreground"
                )}
              >
                {isComplete ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-[11px] font-bold transition-colors",
                  isActive && "text-foreground",
                  isComplete && "text-foreground",
                  isUpcoming && "text-muted-foreground"
                )}
              >
                {stage.label}
              </span>
            </div>

            {i < STAGES.length - 1 && (
              <div
                aria-hidden="true"
                className={cn(
                  "h-0.5 w-6 sm:w-10 -mt-4 transition-colors",
                  i < currentIdx ? "bg-foreground" : "bg-foreground/25"
                )}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
