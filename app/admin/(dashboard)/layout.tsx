import { Sidebar } from "@/components/admin/sidebar"
import { Breadcrumbs } from "@/components/admin/breadcrumbs"
import { RoleProvider } from "@/components/admin/role-provider"
import { requireAdminPage } from "@/lib/admin-auth"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Auth guard for all /admin/(dashboard)/* pages. Runs in the Node.js runtime
  // (server component), replacing the removed Edge middleware that crashed on
  // Node crypto. Per-action authorization is still enforced in the API routes.
  requireAdminPage()

  return (
    <RoleProvider>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <main className="lg:ml-64 min-h-screen">
          <div className="p-6 pt-20 lg:pt-6 max-w-7xl mx-auto">
            <Breadcrumbs />
            {children}
          </div>
        </main>
      </div>
    </RoleProvider>
  )
}
