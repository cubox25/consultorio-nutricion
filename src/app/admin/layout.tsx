import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminHeader } from "@/components/admin/admin-header";
import { createClient } from "@/lib/supabase/server";

/**
 * El layout no vuelve a validar sesión: el middleware ya protege /admin.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let logoUrl: string | null = null;
  try {
    const supabase = await createClient();
    // Solo logo_url: evita traer services_json / textos largos en cada navegación admin
    const { data } = await supabase
      .from("system_settings")
      .select("logo_url")
      .limit(1)
      .maybeSingle();
    logoUrl = data?.logo_url ?? null;
  } catch (error) {
    console.error("[admin/layout] logo_url", error);
    logoUrl = null;
  }

  return (
    <div className="admin-shell flex min-h-screen flex-col lg:flex-row">
      <AdminSidebar logoUrl={logoUrl} />
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
