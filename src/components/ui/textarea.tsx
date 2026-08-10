import { cn } from "@/lib/utils";
import { TextareaHTMLAttributes, forwardRef } from "react";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
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
        <textarea
          ref={ref}
          id={inputId}
          className={cn(
            "min-h-28 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3.5 py-2.5 text-sm text-[var(--foreground)] outline-none transition duration-200 placeholder:text-[var(--muted)]/70 focus:border-[var(--green)] focus:ring-2 focus:ring-[var(--green)]/20 disabled:opacity-60",
            error && "border-[var(--pink)] focus:border-[var(--pink)]",
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
Textarea.displayName = "Textarea";
