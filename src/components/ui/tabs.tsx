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
        "flex flex-wrap gap-1 rounded-[var(--radius)] border border-[var(--border)] bg-white p-1.5 shadow-[var(--shadow-soft)]",
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
              "rounded-full px-4 py-2.5 text-sm font-medium transition-all duration-200",
              active
                ? "bg-[var(--pink-mist)] text-[var(--pink)] shadow-sm"
                : "text-[var(--muted)] hover:bg-[var(--sage-soft)] hover:text-[var(--green)]"
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
