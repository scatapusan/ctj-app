"use client"

import { useState, useRef, useEffect } from "react"
import type { Member } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Loader2, Lock, ShieldCheck } from "lucide-react"

interface PinEntryProps {
  memberId: string
  onVerified: (member: Member, pin: string) => void
  onCancel: () => void
}

export function PinEntry({ memberId, onVerified, onCancel }: PinEntryProps) {
  const [digits, setDigits] = useState(["", "", "", ""])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    // Auto-focus first input
    inputRefs.current[0]?.focus()
  }, [])

  function handleDigitChange(index: number, value: string) {
    // Only allow single digit
    const digit = value.replace(/\D/g, "").slice(-1)
    const newDigits = [...digits]
    newDigits[index] = digit
    setDigits(newDigits)
    setError(null)

    // Auto-advance to next input
    if (digit && index < 3) {
      inputRefs.current[index + 1]?.focus()
    }

    // Auto-submit when all 4 digits are entered
    if (digit && index === 3 && newDigits.every((d) => d !== "")) {
      handleVerify(newDigits.join(""))
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      // Move back on empty backspace
      inputRefs.current[index - 1]?.focus()
      const newDigits = [...digits]
      newDigits[index - 1] = ""
      setDigits(newDigits)
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4)
    if (pasted.length === 4) {
      const newDigits = pasted.split("")
      setDigits(newDigits)
      inputRefs.current[3]?.focus()
      handleVerify(pasted)
    }
  }

  async function handleVerify(pin?: string) {
    const pinCode = pin || digits.join("")
    if (pinCode.length !== 4) {
      setError("Please enter all 4 digits.")
      return
    }

    setLoading(true)
    setError(null)

    try {
      // The server verifies the PIN and returns the full profile in one step,
      // so the full PII record is only fetched after a correct PIN.
      const res = await fetch("/api/attend/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberId, pin: pinCode }),
      })

      if (res.ok) {
        const data = await res.json()
        onVerified(data.member as Member, pinCode)
        return
      }

      if (res.status === 429) {
        setError("Too many attempts. Please wait a moment.")
        setLoading(false)
        return
      }

      setError(res.status === 401 ? "Incorrect PIN. Try again." : "Something went wrong. Please try again.")
      setShake(true)
      setTimeout(() => setShake(false), 500)
      setDigits(["", "", "", ""])
      setTimeout(() => inputRefs.current[0]?.focus(), 100)
      setLoading(false)
    } catch {
      setError("Network error. Please check your connection.")
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    handleVerify()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-center text-center space-y-6 py-4">
      <div className="relative">
        <div className="rounded-full bg-secondary border-2 border-foreground p-4">
          <Lock className="size-8 text-foreground" />
        </div>
      </div>

      <div className="space-y-1">
        <h2 className="text-lg font-extrabold text-foreground">Enter Your PIN</h2>
        <p className="text-sm font-medium text-muted-foreground">
          Enter your 4-digit PIN to access your profile
        </p>
      </div>

      {/* PIN digit inputs */}
      <div
        className={`flex gap-3 ${shake ? "animate-shake" : ""}`}
      >
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputRefs.current[i] = el }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleDigitChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={i === 0 ? handlePaste : undefined}
            aria-label={`PIN digit ${i + 1} of 4`}
            className="w-14 h-16 text-center text-2xl font-bold rounded-xl bg-card border-2 border-foreground text-foreground focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:outline-none transition-all duration-200"
            disabled={loading}
            autoComplete="off"
          />
        ))}
      </div>

      {error && (
        <p className="text-sm font-semibold text-destructive" role="alert">{error}</p>
      )}

      <div className="w-full space-y-3">
        <Button
          type="submit"
          size="lg"
          className="w-full min-h-[48px] text-base"
          disabled={loading || digits.some((d) => d === "")}
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin mr-2" />
              Verifying...
            </>
          ) : (
            <>
              <ShieldCheck className="size-4 mr-2" />
              Verify PIN
            </>
          )}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="w-full min-h-[44px] text-base text-muted-foreground"
          onClick={onCancel}
          disabled={loading}
        >
          Cancel
        </Button>
      </div>

      <p className="text-xs font-medium text-muted-foreground">
        Forgot your PIN? Ask a leader to reset it for you.
      </p>
    </form>
  )
}
