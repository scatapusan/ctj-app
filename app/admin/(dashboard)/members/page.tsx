"use client"

import { useEffect, useState } from "react"
import { useRole } from "@/components/admin/role-provider"
import type { Member } from "@/lib/types"
import { DataTable } from "@/components/admin/data-table"
import { ListSkeleton } from "@/components/admin/list-skeleton"
import { InviteMemberDialog } from "@/components/admin/invite-member-dialog"
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
  ChevronRight,
  UserPlus,
} from "lucide-react"
import { format } from "date-fns"
import { toast } from "@/lib/toast"
import { useConfirm } from "@/components/admin/confirm-dialog"

const MEMBER_GROUPS = ["Youth", "YA", "Singles"] as const

export default function MembersPage() {
  const { isSuperadmin, memberId } = useRole()
  const { confirm, confirmDialog } = useConfirm()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMember, setSelectedMember] = useState<Member | null>(null)
  const [attendanceHistory, setAttendanceHistory] = useState<
    { id: string; event_name: string; checked_in_at: string }[]
  >([])
  const [actionLoading, setActionLoading] = useState(false)
  const [filter, setFilter] = useState<"all" | "admins" | "core" | "guests">("all")
  const [inviteOpen, setInviteOpen] = useState(false)

  useEffect(() => {
    loadMembers()
  }, [])

  async function loadMembers() {
    try {
      const res = await fetch("/api/admin/members")
      if (res.ok) {
        const data = await res.json()
        setMembers(data.members as Member[])
      }
    } catch {
      // leave existing on error
    } finally {
      setLoading(false)
    }
  }

  async function selectMember(member: Member) {
    setSelectedMember(member)
    // Both of these are per-member and were previously only ever overwritten,
    // never cleared. Opening B after A rendered — and EXPORTED — A's attendance
    // history under B's name until B's fetch resolved.
    setAttendanceHistory([])
    try {
      const res = await fetch(`/api/admin/members/${member.id}`)
      if (res.ok) {
        const data = await res.json()
        setSelectedMember(data.member as Member)
        setAttendanceHistory(data.attendanceHistory)
      } else {
        setAttendanceHistory([])
      }
    } catch {
      setAttendanceHistory([])
    }
  }

  async function patchMember(memberId: string, body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`/api/admin/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    return res.ok
  }

  async function toggleAdmin(member: Member) {
    const removing = member.is_admin
    const isSelf = member.id === memberId
    const confirmed = await confirm({
      title: removing
        ? `Remove admin access from ${member.first_name} ${member.last_name}?`
        : `Give ${member.first_name} ${member.last_name} admin access?`,
      body: removing ? (
        <>
          <p>
            They keep their core-leader access and can still sign in, but they
            lose event editing, member deletion and the Sheets sync.
          </p>
          {isSelf && (
            <p className="mt-2 text-destructive font-bold">
              This is your own account. You will not be able to give it back yourself.
            </p>
          )}
        </>
      ) : (
        "Admins can edit and delete events, delete members, reset PINs and push everything to Google Sheets."
      ),
      confirmLabel: removing ? "Remove admin access" : "Grant admin access",
      tone: removing ? "destructive" : "default",
    })
    if (!confirmed) return

    setActionLoading(true)
    const ok = await patchMember(member.id, { action: "toggleAdmin", value: !member.is_admin }).catch(() => false)
    if (!ok) {
      toast.error("Couldn't update admin status", { action: { label: "Retry", onClick: () => toggleAdmin(member) } })
      setActionLoading(false)
      return
    }
    toast.success(member.is_admin ? "Admin access removed" : "Admin access granted")
    await loadMembers()
    if (selectedMember?.id === member.id) {
      setSelectedMember({ ...member, is_admin: !member.is_admin })
    }
    setActionLoading(false)
  }

  async function toggleCore(member: Member) {
    const removing = member.is_youth_ya_core
    const confirmed = await confirm({
      title: removing
        ? `Remove core access from ${member.first_name} ${member.last_name}?`
        : `Give ${member.first_name} ${member.last_name} core access?`,
      body: removing
        ? "They will no longer be able to sign in to the admin console at all, including the day-of check-in screen."
        : "Core leaders can sign in to the console: the check-in screen, the attendance list, registrant details and the exports.",
      confirmLabel: removing ? "Remove core access" : "Grant core access",
      tone: removing ? "destructive" : "default",
    })
    if (!confirmed) return

    setActionLoading(true)
    const ok = await patchMember(member.id, { action: "toggleCore", value: !member.is_youth_ya_core }).catch(() => false)
    if (!ok) {
      toast.error("Couldn't update core status", { action: { label: "Retry", onClick: () => toggleCore(member) } })
      setActionLoading(false)
      return
    }
    toast.success(member.is_youth_ya_core ? "Core access removed" : "Core access granted")
    await loadMembers()
    if (selectedMember?.id === member.id) {
      setSelectedMember({ ...member, is_youth_ya_core: !member.is_youth_ya_core })
    }
    setActionLoading(false)
  }

  async function resetPin(targetId: string, name: string) {
    const confirmed = await confirm({
      title: `Reset ${name}'s PIN to 1234?`,
      body: "Their current PIN stops working immediately, and nobody is notified — you have to tell them yourself.",
      confirmLabel: "Reset PIN",
      tone: "destructive",
    })
    if (!confirmed) return

    setActionLoading(true)
    const ok = await patchMember(targetId, { action: "resetPin" }).catch(() => false)
    if (!ok) {
      toast.error("Couldn't reset PIN")
    } else {
      toast.success("PIN reset to 1234", {
        description: "Ask the member to change it on their next sign-in.",
      })
    }
    setActionLoading(false)
  }

  async function setMemberGroup(targetId: string, group: string | null, name: string) {
    const confirmed = await confirm({
      title: group ? `Move ${name} to ${group}?` : `Clear ${name}'s group?`,
      body: "This changes their roster record. You can set it back at any time.",
      confirmLabel: group ? `Move to ${group}` : "Clear group",
      tone: "default",
    })
    if (!confirmed) return

    setActionLoading(true)
    const ok = await patchMember(targetId, { action: "setGroup", group }).catch(() => false)
    if (!ok) {
      toast.error("Couldn't update group")
      setActionLoading(false)
      return
    }
    toast.success(group ? `Set to ${group}` : "Group cleared")
    await loadMembers()
    if (selectedMember?.id === targetId) {
      setSelectedMember({ ...selectedMember, member_group: group })
    }
    setActionLoading(false)
  }

  async function handleDeleteMember(member: Member) {
    const name = `${member.first_name} ${member.last_name}`.trim()
    const confirmed = await confirm({
      title: `Permanently delete ${name}?`,
      body: (
        <>
          <p>
            This deletes their member record and{" "}
            <strong className="text-foreground">every event they have ever registered for or
            attended</strong>
            {attendanceHistory.length > 0 && ` — ${attendanceHistory.length} on file`}, along with
            their photos.
          </p>
          <p className="mt-2">
            It cannot be undone, and nothing in the console can bring it back.
          </p>
        </>
      ),
      confirmLabel: "Delete permanently",
      cancelLabel: "Keep member",
      tone: "destructive",
    })
    if (!confirmed) return

    setActionLoading(true)
    // Attendance cascades via the FK; the photo is removed server-side.
    try {
      const res = await fetch(`/api/admin/members/${member.id}`, { method: "DELETE" })
      if (!res.ok) {
        // Deliberately NO Retry action: a retry from a toast is a single tap
        // that re-fires a permanent delete without passing the dialog again.
        toast.error("Couldn't delete member. Try again from their profile.")
        setActionLoading(false)
        return
      }
      toast.success(`${name} deleted`)
      setSelectedMember(null)
      await loadMembers()
    } catch {
      toast.error("Couldn't delete member. Try again from their profile.")
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
    return <ListSkeleton rows={6} />
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
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4 mr-1" />
          Back to Members
        </Button>

        <div className="glass rounded-xl p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 ring-2 ring-foreground">
              {m.photo_url ? <AvatarImage src={m.photo_url} alt={m.first_name} /> : null}
              <AvatarFallback className="text-lg font-semibold bg-secondary text-accent">
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
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-accent ring-1 ring-foreground font-medium">
                    Admin
                  </span>
                )}
                {m.is_youth_ya_core && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground ring-1 ring-border font-medium">
                    Core
                  </span>
                )}
                {m.is_guest && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-accent ring-1 ring-border font-medium">
                    Guest
                  </span>
                )}
                {m.member_group && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-accent ring-1 ring-border font-medium">
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
            <p className="text-xs font-semibold text-accent/80 uppercase tracking-wider mb-2">
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
            <p className="text-xs font-semibold text-accent/80 uppercase tracking-wider mb-2">
              Emergency Contact
            </p>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <InfoRow label="Contact Person" value={m.emergency_contact_name} />
              <InfoRow label="Contact Number" value={m.emergency_contact_number} />
            </div>
          </div>

          {/* Discipleship & Ministry */}
          <div>
            <p className="text-xs font-semibold text-accent/80 uppercase tracking-wider mb-2">
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
            <p className="text-xs font-semibold text-accent/80 uppercase tracking-wider mb-2">
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
          <div className="pt-2 border-t border-border/30 space-y-3">
            <div>
              <p className="text-xs font-semibold text-accent/80 uppercase tracking-wider mb-2">
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
                    onClick={() =>
                      setMemberGroup(
                        m.id,
                        m.member_group === group ? null : group,
                        `${m.first_name} ${m.last_name}`.trim(),
                      )
                    }
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
                  onClick={() => resetPin(m.id, `${m.first_name} ${m.last_name}`.trim())}
                  disabled={actionLoading}
                >
                  <KeyRound className="size-4 mr-1.5" />
                  Reset PIN
                </Button>
              </div>
            )}

            {/* Data management — superadmin only */}
            {isSuperadmin && (
              <div className="flex gap-3 flex-wrap pt-2 border-t border-border/30">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportMemberData(m)}
                >
                  <Download className="size-4 mr-1.5" />
                  Export Data
                </Button>

                {/* One button, one dialog. The old two-step put "Confirm
                    Delete" where "Delete Member" had just been, so two quick
                    taps in the same spot destroyed the record. */}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => handleDeleteMember(m)}
                  disabled={actionLoading}
                >
                  <Trash2 className="size-4 mr-1.5" />
                  Delete Member
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Attendance history */}
        <div className="glass rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-accent/80 uppercase tracking-wider">
            Attendance History ({attendanceHistory.length})
          </h3>

          {attendanceHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attendance records.</p>
          ) : (
            <div className="space-y-2">
              {attendanceHistory.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50 border border-border/30"
                >
                  <span className="text-sm text-foreground/80 flex items-center gap-2">
                    <Calendar className="size-3 text-muted-foreground" />
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

        {/* The detail view is an early return, so the dialog has to be
            rendered here too — every action that asks for confirmation lives
            on this branch. */}
        {confirmDialog}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold gradient-text">Members</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {members.length} total members
          </p>
        </div>
        {isSuperadmin && (
          <Button
            variant="gradient"
            size="sm"
            onClick={() => setInviteOpen(true)}
            className="min-h-[44px]"
          >
            <UserPlus className="size-4 mr-2" />
            Invite Member
          </Button>
        )}
      </div>

      <InviteMemberDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={loadMembers}
      />

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
                  <AvatarFallback className="text-xs bg-secondary text-accent">
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
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-accent ring-1 ring-foreground">
                      Admin
                    </span>
                  )}
                  {m.is_youth_ya_core && !m.is_admin && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground ring-1 ring-border">
                      Core
                    </span>
                  )}
                  {m.is_guest && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-accent ring-1 ring-border">
                      Guest
                    </span>
                  )}
                  {m.member_group && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-accent ring-1 ring-border">
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
        mobileCard={(item) => {
          const m = item as unknown as Member
          const initials = `${m.first_name?.[0] || ""}${m.last_name?.[0] || ""}`.toUpperCase()
          return (
            <div className="glass rounded-xl p-3 flex items-center gap-3 active:scale-[0.99] transition-transform">
              <Avatar className="h-12 w-12 shrink-0">
                {m.photo_url ? <AvatarImage src={m.photo_url} alt={m.first_name} /> : null}
                <AvatarFallback className="bg-secondary text-accent font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="font-medium text-foreground truncate">
                    {m.first_name} {m.last_name}
                  </p>
                  {m.is_admin && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-accent ring-1 ring-foreground shrink-0">
                      Admin
                    </span>
                  )}
                  {m.is_youth_ya_core && !m.is_admin && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground ring-1 ring-border shrink-0">
                      Core
                    </span>
                  )}
                  {m.is_guest && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-accent ring-1 ring-border shrink-0">
                      Guest
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                {m.contact_number && (
                  <p className="text-xs text-muted-foreground">{m.contact_number}</p>
                )}
              </div>
              <ChevronRight className="size-4 text-muted-foreground shrink-0" />
            </div>
          )
        }}
      />

      {confirmDialog}
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
          ? "bg-secondary text-accent ring-1 ring-foreground"
          : "bg-card text-muted-foreground ring-1 ring-border/40"
      }`}
    >
      {completed ? "\u2713" : "\u2717"} {label}
    </span>
  )
}
