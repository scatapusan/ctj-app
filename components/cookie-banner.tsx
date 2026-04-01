"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

export function CookieBanner() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem("cookie-consent")) {
      setShow(true)
    }
  }, [])

  function handleDismiss() {
    localStorage.setItem("cookie-consent", "true")
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="glass rounded-xl p-4 flex items-start gap-3 ring-1 ring-white/[0.08] shadow-lg">
        <div className="flex-1 text-xs text-muted-foreground leading-relaxed">
          This site uses cookies for authentication only (no tracking).{" "}
          <Link href="/privacy" className="text-orange-400 underline underline-offset-2 hover:text-orange-300">
            Privacy Policy
          </Link>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="shrink-0 text-muted-foreground hover:text-foreground h-6 w-6 p-0"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  )
}
