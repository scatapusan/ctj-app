"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { createBrowserClient } from "@/lib/supabase"

type Role = "superadmin" | "core" | "member"

interface RoleContextValue {
  role: Role
  isSuperadmin: boolean
  isCore: boolean
  loading: boolean
}

const RoleContext = createContext<RoleContextValue>({
  role: "member",
  isSuperadmin: false,
  isCore: false,
  loading: true,
})

export function useRole() {
  return useContext(RoleContext)
}

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role>("member")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchRole() {
      const supabase = createBrowserClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user?.email) {
        setLoading(false)
        return
      }

      const { data: member } = await supabase
        .from("members")
        .select("is_admin, is_youth_ya_core")
        .eq("email", user.email)
        .maybeSingle()

      if (member?.is_admin) {
        setRole("superadmin")
      } else if (member?.is_youth_ya_core) {
        setRole("core")
      }

      setLoading(false)
    }

    fetchRole()
  }, [])

  return (
    <RoleContext.Provider
      value={{
        role,
        isSuperadmin: role === "superadmin",
        isCore: role === "core",
        loading,
      }}
    >
      {children}
    </RoleContext.Provider>
  )
}
