"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { fileToAvatarDataUrl } from "@/lib/avatar";
import { friendlyError } from "@/lib/errors";
import { getCached, setCached } from "@/lib/query-cache";
import { updateOwnAvatarUrl } from "@/services/profile";
import { BrandAvatar } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

export const AVATAR_UPDATED_EVENT = "profile-avatar-updated";
const AVATAR_CACHE_KEY = "profile-avatar-url";

export function dispatchAvatarUpdated(url: string | null) {
  setCached(AVATAR_CACHE_KEY, url, 120_000);
  window.dispatchEvent(
    new CustomEvent(AVATAR_UPDATED_EVENT, { detail: { url } })
  );
}

export function useProfileAvatar() {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const cached = getCached<string | null>(AVATAR_CACHE_KEY);
    if (cached !== undefined) {
      setAvatarUrl(cached);
      setLoaded(true);
    }

    const supabase = createClient();
    void (async () => {
      if (cached !== undefined) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoaded(true);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      const url = data?.avatar_url ?? null;
      setAvatarUrl(url);
      setCached(AVATAR_CACHE_KEY, url, 120_000);
      setLoaded(true);
    })();

    const onUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{ url: string | null }>).detail;
      setAvatarUrl(detail?.url ?? null);
    };
    window.addEventListener(AVATAR_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(AVATAR_UPDATED_EVENT, onUpdate);
  }, []);

  return { avatarUrl, loaded, setAvatarUrl };
}

export function ProfileAvatarImage({
  src,
  size = 44,
  className,
  alt = "Foto de perfil",
}: {
  src?: string | null;
  size?: number;
  className?: string;
  alt?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        className={cn(
          "rounded-full object-cover ring-2 ring-white/70",
          className
        )}
      />
    );
  }
  return <BrandAvatar size={size} className={className} />;
}

export function ProfileAvatarEditor({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { avatarUrl } = useProfileAvatar();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onPick = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      setPreview(dataUrl);
      setOpen(true);
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo leer la imagen."));
    }
  };

  const save = async () => {
    if (!preview) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sesión no válida.");
      await updateOwnAvatarUrl(supabase, user.id, preview);
      dispatchAvatarUpdated(preview);
      toast.success("Foto de perfil actualizada");
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
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sesión no válida.");
      await updateOwnAvatarUrl(supabase, user.id, null);
      dispatchAvatarUpdated(null);
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
    <div className={cn(className)}>
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

      {compact ? (
        <button
          type="button"
          className="group relative"
          onClick={() => inputRef.current?.click()}
          title="Cambiar foto de perfil"
        >
          <ProfileAvatarImage src={avatarUrl} size={42} />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/35 opacity-0 transition group-hover:opacity-100">
            <Camera className="h-4 w-4 text-white" />
          </span>
        </button>
      ) : (
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <ProfileAvatarImage src={avatarUrl} size={88} className="ring-[var(--border)]" />
          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--foreground)]">
              Foto de perfil
            </p>
            <p className="text-xs text-[var(--muted)]">
              JPG, PNG o WebP. Se recorta en cuadrado automáticamente.
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
              {avatarUrl ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => void remove()}
                  loading={saving}
                >
                  <Trash2 className="h-4 w-4" />
                  Quitar
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <Modal
        open={open && !!preview}
        onClose={() => {
          if (!saving) {
            setOpen(false);
            setPreview(null);
          }
        }}
        title="Confirmar foto de perfil"
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
            Así se verá tu foto en el panel.
          </p>
        </div>
      </Modal>
    </div>
  );
}
