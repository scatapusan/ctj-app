"use client"

import { useState, useRef, useEffect } from "react"
import { createBrowserClient } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Loader2, Lock, ShieldCheck } from "lucide-react"

interface PinEntryProps {
  memberId: string
  onVerified: () => void
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
      const supabase = createBrowserClient()
      const { data, error: rpcError } = await supabase.rpc("verify_pin", {
        p_member_id: memberId,
        p_pin: pinCode,
      })

      if (rpcError) {
        setError("Something went wrong. Please try again.")
        console.error(rpcError)
        setLoading(false)
        return
      }

      if (data === true) {
        onVerified()
      } else {
        setError("Incorrect PIN. Try again.")
        setShake(true)
        setTimeout(() => setShake(false), 500)
        setDigits(["", "", "", ""])
        setTimeout(() => inputRefs.current[0]?.focus(), 100)
        setLoading(false)
      }
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
        <div className="rounded-full bg-emerald-500/10 p-4 ring-1 ring-emerald-500/20">
          <Lock className="size-8 text-emerald-400" />
        </div>
      </div>

      <div className="space-y-1">
        <h2 className="text-lg font-semibold gradient-text">Enter Your PIN</h2>
        <p className="text-sm text-muted-foreground">
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
            className="w-14 h-16 text-center text-2xl font-bold rounded-xl bg-white/[0.04] border border-white/[0.1] text-foreground focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all duration-200"
            disabled={loading}
            autoComplete="off"
          />
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      <div className="w-full space-y-3">
        <Button
          type="submit"
          variant="gradient"
          size="lg"
          className="w-full min-h-[48px] text-base font-semibold"
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

      <p className="text-xs text-muted-foreground/60">
        Default PIN is 1234. Ask an admin if you forgot yours.
      </p>
    </form>
  )
}
