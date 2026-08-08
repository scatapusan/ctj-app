import { Skeleton } from "@/components/ui/skeleton"

interface ListSkeletonProps {
  rows?: number
  showSearch?: boolean
}

export function ListSkeleton({ rows = 6, showSearch = true }: ListSkeletonProps) {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>

      {showSearch && (
        <Skeleton className="h-10 w-full max-w-sm rounded-md" />
      )}

      {/* Mobile cards */}
      <div className="lg:hidden space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="glass rounded-xl p-4 flex items-center gap-3"
          >
            <Skeleton className="size-12 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block rounded-xl border border-border/30 overflow-hidden">
        <div className="bg-muted/50 border-b border-border/30 px-4 py-3 flex gap-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-20" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="px-4 py-3 border-b border-border/30 flex gap-6 items-center"
          >
            {Array.from({ length: 5 }).map((_, j) => (
              <Skeleton key={j} className="h-4 w-20" />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
