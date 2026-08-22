"use client"

import { useEffect, useState } from "react"
import { useRole } from "@/components/admin/role-provider"
import { StatsCard } from "@/components/admin/stats-card"
import { DashboardSkeleton } from "@/components/admin/dashboard-skeleton"
import { Users, Calendar, ClipboardList, UserCheck, Sheet, Loader2 } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { toast } from "@/lib/toast"
import { useConfirm } from "@/components/admin/confirm-dialog"

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
  const { confirm, confirmDialog } = useConfirm()

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/dashboard")
        if (res.ok) {
          const data = await res.json()
          setTotalMembers(data.stats.totalMembers)
          setActiveEvents(data.stats.activeEvents)
          setTodayAttendance(data.stats.todayAttendance)
          setTotalAdmins(data.stats.totalAdmins)
          setRecent(data.recent)
        }
      } catch {
        // leave defaults on network error
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  /**
   * Push everything to the ministry's Google Sheet.
   *
   * The button reads as if it adds rows. It does not: the export CLEARS the
   * Members and Attendance tabs and rewrites them from the database
   * (lib/google-sheets.ts), so anything typed into those tabs by hand is gone,
   * and the only copy is Google's own version history — outside this app.
   */
  async function handleSyncSheets() {
    const confirmed = await confirm({
      title: "Replace the Google Sheet with the current data?",
      body: (
        <>
          <p>
            This <strong className="text-foreground">clears the Members and Attendance tabs</strong>{" "}
            and writes them again from scratch. Anything typed into those tabs by hand — notes,
            tallies, extra columns — is overwritten.
          </p>
          <p className="mt-2">
            The only way back is Google Sheets&apos; own version history.
          </p>
        </>
      ),
      confirmLabel: "Replace and sync",
      tone: "destructive",
    })
    if (!confirmed) return

    setSyncing(true)
    try {
      const res = await fetch("/api/sheets/export", { method: "POST" })
      const data = await res.json()
      if (data.ok) {
        toast.success("Synced to Google Sheets", {
          description: `${data.exported.members} members and ${data.exported.attendance} attendance records`,
        })
      } else {
        toast.error("Sync failed", { description: data.error })
      }
    } catch {
      toast.error("Network error", { description: "Couldn't reach the server." })
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
        <h2 className="text-sm font-semibold text-accent/80 uppercase tracking-wider">
          Recent Check-ins
        </h2>

        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent check-ins.</p>
        ) : (
          <div className="space-y-2">
            {recent.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50 border border-border/30"
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

      {confirmDialog}
    </div>
  )
}
