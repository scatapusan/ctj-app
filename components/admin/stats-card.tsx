import type { LucideIcon } from "lucide-react"

interface StatsCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  accent?: "emerald" | "cyan" | "amber"
}

export function StatsCard({ label, value, icon: Icon, accent = "emerald" }: StatsCardProps) {
  const colors = {
    emerald: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20",
    cyan: "text-cyan-400 bg-cyan-500/10 ring-cyan-500/20",
    amber: "text-amber-400 bg-amber-500/10 ring-amber-500/20",
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
