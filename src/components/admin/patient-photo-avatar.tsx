"use client";

import { useRef, useState } from "react";
import { Camera, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { fileToAvatarDataUrl } from "@/lib/avatar";
import { friendlyError } from "@/lib/errors";
import { invalidateCache } from "@/lib/query-cache";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import type { Patient } from "@/types";

function patientInitials(firstName: string, lastName: string) {
  const a = lastName?.trim()?.[0] ?? "";
  const b = firstName?.trim()?.[0] ?? "";
  return `${a}${b}`.toUpperCase() || "?";
}

type PatientPhotoAvatarProps = {
  patientId: string;
  firstName: string;
  lastName: string;
  photoUrl?: string | null;
  onUpdated: (patient: Patient) => void;
  className?: string;
};

export function PatientPhotoAvatar({
  patientId,
  firstName,
  lastName,
  photoUrl,
  onUpdated,
  className,
}: PatientPhotoAvatarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const alt = `Foto de ${firstName} ${lastName}`.trim();
  const initials = patientInitials(firstName, lastName);

  const onPick = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await fileToAvatarDataUrl(file, 320, 0.85);
      setPreview(dataUrl);
      setOpen(true);
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo leer la imagen."));
    }
  };

  const persist = async (next: string | null) => {
    const res = await fetch("/api/admin/patient-photo", {
      method: next ? "POST" : "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        next
          ? { patientId, dataUrl: next }
          : { patientId }
      ),
    });
    const payload = (await res.json()) as {
      patient?: Patient;
      error?: string;
    };
    if (!res.ok || !payload.patient) {
      throw new Error(payload.error || "No se pudo guardar la foto.");
    }
    onUpdated(payload.patient);
    invalidateCache("patients");
  };

  const save = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      await persist(preview);
      toast.success("Foto del paciente actualizada");
      setOpen(false);
      setPreview(null);
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo guardar la foto."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await persist(null);
      toast.success("Foto eliminada");
      setOpen(false);
      setPreview(null);
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo eliminar la foto."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          void onPick(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />

      <div className={cn("group relative shrink-0", className)}>
        <button
          type="button"
          className="relative h-20 w-20 overflow-hidden rounded-full border border-[var(--border)] bg-[var(--sage-soft)] sm:h-24 sm:w-24"
          onClick={() => inputRef.current?.click()}
          title={photoUrl ? "Cambiar foto del paciente" : "Agregar foto del paciente"}
        >
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt={alt}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center text-[var(--sage-deep)]">
              <UserRound className="h-7 w-7 opacity-70" aria-hidden />
              <span className="mt-1 text-sm font-semibold tracking-wide">
                {initials}
              </span>
            </div>
          )}
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-full bg-black/40 opacity-0 transition group-hover:opacity-100">
            <Camera className="h-5 w-5 text-white" aria-hidden />
            <span className="text-[10px] font-medium text-white">
              {photoUrl ? "Cambiar" : "Agregar"}
            </span>
          </span>
        </button>

        {photoUrl ? (
          <button
            type="button"
            className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] bg-white text-[var(--muted)] opacity-0 shadow-sm transition hover:text-[var(--pink)] group-hover:opacity-100"
            title="Quitar foto"
            disabled={saving}
            onClick={(e) => {
              e.stopPropagation();
              void remove();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </div>

      <Modal
        open={open && !!preview}
        onClose={() => {
          if (!saving) {
            setOpen(false);
            setPreview(null);
          }
        }}
        title="Confirmar foto del paciente"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => {
                setOpen(false);
                setPreview(null);
              }}
            >
              Cancelar
            </Button>
            <Button type="button" loading={saving} onClick={() => void save()}>
              Guardar foto
            </Button>
          </div>
        }
      >
        <div className="flex flex-col items-center gap-4 py-2">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Vista previa"
              className="h-40 w-40 rounded-full object-cover ring-4 ring-[var(--pink-mist)]"
            />
          ) : null}
          <p className="text-center text-sm text-[var(--muted)]">
            Así se verá en la ficha del paciente.
          </p>
        </div>
      </Modal>
    </>
  );
}
