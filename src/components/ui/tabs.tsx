"use client";

import { cn } from "@/lib/utils";

export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "glass-panel flex flex-wrap gap-1 rounded-[var(--radius)] p-1.5",
        className
      )}
      role="tablist"
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "rounded-[1rem] px-4 py-2.5 text-sm font-medium transition-all duration-200",
              active
                ? "bg-white/90 text-[var(--foreground)] shadow-[var(--shadow-soft)] ring-1 ring-white/80"
                : "text-[var(--muted)] hover:bg-white/45 hover:text-[var(--foreground)]"
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
