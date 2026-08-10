"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, CalendarDays } from "lucide-react";
import { useState } from "react";
import { cn, whatsappLink } from "@/lib/utils";
import type { SystemSettings } from "@/types";
import { BrandLogo } from "@/components/brand/logo";

const WHATSAPP_DEFAULT = "3816617606";

const links = [
  { href: "/#inicio", label: "Inicio" },
  { href: "/#sobre-mi", label: "Sobre mí" },
  { href: "/#servicios", label: "Servicios" },
  { href: "/#consultorios", label: "Consultorios" },
  { href: "/#contacto", label: "Contacto" },
];

export function PublicHeader({ settings }: { settings: SystemSettings | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  void settings;

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="min-w-0 shrink-0" aria-label="Pamela Guerrero">
          <BrandLogo className="h-9 w-auto sm:h-10" />
        </Link>

        <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Principal">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-3.5 py-2 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--pink-mist)] hover:text-[var(--pink)]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/turnos"
            className="hidden h-10 items-center gap-2 rounded-full bg-[var(--green)] px-4 text-sm font-medium text-white shadow-[var(--shadow-soft)] transition hover:bg-[var(--green-deep)] sm:inline-flex"
          >
            <CalendarDays className="h-4 w-4" />
            Solicitar turno
          </Link>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white lg:hidden"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-[var(--border)] bg-white px-4 py-3 lg:hidden fade-in">
          <nav className="flex flex-col gap-1" aria-label="Móvil">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-2xl px-3 py-3 text-sm font-medium",
                  pathname === "/"
                    ? "text-[var(--pink)]"
                    : "text-[var(--foreground)]"
                )}
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/turnos"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-full bg-[var(--green)] px-3 py-3 text-center text-sm font-medium text-white"
            >
              Solicitar turno
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

export function PublicFooter({ settings }: { settings: SystemSettings | null }) {
  const phone = settings?.whatsapp || settings?.phone || WHATSAPP_DEFAULT;
  const wa = whatsappLink(phone);
  return (
    <footer className="border-t border-[var(--border)] bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-3">
        <div>
          <BrandLogo className="h-10 w-auto" />
          <p className="mt-2 text-xs font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
            Licenciada en Nutrición
          </p>
          <p className="mt-4 text-sm leading-relaxed text-[var(--muted)]">
            {settings?.footer_text ||
              "Acompañamiento nutricional profesional, cálido y personalizado."}
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">Contacto</p>
          <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            <li>WhatsApp: {phone}</li>
            {settings?.email ? <li>Email: {settings.email}</li> : null}
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">Accesos</p>
          <div className="mt-3 flex flex-col gap-2 text-sm text-[var(--muted)]">
            <Link href="/turnos" className="hover:text-[var(--pink)]">
              Solicitar turno
            </Link>
            {wa ? (
              <a href={wa} target="_blank" rel="noreferrer" className="hover:text-[var(--pink)]">
                WhatsApp
              </a>
            ) : null}
            <Link href="/login" className="hover:text-[var(--pink)]">
              Acceso profesional
            </Link>
          </div>
        </div>
      </div>
      <div className="border-t border-[var(--border)] px-4 py-4 text-center text-xs text-[var(--muted)]">
        © {new Date().getFullYear()} Pamela Guerrero · Consultorio de Nutrición
      </div>
    </footer>
  );
}

export function WhatsAppFab({ phone }: { phone?: string | null }) {
  const href = whatsappLink(
    phone || WHATSAPP_DEFAULT,
    "Hola Pamela, quisiera consultar por un turno."
  );
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-3.5 text-sm font-medium text-white shadow-lg transition hover:scale-[1.03] sm:px-5"
      aria-label="Consultar por WhatsApp"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
        <path d="M20.5 3.5A11 11 0 0 0 2.1 17.2L1 23l5.9-1.1A11 11 0 0 0 20.5 3.5zm-8.6 17a9.1 9.1 0 0 1-4.6-1.3l-.3-.2-3.4.6.6-3.3-.2-.3a9.1 9.1 0 1 1 7.9 4.5zm5-6.8c-.3-.1-1.6-.8-1.9-.9s-.4-.1-.6.1-.7.9-.8 1-.3.2-.6.1a7.4 7.4 0 0 1-2.2-1.4 8.2 8.2 0 0 1-1.5-1.9c-.2-.3 0-.4.1-.6l.4-.5c.1-.1.2-.3.3-.4s0-.3 0-.4-.6-1.5-.8-2-.2-.4-.5-.4h-.4c-.1 0-.4.1-.6.3s-.8.8-.8 1.9.8 2.2.9 2.3a10.5 10.5 0 0 0 4 3.4c.5.2 1 .4 1.4.5.6.2 1.1.2 1.5.1.5-.1 1.6-.7 1.8-1.3s.2-1.2.1-1.3-.2-.2-.5-.3z" />
      </svg>
      <span className="hidden sm:inline">Consultar por WhatsApp</span>
    </a>
  );
}

export { WHATSAPP_DEFAULT };
