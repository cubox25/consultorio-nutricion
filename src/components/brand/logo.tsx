"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getCached, setCached } from "@/lib/query-cache";
import { getSystemSettings } from "@/services/settings";
import type { SystemSettings } from "@/types";
import { cn } from "@/lib/utils";

export const DEFAULT_LOGO_PATH = "/brand/pamela-guerrero-logo.png";
export const LOGO_UPDATED_EVENT = "site-logo-updated";

const LOGO_SIZE_CLASS =
  "h-[5rem] w-auto max-w-none object-contain object-left sm:h-[5.5rem]";

export function dispatchLogoUpdated(url: string | null) {
  window.dispatchEvent(
    new CustomEvent(LOGO_UPDATED_EVENT, { detail: { url } })
  );
}

function resolveLogoSrc(src?: string | null, dynamic?: string | null) {
  return src ?? dynamic ?? DEFAULT_LOGO_PATH;
}

function isRemoteLogo(src: string) {
  return src.startsWith("data:") || src.startsWith("http");
}

export function useSiteLogo() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);

    const cached = getCached<SystemSettings>("settings");
    if (cached) setLogoUrl(cached.logo_url ?? null);

    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{ url: string | null }>).detail;
      setLogoUrl(detail?.url ?? null);
    };
    window.addEventListener(LOGO_UPDATED_EVENT, onUpdate);

    void (async () => {
      if (cached?.logo_url !== undefined) return;
      try {
        const supabase = createClient();
        const data = await getSystemSettings(supabase);
        if (data) {
          setLogoUrl(data.logo_url ?? null);
          setCached("settings", data);
        }
      } catch {
        /* sin sesión o error: logo predeterminado */
      }
    })();

    return () => window.removeEventListener(LOGO_UPDATED_EVENT, onUpdate);
  }, []);

  return hydrated ? logoUrl : null;
}

/** Logo del consultorio (configurable desde Administración → Configuración). */
export function BrandLogo({
  className,
  src,
  markOnly = false,
}: {
  className?: string;
  /** URL custom o data URL desde configuración. */
  src?: string | null;
  markOnly?: boolean;
}) {
  const dynamicLogo = useSiteLogo();
  const resolved = resolveLogoSrc(src, dynamicLogo);

  const green = "#879E46";
  const pink = "#E57B87";

  if (markOnly) {
    return (
      <svg
        viewBox="0 0 48 48"
        className={cn("h-10 w-10", className)}
        aria-hidden
      >
        <path
          d="M14 28c1.2-10 7-16.5 15-19 0.4 8-2.2 14.5-9 18.5-2.2 1.3-4 1.8-6 0.5z"
          fill={green}
        />
        <path
          d="M28 10c6 2.5 11 9 11 16.5 0 2.2-1.2 3.5-3 3.5-5.5-4-9-11-8-20z"
          fill={green}
          opacity="0.9"
        />
        <path
          d="M24 30v12"
          stroke={pink}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  const alt = "Pamela Guerrero · Licenciada en Nutrición";
  const classes = cn(LOGO_SIZE_CLASS, className);

  if (isRemoteLogo(resolved)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={resolved} alt={alt} className={classes} />
    );
  }

  return (
    <Image
      src={resolved}
      alt={alt}
      width={972}
      height={219}
      className={classes}
      priority
      unoptimized
    />
  );
}

export function BrandMark({
  className,
  inverted = false,
}: {
  className?: string;
  inverted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-11 w-11 items-center justify-center rounded-2xl",
        inverted ? "bg-white/20" : "bg-[var(--sage-soft)]",
        className
      )}
    >
      <BrandLogo markOnly className="h-7 w-7" />
    </div>
  );
}

export function BrandAvatar({
  className,
  size = 44,
}: {
  className?: string;
  size?: number;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/pamela-avatar.svg"
      alt="Pamela Guerrero"
      width={size}
      height={size}
      className={cn("rounded-full object-cover ring-2 ring-white/70", className)}
    />
  );
}
