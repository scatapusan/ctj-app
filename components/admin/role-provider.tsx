"use client"

import { createContext, useContext, useEffect, useState } from "react"

type Role = "superadmin" | "core" | "member"

interface RoleContextValue {
  role: Role
  email: string | null
  /** The signed-in member's own id — lets a screen recognise "this is you". */
  memberId: string | null
  isSuperadmin: boolean
  isCore: boolean
  loading: boolean
}

const RoleContext = createContext<RoleContextValue>({
  role: "member",
  email: null,
  memberId: null,
  isSuperadmin: false,
  isCore: false,
  loading: true,
})

export function useRole() {
  return useContext(RoleContext)
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role>("member")
  const [email, setEmail] = useState<string | null>(null)
  const [memberId, setMemberId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchRole() {
      try {
        const res = await fetch("/api/admin/me", { credentials: "include" })
        const data = await res.json().catch(() => ({}))
        if (cancelled) return

        if (data?.authenticated) {
          if (data.role === "admin") setRole("superadmin")
          else if (data.role === "core") setRole("core")
          setEmail(data.email ?? null)
          setMemberId(data.memberId ?? null)
        }
      } catch {
        // Network error — leave defaults
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchRole()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <RoleContext.Provider
      value={{
        role,
        email,
        memberId,
        isSuperadmin: role === "superadmin",
        isCore: role === "core",
        loading,
      }}
    >
      {children}
    </RoleContext.Provider>
  )
}
