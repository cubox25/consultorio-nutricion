import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "soft" | "pink";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-[var(--green)] text-white hover:bg-[var(--green-deep)] shadow-[var(--shadow-soft)]",
  pink:
    "bg-[var(--pink)] text-white hover:bg-[color-mix(in_srgb,var(--pink)_88%,#1f2937)] shadow-[var(--shadow-soft)]",
  secondary:
    "bg-[var(--sage)] text-white hover:bg-[var(--green)] shadow-[var(--shadow-soft)]",
  soft: "bg-[var(--pink-mist)] text-[var(--pink)] hover:bg-[var(--pink-soft)]/50",
  outline:
    "border border-[var(--border-strong)] bg-white text-[var(--foreground)] hover:border-[var(--pink)] hover:text-[var(--pink)]",
  ghost:
    "text-[var(--muted)] hover:bg-[var(--pink-mist)] hover:text-[var(--foreground)]",
  danger:
    "bg-[var(--pink-mist)] text-[var(--pink)] hover:bg-[color-mix(in_srgb,var(--pink)_22%,white)]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm rounded-full",
  md: "h-11 px-5 text-sm rounded-full",
  lg: "h-12 px-7 text-base rounded-full",
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
        "inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--green)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
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
