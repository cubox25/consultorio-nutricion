import Link from "next/link";
import { cn } from "@/lib/utils";

const tints = {
  sage: "bg-[var(--sage-soft)] text-[var(--green)]",
  sky: "bg-[var(--pink-mist)] text-[var(--pink)]",
  cream: "bg-[var(--yellow-soft)] text-[#9a6f10]",
  rose: "bg-[var(--pink-soft)]/45 text-[var(--pink)]",
  lavender: "bg-[var(--sage-soft)] text-[var(--green-deep)]",
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
        "group flex flex-col items-center gap-3 rounded-[1.25rem] border border-[var(--border)] bg-[var(--background)] px-3 py-5 text-center transition-all duration-200 hover:border-[var(--pink-soft)] hover:bg-white hover:shadow-[var(--shadow-soft)]",
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
