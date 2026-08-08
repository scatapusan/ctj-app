"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Download, X, Printer } from "lucide-react"
import QRCode from "qrcode"

type QrMode = "checkin" | "preregister"

interface QrModalProps {
  eventName: string
  eventId: string
  baseUrl: string
  /** Retreat-style events open on their pre-registration QR. */
  defaultMode?: QrMode
  onClose: () => void
}

export function QrModal({ eventName, eventId, baseUrl, defaultMode = "checkin", onClose }: QrModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<QrMode>(defaultMode)

  const attendUrl =
    mode === "checkin"
      ? `${baseUrl}/attend?event=${eventId}`
      : `${baseUrl}/retreat?event=${eventId}`
  const actionLabel = mode === "checkin" ? "check in" : "pre-register"

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, attendUrl, {
        width: 280,
        margin: 2,
        color: {
          dark: "#1F2B4D",
          light: "#FFFDF6",
        },
      }).catch(() => setError("Failed to generate QR code."))
    }
  }, [attendUrl])

  function handleDownload() {
    if (!canvasRef.current) return
    const link = document.createElement("a")
    link.download = `qr-${mode}-${eventName.replace(/\s+/g, "-").toLowerCase()}.png`
    link.href = canvasRef.current.toDataURL("image/png")
    link.click()
  }

  function handlePrint() {
    if (!canvasRef.current) return
    const dataUrl = canvasRef.current.toDataURL("image/png")
    const win = window.open("", "_blank")
    if (!win) return
    win.document.write(`
      <html>
        <head><title>QR Code - ${eventName}</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui;background:#fff;margin:0;">
          <h2 style="margin-bottom:8px;">${eventName}</h2>
          <p style="color:#666;margin-bottom:24px;">Scan to ${actionLabel}</p>
          <img src="${dataUrl}" style="width:300px;height:300px;" />
          <p style="color:#999;margin-top:16px;font-size:12px;">Come To Jesus Community Church of Marikina — Youth & YA</p>
        </body>
      </html>
    `)
    win.document.close()
    win.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-foreground/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative glass rounded-2xl p-6 max-w-sm w-full space-y-5 animate-check-scale">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="size-5" />
        </button>

        <div className="text-center space-y-1">
          <h3 className="text-lg font-semibold gradient-text">{eventName}</h3>
          <p className="text-xs text-muted-foreground">Scan this QR code to {actionLabel}</p>
        </div>

        {/* Mode switch: day-of check-in QR vs pre-registration QR */}
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="QR type">
          {(
            [
              { value: "checkin", label: "Check-in" },
              { value: "preregister", label: "Pre-registration" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={mode === opt.value}
              onClick={() => setMode(opt.value)}
              className={`min-h-[40px] rounded-full text-sm transition-all ${
                mode === opt.value
                  ? "bg-primary border-2 border-foreground font-bold text-foreground"
                  : "bg-card border-2 border-border font-semibold text-muted-foreground hover:border-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex justify-center">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <canvas ref={canvasRef} className="rounded-xl" />
          )}
        </div>

        <p className="text-[10px] text-muted-foreground text-center break-all">{attendUrl}</p>

        <div className="flex gap-3">
          <Button
            variant="gradient"
            size="lg"
            className="flex-1 min-h-[44px]"
            onClick={handleDownload}
          >
            <Download className="size-4 mr-2" />
            Download
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="flex-1 min-h-[44px]"
            onClick={handlePrint}
          >
            <Printer className="size-4 mr-2" />
            Print
          </Button>
        </div>
      </div>
    </div>
  )
}
