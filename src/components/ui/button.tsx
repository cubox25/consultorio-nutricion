import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--sage)] text-[var(--sage-deep)] hover:bg-[color-mix(in_srgb,var(--sage)_88%,var(--sage-deep))] shadow-[var(--shadow-soft)]",
  secondary:
    "bg-[var(--sage-soft)] text-[var(--sage-deep)] hover:bg-[color-mix(in_srgb,var(--sage-soft)_80%,white)]",
  soft: "bg-[var(--cream)] text-[var(--foreground)] hover:bg-[var(--cream-deep)]",
  outline:
    "border border-white/70 bg-white/55 text-[var(--foreground)] backdrop-blur-sm hover:bg-white/85",
  ghost:
    "text-[var(--muted)] hover:bg-white/55 hover:text-[var(--foreground)]",
  danger:
    "bg-[var(--rose-soft)] text-[#9a6b74] hover:bg-[color-mix(in_srgb,var(--rose)_35%,white)]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-[var(--radius-sm)]",
  md: "h-11 px-4 text-sm rounded-[var(--radius-sm)]",
  lg: "h-12 px-6 text-base rounded-[var(--radius)]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading,
      disabled,
      children,
      ...props
    },
    ref
  ) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sage)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
      ) : null}
      {children}
    </button>
  )
);
Button.displayName = "Button";
