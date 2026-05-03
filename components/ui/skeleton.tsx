import { cn } from "@/lib/utils"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Set on the root <div role="status"> for screen readers. Defaults to "Loading". */
  label?: string
}

export function Skeleton({ className, label = "Loading", ...props }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={cn(
        "animate-pulse rounded-md bg-white/[0.04]",
        className
      )}
      {...props}
    />
  )
}

export function SkeletonText({
  className,
  width = "100%",
}: {
  className?: string
  width?: string | number
}) {
  return (
    <Skeleton
      className={cn("h-4", className)}
      style={{ width }}
    />
  )
}
