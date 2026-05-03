"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight } from "lucide-react"

const LABELS: Record<string, string> = {
  admin: "Admin",
  events: "Events",
  members: "Members",
  attendance: "Attendance",
  login: "Login",
}

function labelFor(segment: string): string {
  return LABELS[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1)
}

export function Breadcrumbs() {
  const pathname = usePathname()

  // Skip on the bare /admin landing — sidebar logo + page title cover it
  if (pathname === "/admin" || pathname === "/admin/login") return null

  const segments = pathname.split("/").filter(Boolean)

  // Build cumulative paths
  const crumbs = segments.map((seg, i) => ({
    label: labelFor(seg),
    href: "/" + segments.slice(0, i + 1).join("/"),
    isLast: i === segments.length - 1,
  }))

  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-4 -mt-2"
    >
      <ol className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
        {crumbs.map((crumb) => (
          <li key={crumb.href} className="flex items-center gap-1.5">
            {crumb.isLast ? (
              <span
                aria-current="page"
                className="text-foreground/80 font-medium"
              >
                {crumb.label}
              </span>
            ) : (
              <>
                <Link
                  href={crumb.href}
                  className="hover:text-orange-400 transition-colors"
                >
                  {crumb.label}
                </Link>
                <ChevronRight className="size-3 text-muted-foreground/50" />
              </>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
