"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Download, X, Printer } from "lucide-react"
import QRCode from "qrcode"

interface QrModalProps {
  eventName: string
  eventId: string
  baseUrl: string
  onClose: () => void
}

export function QrModal({ eventName, eventId, baseUrl, onClose }: QrModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)

  const attendUrl = `${baseUrl}/attend?event=${eventId}`

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, attendUrl, {
        width: 280,
        margin: 2,
        color: {
          dark: "#10b981",
          light: "#0a0a0f",
        },
      }).catch(() => setError("Failed to generate QR code."))
    }
  }, [attendUrl])

  function handleDownload() {
    if (!canvasRef.current) return
    const link = document.createElement("a")
    link.download = `qr-${eventName.replace(/\s+/g, "-").toLowerCase()}.png`
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
          <p style="color:#666;margin-bottom:24px;">Scan to check in</p>
          <img src="${dataUrl}" style="width:300px;height:300px;" />
          <p style="color:#999;margin-top:16px;font-size:12px;">CTJCC Marikina Youth & YA</p>
        </body>
      </html>
    `)
    win.document.close()
    win.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

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
          <p className="text-xs text-muted-foreground">Scan this QR code to check in</p>
        </div>

        <div className="flex justify-center">
          {error ? (
            <p className="text-sm text-red-400">{error}</p>
          ) : (
            <canvas ref={canvasRef} className="rounded-xl" />
          )}
        </div>

        <p className="text-[10px] text-muted-foreground/50 text-center break-all">{attendUrl}</p>

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
