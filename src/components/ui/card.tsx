import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

export function Card({
  className,
  solid,
  ...props
}: HTMLAttributes<HTMLDivElement> & { solid?: boolean }) {
  return (
    <div
      className={cn(
        solid
          ? "rounded-[var(--radius)] border border-[var(--border)] bg-white shadow-[var(--shadow-soft)]"
          : "rounded-[var(--radius)] border border-[var(--border)] bg-white shadow-[var(--shadow-soft)]",
        className
      )}
      {...props}
    />
  );
}

export function GlassCard({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <Card className={className} {...props} />;
}

export function CardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("border-b border-[var(--border)] px-6 py-5", className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "text-[0.95rem] font-semibold tracking-tight text-[var(--foreground)]",
        className
      )}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6", className)} {...props} />;
}
