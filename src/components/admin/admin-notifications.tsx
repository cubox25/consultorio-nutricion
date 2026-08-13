"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bell, CalendarClock, UserPlus, WifiOff, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  refreshAdminNotifications,
  subscribeAdminNotifications,
} from "@/lib/admin-notifications-store";
import type { AdminNotificationItem } from "@/components/admin/admin-notifications-types";

export type { AdminNotificationItem };

function iconFor(kind: AdminNotificationItem["icon"]) {
  switch (kind) {
    case "today":
      return CalendarClock;
    case "patient":
      return UserPlus;
    case "whatsapp":
      return WifiOff;
    default:
      return Bell;
  }
}

export function useAdminNotifications() {
  const [items, setItems] = useState<AdminNotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState(0);

  useEffect(() => {
    return subscribeAdminNotifications((s) => {
      setItems(s.items);
      setLoading(s.loading);
      setCount(s.count);
    });
  }, []);

  return {
    items,
    loading,
    count,
    refresh: refreshAdminNotifications,
  };
}

export function AdminNotificationsBell() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { items, loading, refresh, count } = useAdminNotifications();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const panel = open ? (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[80] bg-[#1f2937]/35 backdrop-blur-[1px]"
        aria-label="Cerrar notificaciones"
        onClick={() => setOpen(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Notificaciones"
        className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[90] flex max-h-[min(85dvh,36rem)] flex-col overflow-hidden rounded-[1.5rem] border border-[var(--border)] bg-white shadow-[var(--shadow-lift)] fade-in sm:inset-x-auto sm:right-4 sm:top-20 sm:w-[22rem] lg:right-8"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <p className="text-sm font-semibold text-[var(--foreground)]">
            Notificaciones
          </p>
          <div className="flex items-center gap-2">
            {count > 0 ? (
              <span className="rounded-full bg-[var(--pink-mist)] px-2 py-0.5 text-[11px] font-semibold text-[var(--pink)]">
                {count}
              </span>
            ) : null}
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--pink-mist)] hover:text-[var(--pink)]"
              aria-label="Cerrar"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loading && items.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-[var(--muted)]">
              Cargando…
            </p>
          ) : items.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-[var(--muted)]">
              No hay novedades por ahora.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {items.map((item) => {
                const Icon = iconFor(item.icon);
                return (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      prefetch={false}
                      onClick={() => setOpen(false)}
                      className="flex gap-3 px-4 py-3 transition hover:bg-[var(--pink-mist)]/50"
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                          item.icon === "pending"
                            ? "bg-[var(--yellow-soft)] text-[#9a6f10]"
                            : item.icon === "whatsapp"
                              ? "bg-[var(--pink-mist)] text-[var(--pink)]"
                              : "bg-[var(--sage-soft)] text-[var(--green)]"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-[var(--foreground)]">
                          {item.title}
                        </span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-[var(--muted)]">
                          {item.body}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-[var(--border)] px-3 py-2">
          <Link
            href="/admin/agenda"
            prefetch={false}
            onClick={() => setOpen(false)}
            className="block rounded-xl px-2 py-2 text-center text-xs font-semibold text-[var(--pink)] hover:bg-[var(--pink-mist)]"
          >
            Ir a la agenda
          </Link>
        </div>
      </div>
    </>
  ) : null;

  return (
    <div className="relative">
      <button
        type="button"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--muted)] transition hover:bg-[var(--pink-mist)] hover:text-[var(--pink)]"
        aria-label="Notificaciones"
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void refresh();
        }}
      >
        <Bell className="h-4 w-4" />
        {count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--pink)] px-1 text-[10px] font-bold text-white">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>

      {mounted && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
