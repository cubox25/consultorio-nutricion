"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { getAdminProfileBasic } from "@/lib/admin-profile";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ProfileAvatarImage,
  useProfileAvatar,
} from "@/components/admin/profile-avatar";
import { AdminNotificationsBell } from "@/components/admin/admin-notifications";
import { LogoutWithBackup } from "@/components/admin/logout-with-backup";

const TITLE_MAP: { match: RegExp | string; title: string; exact?: boolean }[] = [
  { match: /^\/admin\/pacientes\/.+/, title: "Ficha del paciente" },
  { match: "/admin/pacientes", title: "Pacientes" },
  { match: "/admin/agenda", title: "Agenda" },
  { match: "/admin/historias", title: "Historias clínicas" },
  { match: "/admin/antropometria", title: "Antropometría" },
  { match: "/admin/consultorios", title: "Consultorios" },
  { match: "/admin/whatsapp", title: "WhatsApp" },
  { match: "/admin/configuracion", title: "Configuración" },
  { match: "/admin/backups", title: "Backups" },
  { match: "/admin", title: "Dashboard", exact: true },
];

function titleFromPath(pathname: string) {
  for (const item of TITLE_MAP) {
    if (typeof item.match === "string") {
      if (item.exact) {
        if (pathname === item.match) return item.title;
      } else if (
        pathname === item.match ||
        pathname.startsWith(`${item.match}/`)
      ) {
        return item.title;
      }
    } else if (item.match.test(pathname)) {
      return item.title;
    }
  }
  return "Panel";
}

function greetingForHour(hour: number) {
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

export function AdminHeader() {
  const pathname = usePathname();
  const title = useMemo(() => titleFromPath(pathname), [pathname]);
  const isHome = pathname === "/admin";
  const [name, setName] = useState("Pamela Guerrero");
  const [email, setEmail] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { avatarUrl } = useProfileAvatar();

  useEffect(() => {
    void (async () => {
      const profile = await getAdminProfileBasic();
      if (!profile) return;
      setEmail(profile.email);
      setName(profile.display_name);
    })();
  }, []);

  const firstName = name;
  const [hello, setHello] = useState("Hola");

  useEffect(() => {
    const hour = Number(
      new Intl.DateTimeFormat("es-AR", {
        hour: "numeric",
        hour12: false,
        timeZone: "America/Argentina/Buenos_Aires",
      }).format(new Date())
    );
    setHello(greetingForHour(Number.isFinite(hour) ? hour : 10));
  }, []);

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  if (isHome) return null;

  return (
    <LogoutWithBackup>
      {({ onRequestLogout, loggingOut }) => (
        <header className="sticky top-0 z-20 hidden lg:block">
          <div className="mx-3 mt-3 rounded-[1.5rem] border border-[var(--border)] bg-white/90 px-5 py-4 shadow-[var(--shadow-soft)] backdrop-blur lg:mx-4 lg:px-6">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
                  {hello}, {firstName}
                </p>
                <h1 className="mt-0.5 truncate text-lg font-bold tracking-tight text-[var(--foreground)]">
                  {title}
                </h1>
              </div>

              <div className="flex items-center gap-2">
                <AdminNotificationsBell />

                <div className="relative">
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-white py-1 pl-1 pr-3 transition hover:bg-[var(--pink-mist)]"
                    )}
                    aria-expanded={open}
                    aria-haspopup="menu"
                    onClick={() => setOpen((v) => !v)}
                  >
                    <span className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[var(--sage-soft)] text-xs font-semibold text-[var(--green)]">
                      {avatarUrl ? (
                        <ProfileAvatarImage
                          src={avatarUrl}
                          size={32}
                          className="ring-0"
                        />
                      ) : (
                        initials || <UserRound className="h-4 w-4" />
                      )}
                    </span>
                    <span className="hidden max-w-[10rem] truncate text-sm font-medium text-[var(--foreground)] xl:inline">
                      {name}
                    </span>
                    <ChevronDown className="h-4 w-4 text-[var(--muted)]" />
                  </button>

                  {open ? (
                    <>
                      <button
                        type="button"
                        className="fixed inset-0 z-10 cursor-default"
                        aria-label="Cerrar menú de usuario"
                        onClick={() => setOpen(false)}
                      />
                      <div
                        role="menu"
                        className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-[var(--border)] bg-white py-2 shadow-[var(--shadow-lift)] fade-in"
                      >
                        <div className="border-b border-[var(--border)] px-4 py-3">
                          <p className="truncate text-sm font-medium">{name}</p>
                          {email ? (
                            <p className="truncate text-xs text-[var(--muted)]">
                              {email}
                            </p>
                          ) : null}
                        </div>
                        <div className="p-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start"
                            loading={loggingOut}
                            onClick={() => {
                              setOpen(false);
                              onRequestLogout();
                            }}
                          >
                            <LogOut className="h-4 w-4" />
                            Cerrar sesión
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </header>
      )}
    </LogoutWithBackup>
  );
}
