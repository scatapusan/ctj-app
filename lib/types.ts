export interface Event {
  id: string
  name: string
  description: string | null
  event_date: string
  is_active: boolean
  created_at: string
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
  created_at: string
  updated_at: string
}

export interface Attendance {
  id: string
  member_id: string
  event_id: string
  checked_in_at: string
}
