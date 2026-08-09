import { cn } from "@/lib/utils";
import { TextareaHTMLAttributes, forwardRef } from "react";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, id, ...props }, ref) => {
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
            "min-h-28 w-full rounded-[var(--radius-sm)] border border-white/70 bg-white/70 px-3.5 py-2.5 text-sm text-[var(--foreground)] outline-none transition duration-200 backdrop-blur-sm placeholder:text-[var(--muted)]/70 focus:border-[var(--sage)] focus:bg-white/90 focus:ring-2 focus:ring-[var(--sage)]/25 disabled:opacity-60",
            error && "border-[var(--rose)] focus:border-[var(--rose)]",
            className
          )}
          {...props}
        />
        {error ? <p className="text-sm text-[#9a6b74]">{error}</p> : null}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";
