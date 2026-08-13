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
  MessageCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand/logo";
import { ProfileAvatarEditor, ProfileAvatarImage, useProfileAvatar } from "@/components/admin/profile-avatar";
import { AdminNotificationsBell } from "@/components/admin/admin-notifications";

const PRIMARY_NAV: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
}[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/pacientes", label: "Pacientes", icon: Users },
  { href: "/admin/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/admin/antropometria", label: "Antropometría", icon: Ruler },
  { href: "/admin/historias", label: "Historias clínicas", icon: FileHeart },
  { href: "/admin/planes", label: "Planes alimentarios", icon: UtensilsCrossed },
  { href: "/admin/archivos", label: "Archivos", icon: FolderOpen },
  { href: "/admin/consultorios", label: "Consultorios", icon: Building2 },
];

const SECONDARY_NAV = [
  { href: "/admin/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/admin/configuracion", label: "Configuración", icon: Settings },
  { href: "/admin/backups", label: "Backups", icon: DatabaseBackup },
];

function NavItem({
  href,
  label,
  icon: Icon,
  exact,
  onNavigate,
  onPink,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  onNavigate?: () => void;
  onPink?: boolean;
}) {
  const pathname = usePathname();
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      prefetch={false}
      onClick={onNavigate}
      className={cn(
        "group inline-flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-[0.8125rem] font-medium transition-all duration-200",
        onPink
          ? active
            ? "bg-white/25 !text-white shadow-sm"
            : "!text-white hover:bg-white/15"
          : active
            ? "bg-[var(--pink-mist)] text-[var(--pink)] shadow-sm"
            : "text-[var(--muted)] hover:bg-[var(--sage-soft)] hover:text-[var(--green)]"
      )}
    >
      <Icon
        className={cn(
          "h-[1.1rem] w-[1.1rem] shrink-0 transition-colors",
          onPink
            ? "!text-white"
            : active
              ? "text-[var(--pink)]"
              : "text-[var(--muted)] group-hover:text-[var(--green)]"
        )}
      />
      {label}
    </Link>
  );
}

function NavLinks({
  onNavigate,
  onPink,
}: {
  onNavigate?: () => void;
  onPink?: boolean;
}) {
  return (
    <nav className="flex flex-col gap-1" aria-label="Admin">
      {PRIMARY_NAV.map((item) => (
        <NavItem
          key={item.href}
          {...item}
          onNavigate={onNavigate}
          onPink={onPink}
        />
      ))}
      <div
        className={cn(
          "my-3 mx-2 h-px",
          onPink ? "bg-white/25" : "bg-[var(--border)]"
        )}
      />
      {SECONDARY_NAV.map((item) => (
        <NavItem
          key={item.href}
          {...item}
          onNavigate={onNavigate}
          onPink={onPink}
        />
      ))}
    </nav>
  );
}

export function AdminSidebar({ logoUrl = null }: { logoUrl?: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [name, setName] = useState("Pamela Guerrero");
  const { avatarUrl } = useProfileAvatar();

  useEffect(() => {
    const supabase = createClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.full_name) setName(profile.full_name);
    })();
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

  const brandPink = (
    <Link
      href="/admin"
      prefetch={false}
      onClick={() => setOpen(false)}
      className="inline-flex rounded-2xl bg-white px-4 py-3 shadow-[0_6px_20px_rgba(31,41,55,0.12)] ring-1 ring-white/80 transition hover:opacity-95"
      aria-label="Ir al dashboard"
    >
      <BrandLogo src={logoUrl} className="h-[5.25rem] w-auto sm:h-[5.75rem]" />
    </Link>
  );

  const brandLight = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Link
        href="/admin"
        prefetch={false}
        className="flex min-w-0 items-center gap-3 px-1"
        aria-label="Ir al dashboard"
      >
        <ProfileAvatarImage src={avatarUrl} size={40} />
        <div className="min-w-0 rounded-2xl bg-white px-3 py-2 shadow-[var(--shadow-soft)] ring-1 ring-[var(--border)]">
          <BrandLogo src={logoUrl} className="h-[4.75rem] w-auto" />
        </div>
      </Link>
    </div>
  );

  const profileBlock = (
    <div className="rounded-2xl bg-black/10 p-3">
      <div className="flex items-center gap-3">
        <ProfileAvatarEditor compact />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            Nut. {name.split(/\s+/)[0] || "Pamela"}
          </p>
          <p className="truncate text-xs text-white/75">Administrador</p>
          <p className="mt-0.5 text-[10px] text-white/60">Tocá la foto para editar</p>
        </div>
      </div>
    </div>
  );

  const footerPink = (
    <div className="space-y-3">
      {profileBlock}
      <Button
        type="button"
        variant="ghost"
        className="w-full justify-start rounded-2xl !text-white hover:bg-white/15 hover:!text-white"
        loading={loggingOut}
        onClick={handleLogout}
      >
        <LogOut className="h-4 w-4" />
        Cerrar sesión
      </Button>
    </div>
  );

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-[var(--border)] bg-white/95 px-3 py-3 backdrop-blur lg:hidden">
        {brandLight}
        <div className="flex shrink-0 items-center gap-2">
          <AdminNotificationsBell />
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[#1f2937]/25"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(100%,19rem)] flex-col bg-[var(--pink)] text-white shadow-[var(--shadow-lift)] fade-in">
            <div className="flex items-center justify-between border-b border-white/20 p-4">
              {brandPink}
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white"
                aria-label="Cerrar menú"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <NavLinks onNavigate={() => setOpen(false)} onPink />
            </div>
            <div className="border-t border-white/20 p-3">{footerPink}</div>
          </aside>
        </div>
      ) : null}

      <aside className="relative m-3 hidden h-[calc(100vh-1.5rem)] w-[16.5rem] shrink-0 flex-col overflow-hidden rounded-[1.75rem] bg-[var(--pink)] text-white shadow-[var(--shadow-soft)] lg:sticky lg:top-3 lg:flex">
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-[radial-gradient(ellipse_at_bottom,_rgba(255,255,255,0.22),_transparent_70%)]"
          aria-hidden
        />
        <div className="relative border-b border-white/20 px-4 py-5">
          {brandPink}
        </div>
        <div className="relative flex-1 overflow-y-auto px-2.5 py-4">
          <NavLinks onPink />
        </div>
        <div className="relative border-t border-white/20 p-3">{footerPink}</div>
      </aside>
    </>
  );
}
