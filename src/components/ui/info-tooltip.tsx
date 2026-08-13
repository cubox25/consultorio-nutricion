"use client";

import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function InfoTooltip({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex align-middle", className)}>
      <button
        type="button"
        className="peer inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--pink-mist)] text-[var(--pink)] transition hover:bg-[var(--pink)] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pink)]"
        aria-label={text}
      >
        <Info className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-left text-xs font-normal leading-relaxed text-[var(--foreground)] opacity-0 shadow-[var(--shadow-lift)] transition peer-hover:opacity-100 peer-focus:opacity-100 peer-focus-visible:opacity-100 sm:w-64"
      >
        {text}
      </span>
    </span>
  );
}
