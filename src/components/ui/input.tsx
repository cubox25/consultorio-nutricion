import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id || props.name;
    return (
      <div className="space-y-1.5">
        {label ? (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-[var(--foreground)]"
          >
            {label}
            {props.required ? <span className="text-[#9a6b74]"> *</span> : null}
          </label>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "flex h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3.5 text-sm text-[var(--foreground)] outline-none transition duration-200 placeholder:text-[var(--muted)]/70 focus:border-[var(--green)] focus:ring-2 focus:ring-[var(--green)]/20 disabled:cursor-not-allowed disabled:opacity-60",
            error &&
              "border-[var(--pink)] focus:border-[var(--pink)] focus:ring-[var(--pink)]/25",
            className
          )}
          {...props}
        />
        {error ? <p className="text-sm text-[#9a6b74]">{error}</p> : null}
        {!error && hint ? (
          <p className="text-xs text-[var(--muted)]">{hint}</p>
        ) : null}
      </div>
    );
  }
);
Input.displayName = "Input";
