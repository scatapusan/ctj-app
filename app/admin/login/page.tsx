"use client"

import { useState, Suspense } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Loader2, Lock, Mail, ShieldCheck } from "lucide-react"

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const errorParam = searchParams.get("error")

  const [email, setEmail] = useState("")
  const [pin, setPin] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(
    errorParam === "not-admin" ? "You don't have admin access." : null
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, pin }),
      })
      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(data.error || "Sign-in failed.")
        setLoading(false)
        return
      }

      router.push("/admin")
      router.refresh()
    } catch {
      setError("Network error. Please try again.")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-80 h-80 rounded-full bg-orange-500/[0.07] blur-[100px] animate-float" />
        <div className="absolute top-1/3 -right-32 w-64 h-64 rounded-full bg-blue-500/[0.05] blur-[80px] animate-float-slow" />
      </div>

      <div className="relative w-full max-w-sm mx-auto px-4 space-y-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-orange-400 transition-colors"
        >
          <ArrowLeft className="size-4" />
          Home
        </Link>

        <div className="glass rounded-2xl p-8 space-y-6">
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500/20 to-blue-500/20 p-4 ring-1 ring-white/[0.1] glow-orange">
              <ShieldCheck className="size-8 text-orange-400" />
            </div>
            <h1 className="text-xl font-bold gradient-text">Admin Login</h1>
            <p className="text-sm text-muted-foreground">
              CTJCC Marikina Dashboard
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-email" className="text-muted-foreground">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-orange-400/60" />
                <Input
                  id="admin-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@email.com"
                  className="h-12 pl-10 text-base"
                  autoComplete="email"
                  autoFocus
                  required
                  disabled={loading}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="admin-pin" className="text-muted-foreground">
                PIN
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-orange-400/60" />
                <Input
                  id="admin-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="\d{4,8}"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder="Enter your PIN"
                  className="h-12 pl-10 text-base tracking-[0.3em] font-mono"
                  autoComplete="current-password"
                  required
                  minLength={4}
                  maxLength={8}
                  disabled={loading}
                />
              </div>
              <p className="text-[11px] text-muted-foreground/70">
                4–8 digits. Ask a superadmin if you don&apos;t have one yet.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400"
              >
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="gradient"
              size="lg"
              className="w-full min-h-[48px] text-base font-semibold"
              disabled={loading || !email || pin.length < 4}
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen bg-background flex items-center justify-center"
          role="status"
          aria-busy="true"
          aria-label="Loading sign-in"
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span className="text-sm">Loading sign-in…</span>
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
