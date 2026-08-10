import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

const tints = {
  sage: {
    icon: "bg-[var(--sage-soft)] text-[var(--green)]",
    dot: "bg-[var(--green)]",
  },
  sky: {
    icon: "bg-[var(--pink-mist)] text-[var(--pink)]",
    dot: "bg-[var(--pink)]",
  },
  cream: {
    icon: "bg-[var(--yellow-soft)] text-[#9a6f10]",
    dot: "bg-[var(--yellow)]",
  },
  rose: {
    icon: "bg-[var(--pink-soft)]/50 text-[var(--pink)]",
    dot: "bg-[var(--pink)]",
  },
  lavender: {
    icon: "bg-[var(--sage-soft)] text-[var(--green-deep)]",
    dot: "bg-[var(--sage)]",
  },
} as const;

export type StatTint = keyof typeof tints;

export function StatCard({
  title,
  value,
  hint,
  icon: Icon,
  tint = "sage",
  className,
}: {
  title: string;
  value: number | string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tint?: StatTint;
  className?: string;
}) {
  const t = tints[tint];
  return (
    <Card className={cn("min-h-[9rem] hover-lift", className)}>
      <CardContent className="flex h-full flex-col justify-between p-6 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.8rem] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
              {title}
            </p>
            <p className="mt-3 text-3xl font-bold tracking-tight text-[var(--foreground)] sm:text-4xl">
              {value}
            </p>
          </div>
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-full",
              t.icon
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {hint ? (
          <div className="mt-5 flex items-center gap-2 text-sm text-[var(--muted)]">
            <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} />
            {hint}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
