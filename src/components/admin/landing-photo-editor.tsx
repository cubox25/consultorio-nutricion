"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { fileToAvatarDataUrl } from "@/lib/avatar";
import { friendlyError } from "@/lib/errors";
import { getCached, invalidateCache, setCached } from "@/lib/query-cache";
import { getSystemSettings, updateSystemSettings } from "@/services/settings";
import {
  extractLandingPhoto,
  withLandingPhoto,
} from "@/lib/landing-photo-settings";
import { BrandAvatar } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { SystemSettings } from "@/types";
import { cn } from "@/lib/utils";

export function LandingPhotoEditor() {
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const cached = getCached<SystemSettings>("settings");
        if (cached) {
          setSettings(cached);
          setPhotoUrl(extractLandingPhoto(cached.services_json));
          setLoading(false);
        }
        const supabase = createClient();
        const data = await getSystemSettings(supabase);
        if (data) {
          setSettings(data);
          setPhotoUrl(extractLandingPhoto(data.services_json));
          setCached("settings", data);
        }
      } catch (error) {
        toast.error(
          friendlyError(error, "No se pudo cargar la foto de inicio.")
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onPick = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await fileToAvatarDataUrl(file, 512, 0.85);
      setPreview(dataUrl);
      setOpen(true);
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo leer la imagen."));
    }
  };

  const persist = async (next: string | null) => {
    if (!settings) throw new Error("Configuración no disponible.");
    const supabase = createClient();
    const updated = await updateSystemSettings(supabase, settings.id, {
      services_json: withLandingPhoto(settings.services_json, next),
    });
    setSettings(updated);
    setPhotoUrl(next);
    invalidateCache("settings");
    setCached("settings", updated);
  };

  const save = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      await persist(preview);
      toast.success("Foto de inicio actualizada");
      setOpen(false);
      setPreview(null);
    } catch (error) {
      console.error("[landing-photo] save", error);
      toast.error(friendlyError(error, "No se pudo guardar la foto."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await persist(null);
      toast.success("Foto restaurada al predeterminado");
      setOpen(false);
      setPreview(null);
    } catch (error) {
      console.error("[landing-photo] remove", error);
      toast.error(friendlyError(error, "No se pudo quitar la foto."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="h-28 animate-pulse rounded-2xl bg-[var(--sage-soft)]/60" />
    );
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
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

      <div className="overflow-hidden rounded-full ring-2 ring-[var(--border)]">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt="Foto de inicio"
            className="h-[5.5rem] w-[5.5rem] object-cover"
          />
        ) : (
          <BrandAvatar size={88} />
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-[var(--foreground)]">
          Foto de la tarjeta de inicio
        </p>
        <p className="max-w-sm text-xs leading-relaxed text-[var(--muted)]">
          Se muestra en el círculo de la página principal. JPG, PNG o WebP; se
          recorta en cuadrado automáticamente.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => inputRef.current?.click()}
          >
            <Camera className="h-4 w-4" />
            Cambiar foto
          </Button>
          {photoUrl ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              loading={saving}
              onClick={() => void remove()}
            >
              <Trash2 className="h-4 w-4" />
              Usar predeterminada
            </Button>
          ) : null}
        </div>
      </div>

      <Modal
        open={open && !!preview}
        onClose={() => {
          if (!saving) {
            setOpen(false);
            setPreview(null);
          }
        }}
        title="Confirmar foto de inicio"
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
              className={cn(
                "h-40 w-40 rounded-full object-cover ring-4 ring-[var(--pink-mist)]"
              )}
            />
          ) : null}
          <p className="text-center text-sm text-[var(--muted)]">
            Así se verá en la tarjeta del inicio.
          </p>
        </div>
      </Modal>
    </div>
  );
}
