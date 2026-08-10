import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

const tones = {
  default: "bg-[#f3f4f6] text-[var(--muted)]",
  success: "bg-[var(--sage-soft)] text-[var(--green)]",
  warning: "bg-[var(--yellow-soft)] text-[#9a6f10]",
  danger: "bg-[var(--pink-mist)] text-[var(--pink)]",
  info: "bg-[var(--sage-soft)] text-[var(--green-deep)]",
  brand: "bg-[var(--pink-mist)] text-[var(--pink)]",
  soft: "bg-[var(--background)] text-[var(--foreground)]",
};

export function Badge({
  className,
  tone = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof tones }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}

/** Badge que toma color desde clases status-* del contenedor */
export function StatusBadge({
  className,
  status,
  children,
}: {
  className?: string;
  status: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        `status-${status}`,
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        className
      )}
      style={{
        background: "var(--badge-bg)",
        color: "var(--badge-fg)",
      }}
    >
      {children}
    </span>
  );
}
