"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { searchPatients } from "@/services/patients";
import { fullName } from "@/lib/utils";
import type { Patient } from "@/types";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (patientId: string, patient?: Patient | null) => void;
  label?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
};

export function PatientSearchSelect({
  value,
  onChange,
  label = "Paciente",
  error,
  required,
  disabled,
}: Props) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Patient[]>([]);
  const [selected, setSelected] = useState<Patient | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!value) {
      setSelected(null);
      return;
    }
    if (selected?.id === value) return;
    const supabase = createClient();
    void (async () => {
      const { data } = await supabase
        .from("patients")
        .select("*")
        .eq("id", value)
        .maybeSingle();
      if (data) setSelected(data as Patient);
    })();
  }, [value, selected?.id]);

  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const supabase = createClient();
          const { data } = await searchPatients(supabase, query, 1, 15);
          setOptions(data);
        } finally {
          setLoading(false);
        }
      })();
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open]);

  return (
    <div className="relative space-y-1.5">
      {label ? (
        <label className="block text-sm font-medium text-[var(--foreground)]">
          {label}
          {required ? <span className="text-red-600"> *</span> : null}
        </label>
      ) : null}
      <Input
        value={
          open
            ? query
            : selected
              ? fullName(selected.first_name, selected.last_name)
              : ""
        }
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        placeholder="Buscar por nombre, apellido o DNI…"
        disabled={disabled}
        autoComplete="off"
      />
      {open ? (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-[var(--border)] bg-white shadow-lg">
          {loading ? (
            <p className="px-3 py-2 text-sm text-stone-500">Buscando…</p>
          ) : options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-stone-500">Sin resultados</p>
          ) : (
            options.map((p) => (
              <button
                key={p.id}
                type="button"
                className={cn(
                  "flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-[var(--surface-muted)]",
                  value === p.id && "bg-[var(--brand-soft)]"
                )}
                onClick={() => {
                  setSelected(p);
                  onChange(p.id, p);
                  setOpen(false);
                  setQuery("");
                }}
              >
                <span className="font-medium">
                  {fullName(p.first_name, p.last_name)}
                </span>
                <span className="text-xs text-stone-500">
                  {[p.dni ? `DNI ${p.dni}` : null, p.phone].filter(Boolean).join(" · ") ||
                    "Sin datos de contacto"}
                </span>
              </button>
            ))
          )}
          <button
            type="button"
            className="w-full border-t border-[var(--border)] px-3 py-2 text-left text-xs text-stone-500 hover:bg-[var(--surface-muted)]"
            onClick={() => setOpen(false)}
          >
            Cerrar
          </button>
        </div>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

export function emptyToNull<T extends Record<string, unknown>>(values: T) {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(values)) {
    if (val === "") out[key] = null;
    else out[key] = val;
  }
  return out as T;
}
