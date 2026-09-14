import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminHeader } from "@/components/admin/admin-header";

/** El panel usa sesión/cookies: no prerenderizar en el build de Vercel. */
export const dynamic = "force-dynamic";

/**
 * El layout no vuelve a validar sesión: el middleware ya protege /admin.
 * El logo se resuelve en el cliente (cache) para no arrastrar data URLs enormes
 * en cada navegación del panel.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="admin-shell flex min-h-screen flex-col lg:flex-row">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader />
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8 fade-in">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
