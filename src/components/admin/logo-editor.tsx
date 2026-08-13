"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { fileToLogoDataUrl } from "@/lib/logo";
import { friendlyError } from "@/lib/errors";
import { getCached, invalidateCache, setCached } from "@/lib/query-cache";
import { getSystemSettings, updateSystemSettings } from "@/services/settings";
import { BrandLogo, DEFAULT_LOGO_PATH, dispatchLogoUpdated } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { SystemSettings } from "@/types";

export function LogoEditor() {
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
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
          setSettingsId(cached.id);
          setLogoUrl(cached.logo_url ?? null);
          setLoading(false);
        }
        const supabase = createClient();
        const data = await getSystemSettings(supabase);
        if (data) {
          setSettingsId(data.id);
          setLogoUrl(data.logo_url ?? null);
          setCached("settings", data);
        }
      } catch (error) {
        toast.error(friendlyError(error, "No se pudo cargar el logo."));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onPick = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await fileToLogoDataUrl(file);
      setPreview(dataUrl);
      setOpen(true);
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo leer la imagen."));
    }
  };

  const persistLogo = async (next: string | null) => {
    if (!settingsId) throw new Error("Configuración no disponible.");
    const supabase = createClient();
    const updated = await updateSystemSettings(supabase, settingsId, {
      logo_url: next,
    });
    setLogoUrl(next);
    invalidateCache("settings");
    setCached("settings", updated);
    dispatchLogoUpdated(next);
  };

  const save = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      await persistLogo(preview);
      toast.success("Logo actualizado");
      setOpen(false);
      setPreview(null);
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo guardar el logo."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await persistLogo(null);
      toast.success("Logo restaurado al predeterminado");
      setOpen(false);
      setPreview(null);
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo quitar el logo."));
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

      <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3">
        <BrandLogo src={logoUrl} className="h-[5rem] w-auto sm:h-[5.25rem]" />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium text-[var(--foreground)]">
          Logo del consultorio
        </p>
        <p className="max-w-sm text-xs leading-relaxed text-[var(--muted)]">
          PNG o JPG con fondo transparente recomendado. Se verá en el sitio
          público, login y panel de administración.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => inputRef.current?.click()}
          >
            <ImageIcon className="h-4 w-4" />
            Cambiar logo
          </Button>
          {logoUrl ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              loading={saving}
              onClick={() => void remove()}
            >
              <Trash2 className="h-4 w-4" />
              Usar predeterminado
            </Button>
          ) : null}
        </div>
        {!logoUrl ? (
          <p className="text-[11px] text-[var(--muted)]">
            Actualmente: logo predeterminado ({DEFAULT_LOGO_PATH.split("/").pop()})
          </p>
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
        title="Confirmar logo"
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
              Guardar logo
            </Button>
          </div>
        }
      >
        <div className="flex flex-col items-center gap-4 py-2">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt="Vista previa del logo"
              className="max-h-32 w-auto max-w-full object-contain"
            />
          ) : null}
          <p className="text-center text-sm text-[var(--muted)]">
            Así se verá en el encabezado del sitio.
          </p>
        </div>
      </Modal>
    </div>
  );
}
