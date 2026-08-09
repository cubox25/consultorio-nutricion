"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  FileHeart,
  Ruler,
  UtensilsCrossed,
  FolderOpen,
  Building2,
  Settings,
  DatabaseBackup,
  LogOut,
  Menu,
  X,
  Leaf,
  BarChart3,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";

const PRIMARY_NAV: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
}[] = [
  { href: "/admin", label: "Inicio", icon: LayoutDashboard, exact: true },
  { href: "/admin/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/admin/pacientes", label: "Pacientes", icon: Users },
  { href: "/admin/historias", label: "Historias clínicas", icon: FileHeart },
  { href: "/admin/antropometria", label: "Antropometría", icon: Ruler },
  { href: "/admin/planes", label: "Planes alimentarios", icon: UtensilsCrossed },
  { href: "/admin/archivos", label: "Archivos", icon: FolderOpen },
  { href: "/admin/consultorios", label: "Consultorios", icon: Building2 },
  { href: "/admin#estadisticas", label: "Estadísticas", icon: BarChart3 },
];

const SECONDARY_NAV = [
  { href: "/admin/configuracion", label: "Configuración", icon: Settings },
  { href: "/admin/backups", label: "Backups", icon: DatabaseBackup },
];

function NavItem({
  href,
  label,
  icon: Icon,
  exact,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const pathOnly = href.split("#")[0];
  const isHashLink = href.includes("#");
  const active = exact
    ? pathname === pathOnly && !isHashLink
    : !isHashLink &&
      (pathname === pathOnly || pathname.startsWith(`${pathOnly}/`));

  return (
    <Link
      href={href}
      prefetch={false}
      onClick={onNavigate}
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-[1rem] px-3 py-2.5 text-[0.8125rem] font-medium transition-all duration-200",
        active
          ? "bg-white/90 text-[var(--foreground)] shadow-[var(--shadow-soft)] ring-1 ring-white/80"
          : "text-[var(--muted)] hover:bg-white/45 hover:text-[var(--foreground)]"
      )}
    >
      <Icon
        className={cn(
          "h-[1.1rem] w-[1.1rem] shrink-0 transition-colors",
          active
            ? "text-[var(--sage-deep)]"
            : "text-[var(--muted)] group-hover:text-[var(--sage-deep)]"
        )}
      />
      {label}
    </Link>
  );
}

function NavLinks({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <nav className={cn("flex flex-col gap-1", className)} aria-label="Admin">
      {PRIMARY_NAV.map((item) => (
        <NavItem key={`${item.href}-${item.label}`} {...item} onNavigate={onNavigate} />
      ))}
      <div className="my-3 mx-2 h-px bg-[var(--border-line)]" />
      {SECONDARY_NAV.map((item) => (
        <NavItem key={item.href} {...item} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

export function AdminSidebar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [siteName, setSiteName] = useState("Pamela Nutrición");

  useEffect(() => {
    const supabase = createClient();
    void supabase
      .from("system_settings")
      .select("site_name, professional_name")
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.professional_name) {
          const first = data.professional_name.split(/\s+/)[0];
          setSiteName(`${first} Nutrición`);
        } else if (data?.site_name) setSiteName(data.site_name);
      });
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      router.push("/login");
      router.refresh();
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo cerrar la sesión."));
      setLoggingOut(false);
    }
  };

  const brand = (
    <div className="flex items-center gap-3 px-1 py-1">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--sage-soft)] ring-1 ring-white/70">
        <Leaf className="h-5 w-5 text-[var(--sage-deep)]" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold tracking-tight text-[var(--foreground)]">
          {siteName}
        </p>
        <p className="truncate text-xs text-[var(--muted)]">Consultorio</p>
      </div>
    </div>
  );

  const footer = (
    <Button
      type="button"
      variant="ghost"
      className="w-full justify-start rounded-[1rem]"
      loading={loggingOut}
      onClick={handleLogout}
    >
      <LogOut className="h-4 w-4" />
      Cerrar sesión
    </Button>
  );

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/50 bg-white/50 px-4 py-3 backdrop-blur-xl lg:hidden">
        {brand}
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/70 bg-white/70"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[#25313b]/25"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
          />
          <aside className="glass-panel absolute inset-y-0 left-0 flex w-[min(100%,19rem)] flex-col fade-in">
            <div className="flex items-center justify-between border-b border-[var(--border-line)] p-4">
              {brand}
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-white/60"
                aria-label="Cerrar menú"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
            <div className="border-t border-[var(--border-line)] p-3">{footer}</div>
          </aside>
        </div>
      ) : null}

      <aside className="glass-panel sticky top-0 m-3 hidden h-[calc(100vh-1.5rem)] w-[15.5rem] shrink-0 flex-col rounded-[var(--radius-lg)] lg:flex">
        <div className="border-b border-[var(--border-line)] px-4 py-5">{brand}</div>
        <div className="flex-1 overflow-y-auto px-2.5 py-4">
          <NavLinks />
        </div>
        <div className="border-t border-[var(--border-line)] p-3">{footer}</div>
      </aside>
    </>
  );
}
