"use client"

import { useEffect, useState } from "react"
import { createBrowserClient, MEMBER_COLUMNS } from "@/lib/supabase"
import { useRole } from "@/components/admin/role-provider"
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
  Star,
  StarOff,
  UsersRound,
  Trash2,
  Download,
} from "lucide-react"
import { format } from "date-fns"

const MEMBER_GROUPS = ["Youth", "YA", "Singles"] as const

export default function MembersPage() {
  const { isSuperadmin } = useRole()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [attendanceHistory, setAttendanceHistory] = useState<
    { id: string; event_name: string; checked_in_at: string }[]
  >([])
  const [actionLoading, setActionLoading] = useState(false)
  const [filter, setFilter] = useState<"all" | "admins" | "core" | "guests">("all")

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

  async function toggleCore(member: Member) {
    setActionLoading(true)
    const supabase = createBrowserClient()
    await supabase
      .from("members")
      .update({ is_youth_ya_core: !member.is_youth_ya_core })
      .eq("id", member.id)

    await loadMembers()
    if (selectedMember?.id === member.id) {
      setSelectedMember({ ...member, is_youth_ya_core: !member.is_youth_ya_core })
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

  async function setMemberGroup(memberId: string, group: string | null) {
    setActionLoading(true)
    const supabase = createBrowserClient()
    await supabase
      .from("members")
      .update({ member_group: group })
      .eq("id", memberId)

    await loadMembers()
    if (selectedMember?.id === memberId) {
      setSelectedMember({ ...selectedMember, member_group: group })
    }
    setActionLoading(false)
  }

  const [deletingMember, setDeletingMember] = useState(false)

  async function handleDeleteMember(member: Member) {
    setActionLoading(true)
    try {
      const supabase = createBrowserClient()

      // Delete attendance records first
      await supabase.from("attendance").delete().eq("member_id", member.id)

      // Delete photo from storage if exists
      if (member.photo_url) {
        const parts = member.photo_url.split("/")
        const fileName = parts[parts.length - 1]
        if (fileName && !fileName.startsWith("http")) {
          await supabase.storage.from("member-photos").remove([fileName])
        }
      }

      // Delete the member
      await supabase.from("members").delete().eq("id", member.id)

      setSelectedMember(null)
      setDeletingMember(false)
      await loadMembers()
    } catch (err) {
      console.error("Delete error:", err)
      alert("Failed to delete member. Please try again.")
    }
    setActionLoading(false)
  }

  function exportMemberData(member: Member) {
    const data = {
      personalInfo: {
        firstName: member.first_name,
        middleName: member.middle_name,
        lastName: member.last_name,
        nickname: member.nickname,
        email: member.email,
        gender: member.gender,
        birthdate: member.birthdate,
        contactNumber: member.contact_number,
        address: member.address,
        occupation: member.occupation,
        facebookLink: member.facebook_link,
      },
      family: {
        fatherName: member.father_name,
        motherName: member.mother_name,
        maritalStatus: member.marital_status,
        spouseName: member.spouse_name,
        childrenNames: member.children_names,
      },
      emergencyContact: {
        name: member.emergency_contact_name,
        number: member.emergency_contact_number,
      },
      churchInfo: {
        memberGroup: member.member_group,
        isGuest: member.is_guest,
        disciplerName: member.discipler_name,
        disciples: member.disciples,
        ministryInvolvements: member.ministry_involvements,
        lifelineLeader: member.lifeline_leader,
        dateJoinedCTJCC: member.date_joined_ctjcc,
        spiritualBirthday: member.spiritual_birthday,
        baptizedInWater: member.baptized_in_water,
        completedReach: member.completed_reach,
        completedFreshStart: member.completed_fresh_start,
        completedFreedomDay: member.completed_freedom_day,
        completedGrandDay: member.completed_grand_day,
      },
      attendanceHistory: attendanceHistory.map((a) => ({
        event: a.event_name,
        checkedInAt: a.checked_in_at,
      })),
      exportedAt: new Date().toISOString(),
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${member.first_name}_${member.last_name}_data.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const filteredMembers = members.filter((m) => {
    if (filter === "admins") return m.is_admin
    if (filter === "core") return m.is_youth_ya_core
    if (filter === "guests") return m.is_guest
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
          className="text-muted-foreground hover:text-orange-400"
        >
          <ArrowLeft className="size-4 mr-1" />
          Back to Members
        </Button>

        <div className="glass rounded-xl p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 ring-2 ring-orange-500/30">
              {m.photo_url ? <AvatarImage src={m.photo_url} alt={m.first_name} /> : null}
              <AvatarFallback className="text-lg font-semibold bg-orange-500/10 text-orange-400">
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
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20 font-medium">
                    Admin
                  </span>
                )}
                {m.is_youth_ya_core && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20 font-medium">
                    Core
                  </span>
                )}
                {m.is_guest && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20 font-medium">
                    Guest
                  </span>
                )}
                {m.member_group && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/20 font-medium">
                    {m.member_group}
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
            <p className="text-xs font-semibold text-orange-400/80 uppercase tracking-wider mb-2">
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
            <p className="text-xs font-semibold text-orange-400/80 uppercase tracking-wider mb-2">
              Emergency Contact
            </p>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <InfoRow label="Contact Person" value={m.emergency_contact_name} />
              <InfoRow label="Contact Number" value={m.emergency_contact_number} />
            </div>
          </div>

          {/* Discipleship & Ministry */}
          <div>
            <p className="text-xs font-semibold text-orange-400/80 uppercase tracking-wider mb-2">
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
            <p className="text-xs font-semibold text-orange-400/80 uppercase tracking-wider mb-2">
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

          {/* Group assignment — both superadmin and core can set */}
          <div className="pt-2 border-t border-white/[0.06] space-y-3">
            <div>
              <p className="text-xs font-semibold text-orange-400/80 uppercase tracking-wider mb-2">
                <UsersRound className="size-3 inline mr-1" />
                Member Group
              </p>
              <div className="flex gap-2 flex-wrap">
                {MEMBER_GROUPS.map((group) => (
                  <Button
                    key={group}
                    variant={m.member_group === group ? "gradient" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => setMemberGroup(m.id, m.member_group === group ? null : group)}
                    disabled={actionLoading}
                  >
                    {group}
                  </Button>
                ))}
              </div>
            </div>

            {/* Admin actions — superadmin only */}
            {isSuperadmin && (
              <div className="flex gap-3 flex-wrap">
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
                  onClick={() => toggleCore(m)}
                  disabled={actionLoading}
                >
                  {m.is_youth_ya_core ? (
                    <>
                      <StarOff className="size-4 mr-1.5" />
                      Remove Core
                    </>
                  ) : (
                    <>
                      <Star className="size-4 mr-1.5" />
                      Make Core
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
            )}

            {/* Data management — superadmin only */}
            {isSuperadmin && (
              <div className="flex gap-3 flex-wrap pt-2 border-t border-white/[0.06]">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportMemberData(m)}
                >
                  <Download className="size-4 mr-1.5" />
                  Export Data
                </Button>

                {deletingMember ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-red-400">Permanently delete all data?</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300 text-xs"
                      onClick={() => handleDeleteMember(m)}
                      disabled={actionLoading}
                    >
                      Confirm Delete
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => setDeletingMember(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-400 border-red-500/20 hover:bg-red-500/10 hover:text-red-300"
                    onClick={() => setDeletingMember(true)}
                  >
                    <Trash2 className="size-4 mr-1.5" />
                    Delete Member
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Attendance history */}
        <div className="glass rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-orange-400/80 uppercase tracking-wider">
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
                    <Calendar className="size-3 text-orange-400/60" />
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
      <div className="flex gap-2 flex-wrap">
        {(["all", "core", "admins", "guests"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "gradient" : "ghost"}
            size="sm"
            onClick={() => setFilter(f)}
            className="text-xs capitalize"
          >
            {f === "all" ? "All" : f === "core" ? "Core" : f === "admins" ? "Admins" : "Guests"}
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
                  <AvatarFallback className="text-xs bg-orange-500/10 text-orange-400">
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
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20">
                      Admin
                    </span>
                  )}
                  {m.is_youth_ya_core && !m.is_admin && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20">
                      Core
                    </span>
                  )}
                  {m.is_guest && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20">
                      Guest
                    </span>
                  )}
                  {m.member_group && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/20">
                      {m.member_group}
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
          ? "bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20"
          : "bg-white/[0.04] text-muted-foreground/60 ring-1 ring-white/[0.06]"
      }`}
    >
      {completed ? "\u2713" : "\u2717"} {label}
    </span>
  )
}
