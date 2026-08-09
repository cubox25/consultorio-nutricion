import Link from "next/link";
import { cn } from "@/lib/utils";

const tints = {
  sage: "bg-[var(--sage-soft)] text-[var(--sage-deep)]",
  sky: "bg-[var(--sky-soft)] text-[#4d6b76]",
  cream: "bg-[var(--cream)] text-[#8a7355]",
  rose: "bg-[var(--rose-soft)] text-[#9a6b74]",
  lavender: "bg-[var(--lavender-soft)] text-[#6b6280]",
} as const;

export function ActionCard({
  href,
  label,
  icon: Icon,
  tint = "sage",
  className,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tint?: keyof typeof tints;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col items-center gap-3 rounded-[var(--radius)] border border-[var(--glass-border)] bg-[rgba(255,255,255,0.4)] px-3 py-5 text-center transition-all duration-200 hover:bg-[rgba(255,255,255,0.7)] hover:shadow-[var(--shadow-soft)]",
        className
      )}
    >
      <span
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-[1.04]",
          tints[tint]
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-xs font-medium leading-snug text-[var(--foreground)] sm:text-sm">
        {label}
      </span>
    </Link>
  );
}
