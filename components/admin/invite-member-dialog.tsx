"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  X,
  Mail,
  ShieldCheck,
  Star,
  Lock,
  RefreshCw,
  Copy,
  Check,
  Loader2,
  UserPlus,
} from "lucide-react"
import { toast } from "@/lib/toast"

interface InviteMemberDialogProps {
  open: boolean
  onClose: () => void
  onInvited?: () => void
}

type Role = "core" | "admin"

function generatePin(length = 6): string {
  // Cryptographically random digits — avoids leading-zero issues with Math.random
  const buf = new Uint32Array(length)
  if (typeof window !== "undefined" && window.crypto) {
    window.crypto.getRandomValues(buf)
  } else {
    for (let i = 0; i < length; i++) buf[i] = Math.floor(Math.random() * 1e9)
  }
  return Array.from(buf, (n) => (n % 10).toString()).join("")
}

export function InviteMemberDialog({ open, onClose, onInvited }: InviteMemberDialogProps) {
  const [email, setEmail] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [role, setRole] = useState<Role>("core")
  const [pin, setPin] = useState(() => generatePin())
  const [submitting, setSubmitting] = useState(false)
  const [created, setCreated] = useState<{ email: string; pin: string; role: Role } | null>(
    null
  )
  const [copied, setCopied] = useState(false)

  if (!open) return null

  function reset() {
    setEmail("")
    setFirstName("")
    setLastName("")
    setRole("core")
    setPin(generatePin())
    setCreated(null)
    setCopied(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)

    const res = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, pin, role, firstName, lastName }),
    })
    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      toast.error(data.error || "Couldn't invite member")
      setSubmitting(false)
      return
    }

    setCreated({ email, pin, role })
    setSubmitting(false)
    onInvited?.()
    toast.success(`${role === "admin" ? "Admin" : "Core leader"} invited`)
  }

  async function copyCredentials() {
    if (!created) return
    const text = `Email: ${created.email}\nPIN: ${created.pin}\nLogin URL: ${window.location.origin}/admin/login`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast.success("Credentials copied")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Couldn't copy — select manually instead")
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/40 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="glass rounded-2xl p-6 w-full max-w-md space-y-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 id="invite-title" className="text-lg font-bold gradient-text flex items-center gap-2">
              <UserPlus className="size-5 text-accent" />
              Invite Member
            </h2>
            <p className="text-xs text-muted-foreground">
              Creates a login account so they can access the dashboard.
            </p>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close dialog"
            className="text-muted-foreground hover:text-foreground p-1 -m-1 rounded-md min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="size-4" />
          </button>
        </div>

        {created ? (
          <div className="space-y-4">
            <div className="rounded-lg border-2 border-foreground bg-secondary/50 p-4 space-y-3">
              <p className="text-sm font-medium text-accent flex items-center gap-2">
                <Check className="size-4" />
                Account created — share these credentials
              </p>
              <dl className="text-sm space-y-2 font-mono">
                <div>
                  <dt className="text-xs text-muted-foreground font-sans">Email</dt>
                  <dd className="text-foreground break-all">{created.email}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground font-sans">PIN</dt>
                  <dd className="text-foreground select-all text-lg tracking-[0.3em]">
                    {created.pin}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground font-sans">Role</dt>
                  <dd className="text-foreground font-sans">
                    {created.role === "admin" ? "Admin" : "Core Leader"}
                  </dd>
                </div>
              </dl>
            </div>

            <p className="text-xs text-muted-foreground">
              ⚠️ This PIN won&apos;t be shown again. Send it through a secure channel
              (e.g. private message) — not a public chat. They can change it later.
            </p>

            <div className="flex gap-2">
              <Button
                variant="gradient"
                className="flex-1 min-h-[44px]"
                onClick={copyCredentials}
              >
                {copied ? <Check className="size-4 mr-2" /> : <Copy className="size-4 mr-2" />}
                {copied ? "Copied" : "Copy credentials"}
              </Button>
              <Button
                variant="outline"
                className="min-h-[44px]"
                onClick={reset}
              >
                Invite another
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="invite-first" className="text-muted-foreground text-xs">
                  First name
                </Label>
                <Input
                  id="invite-first"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Optional"
                  disabled={submitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-last" className="text-muted-foreground text-xs">
                  Last name
                </Label>
                <Input
                  id="invite-last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Optional"
                  disabled={submitting}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-email" className="text-muted-foreground text-xs">
                Email <span className="text-accent font-bold">*</span>
              </Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="member@email.com"
                  className="pl-10"
                  required
                  autoComplete="off"
                  disabled={submitting}
                />
              </div>
            </div>

            <fieldset className="space-y-1.5">
              <legend className="text-muted-foreground text-xs mb-1.5">Role</legend>
              <div className="grid grid-cols-2 gap-2">
                <label
                  className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all min-h-[44px] ${
                    role === "core"
                      ? "border-foreground bg-muted text-foreground"
                      : "border-border/30 bg-muted/50 text-muted-foreground hover:border-foreground"
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value="core"
                    checked={role === "core"}
                    onChange={() => setRole("core")}
                    className="sr-only"
                    disabled={submitting}
                  />
                  <Star className="size-4" />
                  <span className="text-sm font-medium">Core Leader</span>
                </label>
                <label
                  className={`flex items-center gap-2 p-3 rounded-xl border cursor-pointer transition-all min-h-[44px] ${
                    role === "admin"
                      ? "border-foreground bg-secondary text-foreground"
                      : "border-border/30 bg-muted/50 text-muted-foreground hover:border-foreground"
                  }`}
                >
                  <input
                    type="radio"
                    name="role"
                    value="admin"
                    checked={role === "admin"}
                    onChange={() => setRole("admin")}
                    className="sr-only"
                    disabled={submitting}
                  />
                  <ShieldCheck className="size-4" />
                  <span className="text-sm font-medium">Admin</span>
                </label>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {role === "admin"
                  ? "Full access — can invite, edit, delete, and manage all data."
                  : "Can view and manage members & attendance. Cannot invite or delete."}
              </p>
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="invite-pin" className="text-muted-foreground text-xs">
                Initial PIN <span className="text-accent font-bold">*</span>
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="invite-pin"
                  type="text"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  className="pl-10 pr-12 font-mono text-base tracking-[0.3em]"
                  required
                  minLength={4}
                  maxLength={8}
                  pattern="\d{4,8}"
                  autoComplete="off"
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setPin(generatePin())}
                  aria-label="Generate new PIN"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground hover:text-foreground rounded"
                  disabled={submitting}
                >
                  <RefreshCw className="size-4" />
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                4–8 digits. Auto-generated 6 digits — they can change it later.
              </p>
            </div>

            <Button
              type="submit"
              variant="gradient"
              size="lg"
              className="w-full min-h-[48px]"
              disabled={submitting || !email || pin.length < 4}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" />
                  Creating account…
                </>
              ) : (
                <>
                  <UserPlus className="size-4 mr-2" />
                  Create Account
                </>
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
