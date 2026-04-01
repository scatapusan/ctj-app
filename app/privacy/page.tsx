import Link from "next/link"
import { ArrowLeft, Shield } from "lucide-react"

export const metadata = {
  title: "Privacy Policy — CTJCC Marikina",
}

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-80 h-80 rounded-full bg-orange-500/[0.07] blur-[100px]" />
        <div className="absolute top-1/3 -right-32 w-64 h-64 rounded-full bg-blue-500/[0.05] blur-[80px]" />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="space-y-4">
          <Link
            href="/"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-orange-400 transition-colors"
          >
            <ArrowLeft className="size-4 mr-1" />
            Back to Home
          </Link>

          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-orange-500/20 to-blue-500/20 p-3 ring-1 ring-white/[0.1]">
              <Shield className="size-6 text-orange-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold gradient-text">Privacy Policy</h1>
              <p className="text-sm text-muted-foreground">
                Come To Jesus Community Church of Marikina (CTJCC Marikina)
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Last updated: April 2, 2026</p>
        </div>

        {/* Content */}
        <div className="glass rounded-2xl p-6 sm:p-8 space-y-6 text-sm text-foreground/80 leading-relaxed">
          <Section title="1. Who We Are">
            <p>
              This app is operated by <strong className="text-foreground">Come To Jesus Community Church of Marikina</strong> (CTJCC Marikina),
              a local church community. We use this app to manage attendance tracking,
              member care, and discipleship records for our Youth, Young Adults, and church community.
            </p>
          </Section>

          <Section title="2. What Data We Collect">
            <p>When you register or check in, we may collect:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li><strong className="text-foreground">Personal info:</strong> name, nickname, email, birthdate, gender, contact number, address, occupation</li>
              <li><strong className="text-foreground">Family info:</strong> parents&apos; names (for youth/emergency purposes)</li>
              <li><strong className="text-foreground">Emergency contact:</strong> contact person name and number</li>
              <li><strong className="text-foreground">Church info:</strong> discipleship records, ministry involvements, lifeline group, seminar completions, baptism status</li>
              <li><strong className="text-foreground">Photo:</strong> optional profile photo</li>
              <li><strong className="text-foreground">Attendance records:</strong> event name and check-in timestamp</li>
            </ul>
            <p className="mt-2">
              For <strong className="text-foreground">guests</strong>, we only collect: first name, last name, and contact number (optional).
            </p>
          </Section>

          <Section title="3. Why We Collect It">
            <p>We use your data for:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li>Tracking attendance at church events and services</li>
              <li>Member care, follow-up, and discipleship</li>
              <li>Emergency contact in case of incidents during events</li>
              <li>Church record-keeping and reporting</li>
              <li>Communicating about church activities</li>
            </ul>
            <p className="mt-2">
              We collect your data based on your <strong className="text-foreground">consent</strong>,
              which you provide when you register or check in through this app.
            </p>
          </Section>

          <Section title="4. Who Has Access">
            <p>Your data is accessible to:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li><strong className="text-foreground">Church administrators</strong> (superadmin) — full access for member care and church management</li>
              <li><strong className="text-foreground">Core leaders</strong> — can view member details, manage events, and assign groups</li>
            </ul>
            <p className="mt-2">
              Your data is stored in <strong className="text-foreground">Supabase</strong> (our database provider)
              and may be synced to <strong className="text-foreground">Google Sheets</strong> for church record-keeping by authorized administrators.
              These are trusted cloud services with their own security and privacy practices.
            </p>
          </Section>

          <Section title="5. Data Storage & Security">
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>All data is transmitted over HTTPS (encrypted in transit)</li>
              <li>Data is stored in Supabase&apos;s managed PostgreSQL database with row-level security</li>
              <li>Profile photos are stored in secure cloud storage</li>
              <li>Your 4-digit security PIN protects your profile from unauthorized edits</li>
              <li>Admin access is protected by email/password authentication</li>
            </ul>
          </Section>

          <Section title="6. Data Retention">
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li><strong className="text-foreground">Members:</strong> Your data is kept for the duration of your involvement with the church. You may request deletion at any time.</li>
              <li><strong className="text-foreground">Guests:</strong> Guest records are kept for church record-keeping purposes. You may request deletion by contacting the church admin.</li>
              <li><strong className="text-foreground">Attendance records:</strong> Kept as part of church historical records.</li>
            </ul>
          </Section>

          <Section title="7. Your Rights">
            <p>
              Under the <strong className="text-foreground">Data Privacy Act of 2012</strong> (Republic Act No. 10173)
              and its Implementing Rules and Regulations, you have the right to:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
              <li><strong className="text-foreground">Access</strong> — request a copy of your personal data</li>
              <li><strong className="text-foreground">Correction</strong> — update or correct inaccurate information (via the app&apos;s Edit Profile feature)</li>
              <li><strong className="text-foreground">Erasure</strong> — request deletion of your personal data</li>
              <li><strong className="text-foreground">Object</strong> — object to the processing of your data</li>
            </ul>
            <p className="mt-2">
              To exercise any of these rights, contact the church admin through the details below.
            </p>
          </Section>

          <Section title="8. Cookies">
            <p>
              This app uses <strong className="text-foreground">functional cookies only</strong> for authentication (keeping you logged in).
              We do not use tracking cookies, analytics, or advertising cookies.
            </p>
          </Section>

          <Section title="9. Children&apos;s Privacy">
            <p>
              If you are under 18 years old, we encourage you to register with the knowledge and consent of your parent or guardian.
              Church leaders and parents/guardians may request access to or deletion of a minor&apos;s data.
            </p>
          </Section>

          <Section title="10. Contact Us">
            <p>
              For any privacy-related concerns or to exercise your data rights, contact:
            </p>
            <div className="mt-2 p-4 rounded-lg bg-white/[0.04] border border-white/[0.06]">
              <p className="font-medium text-foreground">CTJCC Marikina Church Admin</p>
              <p className="text-muted-foreground">Email: samcataps@gmail.com</p>
            </div>
          </Section>

          <Section title="11. Changes to This Policy">
            <p>
              We may update this privacy policy from time to time. Any changes will be reflected on this page
              with an updated &quot;Last updated&quot; date. Continued use of the app after changes constitutes acceptance
              of the updated policy.
            </p>
          </Section>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground/50">
          Come To Jesus Community Church of Marikina
        </p>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-base font-semibold text-orange-400/80">{title}</h2>
      {children}
    </div>
  )
}
