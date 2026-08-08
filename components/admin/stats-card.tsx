import type { LucideIcon } from "lucide-react"

interface StatsCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  accent?: "orange" | "blue" | "amber"
}

export function StatsCard({ label, value, icon: Icon, accent = "orange" }: StatsCardProps) {
  const colors = {
    orange: "text-accent bg-secondary ring-foreground",
    blue: "text-muted-foreground bg-muted ring-border",
    amber: "text-accent bg-secondary ring-border",
  }

  return (
    <div className="glass rounded-xl p-5 flex items-center gap-4">
      <div className={`rounded-xl p-3 ring-1 ${colors[accent]}`}>
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
