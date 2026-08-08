/**
 * Which flow an event uses. 'checkin' = the ordinary one-step /attend flow.
 * 'retreat' = pre-registration via /retreat, attendance marked by staff.
 */
export type RegistrationMode = "checkin" | "retreat"

export interface Event {
  id: string
  name: string
  description: string | null
  event_date: string
  is_active: boolean
  created_at: string
  /** Optional so code still compiles against pre-migration reads. */
  registration_mode?: RegistrationMode
}

export interface Member {
  id: string
  email: string
  first_name: string
  middle_name: string | null
  last_name: string
  birthdate: string | null
  contact_number: string | null
  facebook_link: string | null
  address: string | null
  photo_url: string | null
  discipler_name: string | null
  disciples: string | null
  prospect_disciples: string | null
  lifeline_leader: string | null
  lifeline_co_leaders: string | null
  lifeline_members: string | null
  ministry_involvements: string | null
  is_youth_ya_core: boolean
  completed_reach: boolean
  completed_fresh_start: boolean
  completed_freedom_day: boolean
  completed_grand_day: boolean
  is_admin: boolean
  // Church-compatible fields
  nickname: string | null
  gender: string | null
  marital_status: string | null
  spouse_name: string | null
  children_names: string | null
  father_name: string | null
  mother_name: string | null
  emergency_contact_name: string | null
  emergency_contact_number: string | null
  occupation: string | null
  date_joined_ctjcc: string | null
  spiritual_birthday: string | null
  baptized_in_water: boolean
  member_group: string | null
  is_guest: boolean
  privacy_consent_at: string | null
  created_at: string
  updated_at: string
}

export type AttendanceStatus = "registered" | "attended"

export type RetreatCategory = "youth" | "ya"

export interface Attendance {
  id: string
  member_id: string
  event_id: string
  checked_in_at: string
  /** 'registered' = pre-registered, not yet at the event. Default 'attended'. */
  status: AttendanceStatus
  attended_at: string | null
  /** Event-scoped retreat registration answers (null outside retreat flows). */
  category: RetreatCategory | null
  baby_photo_url: string | null
  guardian_name: string | null
  guardian_contact: string | null
}

/**
 * Minimal member identity returned by /api/attend/lookup. Used by the pre-edit
 * check-in screens; the full Member (with PII) is only fetched after the PIN via
 * /api/attend/profile.
 */
export interface MemberSummary {
  id: string
  first_name: string
  last_name: string
  photo_url: string | null
  is_guest: boolean
}
