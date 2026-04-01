"use client"

import { useEffect, useState } from "react"
import { createBrowserClient, MEMBER_COLUMNS } from "@/lib/supabase"
import type { Member } from "@/lib/types"
import { DataTable } from "@/components/admin/data-table"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import {
  ShieldCheck,
  ShieldOff,
  KeyRound,
  ArrowLeft,
  Calendar,
} from "lucide-react"
import { format } from "date-fns"

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [attendanceHistory, setAttendanceHistory] = useState<
    { id: string; event_name: string; checked_in_at: string }[]
  >([])
  const [actionLoading, setActionLoading] = useState(false)
  const [filter, setFilter] = useState<"all" | "admins" | "core">("all")

  useEffect(() => {
    loadMembers()
  }, [])

  async function loadMembers() {
    const supabase = createBrowserClient()
    const { data } = await supabase
      .from("members")
      .select(MEMBER_COLUMNS)
      .order("created_at", { ascending: false })

    if (data) setMembers(data as Member[])
    setLoading(false)
  }

  async function selectMember(member: Member) {
    setSelectedMember(member)

    // Load attendance history
    const supabase = createBrowserClient()
    const { data: attendanceData } = await supabase
      .from("attendance")
      .select("id, checked_in_at, event_id")
      .eq("member_id", member.id)
      .order("checked_in_at", { ascending: false })
      .limit(50)

    if (attendanceData && attendanceData.length > 0) {
      const eventIds = Array.from(new Set(attendanceData.map((a) => a.event_id)))
      const { data: eventsData } = await supabase
        .from("events")
        .select("id, name")
        .in("id", eventIds)

      const eventMap = new Map(
        (eventsData || []).map((e) => [e.id, e.name])
      )

      setAttendanceHistory(
        attendanceData.map((a) => ({
          id: a.id,
          event_name: eventMap.get(a.event_id) || "Unknown Event",
          checked_in_at: a.checked_in_at,
        }))
      )
    } else {
      setAttendanceHistory([])
    }
  }

  async function toggleAdmin(member: Member) {
    setActionLoading(true)
    const supabase = createBrowserClient()
    await supabase
      .from("members")
      .update({ is_admin: !member.is_admin })
      .eq("id", member.id)

    await loadMembers()
    if (selectedMember?.id === member.id) {
      setSelectedMember({ ...member, is_admin: !member.is_admin })
    }
    setActionLoading(false)
  }

  async function resetPin(memberId: string) {
    setActionLoading(true)
    const supabase = createBrowserClient()
    await supabase
      .from("members")
      .update({ pin: "1234" })
      .eq("id", memberId)

    alert("PIN has been reset to 1234.")
    setActionLoading(false)
  }

  const filteredMembers = members.filter((m) => {
    if (filter === "admins") return m.is_admin
    if (filter === "core") return m.is_youth_ya_core
    return true
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-pulse text-muted-foreground">Loading members...</div>
      </div>
    )
  }

  // Member detail view
  if (selectedMember) {
    const m = selectedMember
    const initials = `${m.first_name?.[0] || ""}${m.last_name?.[0] || ""}`.toUpperCase()

    return (
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSelectedMember(null)}
          className="text-muted-foreground hover:text-emerald-400"
        >
          <ArrowLeft className="size-4 mr-1" />
          Back to Members
        </Button>

        <div className="glass rounded-xl p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 ring-2 ring-emerald-500/30">
              {m.photo_url ? <AvatarImage src={m.photo_url} alt={m.first_name} /> : null}
              <AvatarFallback className="text-lg font-semibold bg-emerald-500/10 text-emerald-400">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-xl font-bold text-foreground">
                {m.first_name} {m.middle_name ? `${m.middle_name} ` : ""}{m.last_name}
              </h2>
              <p className="text-sm text-muted-foreground">{m.email}</p>
              <div className="flex gap-2 mt-1">
                {m.is_admin && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20 font-medium">
                    Admin
                  </span>
                )}
                {m.is_youth_ya_core && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/20 font-medium">
                    Core
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Details grid */}
          {/* Personal Info */}
          <div className="grid sm:grid-cols-2 gap-4 text-sm">
            <InfoRow label="Nickname" value={m.nickname} />
            <InfoRow label="Gender" value={m.gender} />
            <InfoRow label="Contact" value={m.contact_number} />
            <InfoRow label="Birthdate" value={m.birthdate ? format(new Date(m.birthdate), "MMM d, yyyy") : null} />
            <InfoRow label="Address" value={m.address} />
            <InfoRow label="Occupation" value={m.occupation} />
            <InfoRow label="Facebook" value={m.facebook_link} />
            <InfoRow label="Joined App" value={format(new Date(m.created_at), "MMM d, yyyy")} />
          </div>

          {/* Family */}
          <div>
            <p className="text-xs font-semibold text-emerald-400/80 uppercase tracking-wider mb-2">
              Family
            </p>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <InfoRow label="Father" value={m.father_name} />
              <InfoRow label="Mother" value={m.mother_name} />
              <InfoRow label="Marital Status" value={m.marital_status} />
              <InfoRow label="Spouse" value={m.spouse_name} />
              <InfoRow label="Children" value={m.children_names} />
            </div>
          </div>

          {/* Emergency Contact */}
          <div>
            <p className="text-xs font-semibold text-emerald-400/80 uppercase tracking-wider mb-2">
              Emergency Contact
            </p>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <InfoRow label="Contact Person" value={m.emergency_contact_name} />
              <InfoRow label="Contact Number" value={m.emergency_contact_number} />
            </div>
          </div>

          {/* Discipleship & Ministry */}
          <div>
            <p className="text-xs font-semibold text-emerald-400/80 uppercase tracking-wider mb-2">
              Discipleship & Ministry
            </p>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <InfoRow label="Discipler" value={m.discipler_name} />
              <InfoRow label="Ministry" value={m.ministry_involvements} />
              <InfoRow label="Lifeline Leader" value={m.lifeline_leader} />
              <InfoRow label="Date Joined CTJCC" value={m.date_joined_ctjcc} />
              <InfoRow label="Spiritual Birthday" value={m.spiritual_birthday} />
            </div>
          </div>

          {/* Seminar completion */}
          <div>
            <p className="text-xs font-semibold text-emerald-400/80 uppercase tracking-wider mb-2">
              Status
            </p>
            <div className="flex flex-wrap gap-2">
              <StatusBadge label="Baptized" completed={m.baptized_in_water} />
              <StatusBadge label="REACH" completed={m.completed_reach} />
              <StatusBadge label="Fresh Start" completed={m.completed_fresh_start} />
              <StatusBadge label="Freedom Day" completed={m.completed_freedom_day} />
              <StatusBadge label="Grand Day" completed={m.completed_grand_day} />
            </div>
          </div>

          {/* Admin actions */}
          <div className="flex gap-3 flex-wrap pt-2 border-t border-white/[0.06]">
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleAdmin(m)}
              disabled={actionLoading}
            >
              {m.is_admin ? (
                <>
                  <ShieldOff className="size-4 mr-1.5" />
                  Remove Admin
                </>
              ) : (
                <>
                  <ShieldCheck className="size-4 mr-1.5" />
                  Make Admin
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => resetPin(m.id)}
              disabled={actionLoading}
            >
              <KeyRound className="size-4 mr-1.5" />
              Reset PIN
            </Button>
          </div>
        </div>

        {/* Attendance history */}
        <div className="glass rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-emerald-400/80 uppercase tracking-wider">
            Attendance History ({attendanceHistory.length})
          </h3>

          {attendanceHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attendance records.</p>
          ) : (
            <div className="space-y-2">
              {attendanceHistory.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/[0.02] border border-white/[0.04]"
                >
                  <span className="text-sm text-foreground/80 flex items-center gap-2">
                    <Calendar className="size-3 text-emerald-400/60" />
                    {a.event_name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(a.checked_in_at), "MMM d, yyyy h:mm a")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold gradient-text">Members</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {members.length} total members
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(["all", "core", "admins"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "gradient" : "ghost"}
            size="sm"
            onClick={() => setFilter(f)}
            className="text-xs capitalize"
          >
            {f === "all" ? "All" : f === "core" ? "YA Core" : "Admins"}
          </Button>
        ))}
      </div>

      <DataTable
        data={filteredMembers as unknown as Record<string, unknown>[]}
        columns={[
          {
            key: "photo_url",
            label: "",
            render: (item) => {
              const m = item as unknown as Member
              const initials = `${m.first_name?.[0] || ""}${m.last_name?.[0] || ""}`.toUpperCase()
              return (
                <Avatar className="h-8 w-8">
                  {m.photo_url ? <AvatarImage src={m.photo_url} alt={m.first_name} /> : null}
                  <AvatarFallback className="text-xs bg-emerald-500/10 text-emerald-400">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              )
            },
          },
          {
            key: "first_name",
            label: "Name",
            sortable: true,
            render: (item) => {
              const m = item as unknown as Member
              return (
                <span className="font-medium">
                  {m.first_name} {m.last_name}
                  {m.is_admin && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20">
                      Admin
                    </span>
                  )}
                </span>
              )
            },
          },
          { key: "email", label: "Email", sortable: true },
          { key: "contact_number", label: "Contact" },
        ]}
        searchKeys={["first_name", "last_name", "email", "contact_number"]}
        searchPlaceholder="Search members..."
        onRowClick={(item) => selectMember(item as unknown as Member)}
      />
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-foreground/80">{value || "—"}</p>
    </div>
  )
}

function StatusBadge({ label, completed }: { label: string; completed: boolean }) {
  return (
    <span
      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
        completed
          ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
          : "bg-white/[0.04] text-muted-foreground/60 ring-1 ring-white/[0.06]"
      }`}
    >
      {completed ? "\u2713" : "\u2717"} {label}
    </span>
  )
}
