"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useRole } from "@/components/admin/role-provider"
import { Button } from "@/components/ui/button"
import {
  LayoutDashboard,
  Calendar,
  Users,
  ClipboardList,
  LogOut,
  Menu,
  X,
  Sparkles,
  Home,
} from "lucide-react"

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/events", label: "Events", icon: Calendar },
  { href: "/admin/members", label: "Members", icon: Users },
  { href: "/admin/attendance", label: "Attendance", icon: ClipboardList },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { isSuperadmin, isCore } = useRole()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" })
    router.push("/admin/login")
    router.refresh()
  }

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin"
    return pathname.startsWith(href)
  }

  const nav = (
    <>
      {/* Logo */}
      <div className="px-4 py-6 flex items-center gap-3">
        <div className="rounded-full bg-primary border-2 border-foreground p-2.5">
          <Sparkles className="size-5 text-accent" />
        </div>
        <div>
          <p className="text-sm font-bold gradient-text">CTJCC Marikina</p>
          <p className="text-[10px] text-muted-foreground">
            {isSuperadmin ? "Admin" : isCore ? "Core Leader" : "Dashboard"}
          </p>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                active
                  ? "bg-primary text-foreground font-bold border-2 border-foreground"
                  : "text-muted-foreground font-semibold hover:text-foreground hover:bg-secondary/60 border-2 border-transparent"
              }`}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer actions */}
      <div className="px-3 pb-4 space-y-1 border-t border-border/30 pt-3">
        <Link
          href="/"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-card transition-all duration-200 w-full"
        >
          <Home className="size-4" />
          Back to site
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200 w-full"
        >
          <LogOut className="size-4" />
          Logout
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile hamburger */}
      <Button
        variant="ghost"
        size="sm"
        aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={mobileOpen}
        className="fixed top-3 left-3 z-50 lg:hidden min-h-[44px] min-w-[44px] glass border border-border/30"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </Button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-foreground/40 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - mobile: slide in, desktop: fixed */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-card border-r-2 border-foreground z-40 flex flex-col transition-transform duration-300 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {nav}
      </aside>
    </>
  )
}
