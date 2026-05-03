"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@/lib/supabase"
import { useRole } from "@/components/admin/role-provider"
import { StatsCard } from "@/components/admin/stats-card"
import { DashboardSkeleton } from "@/components/admin/dashboard-skeleton"
import { Users, Calendar, ClipboardList, UserCheck, Sheet, Loader2 } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { toast } from "@/lib/toast"

interface RecentCheckIn {
  id: string
  checked_in_at: string
  member_name: string
  event_name: string
}

export default function AdminDashboard() {
  const { isSuperadmin } = useRole()
  const [totalMembers, setTotalMembers] = useState(0)
  const [activeEvents, setActiveEvents] = useState(0)
  const [todayAttendance, setTodayAttendance] = useState(0)
  const [totalAdmins, setTotalAdmins] = useState(0)
  const [recent, setRecent] = useState<RecentCheckIn[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createBrowserClient()

      // Fetch counts in parallel
      const [membersRes, eventsRes, adminsRes, recentRes] = await Promise.all([
        supabase.from("members").select("id", { count: "exact", head: true }),
        supabase.from("events").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("members").select("id", { count: "exact", head: true }).eq("is_admin", true),
        supabase
          .from("attendance")
          .select("id, checked_in_at, member_id, event_id")
          .order("checked_in_at", { ascending: false })
          .limit(10),
      ])

      setTotalMembers(membersRes.count ?? 0)
      setActiveEvents(eventsRes.count ?? 0)
      setTotalAdmins(adminsRes.count ?? 0)

      // Today's attendance
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const { count: todayCount } = await supabase
        .from("attendance")
        .select("id", { count: "exact", head: true })
        .gte("checked_in_at", today.toISOString())

      setTodayAttendance(todayCount ?? 0)

      // Enrich recent check-ins with member/event names
      if (recentRes.data && recentRes.data.length > 0) {
        const memberIds = Array.from(new Set(recentRes.data.map((a) => a.member_id)))
        const eventIds = Array.from(new Set(recentRes.data.map((a) => a.event_id)))

        const [membersData, eventsData] = await Promise.all([
          supabase.from("members").select("id, first_name, last_name").in("id", memberIds),
          supabase.from("events").select("id, name").in("id", eventIds),
        ])

        const memberMap = new Map(
          (membersData.data || []).map((m) => [m.id, `${m.first_name} ${m.last_name}`])
        )
        const eventMap = new Map(
          (eventsData.data || []).map((e) => [e.id, e.name])
        )

        setRecent(
          recentRes.data.map((a) => ({
            id: a.id,
            checked_in_at: a.checked_in_at,
            member_name: memberMap.get(a.member_id) || "Unknown",
            event_name: eventMap.get(a.event_id) || "Unknown Event",
          }))
        )
      }

      setLoading(false)
    }

    load()
  }, [])

  async function handleSyncSheets() {
    setSyncing(true)
    try {
      const res = await fetch("/api/sheets/export", { method: "POST" })
      const data = await res.json()
      if (data.ok) {
        toast.success("Synced to Google Sheets", {
          description: `${data.exported.members} members and ${data.exported.attendance} attendance records`,
        })
      } else {
        toast.error("Sync failed", {
          description: data.error,
          action: { label: "Retry", onClick: handleSyncSheets },
        })
      }
    } catch {
      toast.error("Network error", {
        description: "Couldn't reach the server.",
        action: { label: "Retry", onClick: handleSyncSheets },
      })
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return <DashboardSkeleton />
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold gradient-text">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Overview of CTJCC Marikina Youth & YA</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard label="Total Members" value={totalMembers} icon={Users} accent="orange" />
        <StatsCard label="Active Events" value={activeEvents} icon={Calendar} accent="blue" />
        <StatsCard label="Today's Attendance" value={todayAttendance} icon={ClipboardList} accent="amber" />
        <StatsCard label="Admins" value={totalAdmins} icon={UserCheck} accent="orange" />
      </div>

      {/* Quick actions */}
      <div className="flex gap-3 flex-wrap">
        <Link href="/admin/events">
          <Button variant="gradient" size="sm">
            <Calendar className="size-4 mr-2" />
            Manage Events
          </Button>
        </Link>
        <Link href="/admin/members">
          <Button variant="outline" size="sm">
            <Users className="size-4 mr-2" />
            View Members
          </Button>
        </Link>
        <Link href="/admin/attendance">
          <Button variant="outline" size="sm">
            <ClipboardList className="size-4 mr-2" />
            Attendance Records
          </Button>
        </Link>
        {isSuperadmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncSheets}
            disabled={syncing}
          >
            {syncing ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <Sheet className="size-4 mr-2" />
                Sync to Google Sheets
              </>
            )}
          </Button>
        )}
      </div>

      {/* Recent check-ins */}
      <div className="glass rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-orange-400/80 uppercase tracking-wider">
          Recent Check-ins
        </h2>

        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent check-ins.</p>
        ) : (
          <div className="space-y-2">
            {recent.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02] border border-white/[0.04]"
              >
                <div>
                  <p className="text-sm font-medium text-foreground/90">{item.member_name}</p>
                  <p className="text-xs text-muted-foreground">{item.event_name}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(item.checked_in_at), "MMM d, h:mm a")}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
