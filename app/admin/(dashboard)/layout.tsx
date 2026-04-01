import { Sidebar } from "@/components/admin/sidebar"
import { RoleProvider } from "@/components/admin/role-provider"

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <RoleProvider>
      <div className="min-h-screen bg-background">
        <Sidebar />
        <main className="lg:ml-64 min-h-screen">
          <div className="p-6 pt-16 lg:pt-6 max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </RoleProvider>
  )
}
