import Link from "next/link"
import { Sparkles, ClipboardCheck, Shield } from "lucide-react"

export default function Home() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex flex-col">
      {/* Animated background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-80 h-80 rounded-full bg-orange-500/[0.07] blur-[100px] animate-float" />
        <div className="absolute top-1/3 -right-32 w-64 h-64 rounded-full bg-blue-500/[0.05] blur-[80px] animate-float-slow" />
        <div className="absolute -bottom-20 left-1/4 w-72 h-72 rounded-full bg-amber-600/[0.04] blur-[90px] animate-float" style={{ animationDelay: "2s" }} />
      </div>

      <main className="relative flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="text-center space-y-6 max-w-md">
          {/* Logo */}
          <div className="inline-flex items-center justify-center rounded-3xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 p-6 ring-1 ring-white/[0.1] glow-orange">
            <Sparkles className="size-12 text-orange-400" />
          </div>

          {/* Title */}
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight gradient-text">
              CTJCC Marikina
            </h1>
            <p className="text-lg text-muted-foreground">
              Youth & Young Adult Ministry
            </p>
          </div>

          {/* Buttons */}
          <div className="space-y-4 pt-6">
            <Link
              href="/attend"
              className="flex items-center justify-center gap-3 w-full rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold text-lg py-5 px-6 shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30 hover:scale-[1.02] transition-all duration-200"
            >
              <ClipboardCheck className="size-6" />
              Check In / Attend
            </Link>

            <Link
              href="/admin"
              className="flex items-center justify-center gap-3 w-full rounded-2xl border border-white/[0.1] bg-white/[0.04] text-foreground/80 font-medium text-base py-4 px-6 hover:bg-white/[0.08] hover:border-white/[0.15] transition-all duration-200"
            >
              <Shield className="size-5" />
              Admin / Core Dashboard
            </Link>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative text-center py-6 px-4">
        <p className="text-xs text-muted-foreground/50">
          Come To Jesus Community Church of Marikina
        </p>
      </footer>
    </div>
  )
}
