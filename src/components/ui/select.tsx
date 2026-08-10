import { cn } from "@/lib/utils";
import { SelectHTMLAttributes, forwardRef } from "react";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, placeholder, id, ...props }, ref) => {
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
        <select
          ref={ref}
          id={inputId}
          className={cn(
            "flex h-11 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-white px-3.5 text-sm text-[var(--foreground)] outline-none transition duration-200 focus:border-[var(--green)] focus:ring-2 focus:ring-[var(--green)]/20 disabled:opacity-60",
            error && "border-[var(--pink)]",
            className
          )}
          {...props}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error ? <p className="text-sm text-[#9a6b74]">{error}</p> : null}
      </div>
    );
  }
);
Select.displayName = "Select";
