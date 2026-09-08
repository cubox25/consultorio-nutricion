"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { createAndDownloadFullBackup } from "@/lib/backup";
import { clearAdminProfileCache } from "@/lib/admin-profile";
import { friendlyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

type LogoutWithBackupProps = {
  children: (opts: {
    onRequestLogout: () => void;
    loggingOut: boolean;
  }) => React.ReactNode;
};

export function LogoutWithBackup({ children }: LogoutWithBackupProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  const finishLogout = async () => {
    setLoggingOut(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      clearAdminProfileCache();
      setOpen(false);
      router.push("/login");
      router.refresh();
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo cerrar la sesión."));
      setLoggingOut(false);
      setBackingUp(false);
    }
  };

  const backupThenLogout = async () => {
    setBackingUp(true);
    try {
      const supabase = createClient();
      const { fileName, record_counts } =
        await createAndDownloadFullBackup(supabase);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await supabase.from("backup_logs").insert({
        backup_type: "completo",
        status: "completado",
        file_name: fileName,
        record_counts,
        notes: "Respaldo antes de cerrar sesión.",
        created_by: user?.id ?? null,
      });
      toast.success("Respaldo guardado. Cerrando sesión…");
      await finishLogout();
    } catch (error) {
      toast.error(
        friendlyError(
          error,
          "No se pudo crear el respaldo. Podés salir igual."
        )
      );
      setBackingUp(false);
    }
  };

  return (
    <>
      {children({
        onRequestLogout: () => setOpen(true),
        loggingOut: loggingOut || backingUp,
      })}

      <Modal
        open={open}
        onClose={() => {
          if (loggingOut || backingUp) return;
          setOpen(false);
        }}
        title="Antes de salir"
        footer={
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              disabled={loggingOut || backingUp}
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={loggingOut || backingUp}
              loading={loggingOut && !backingUp}
              onClick={() => void finishLogout()}
            >
              Salir sin respaldo
            </Button>
            <Button
              type="button"
              loading={backingUp}
              disabled={loggingOut && !backingUp}
              onClick={() => void backupThenLogout()}
            >
              Guardar respaldo y salir
            </Button>
          </div>
        }
      >
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          ¿Querés guardar una copia de seguridad en este dispositivo antes de
          cerrar sesión? Es opcional: podés salir igual si preferís.
        </p>
      </Modal>
    </>
  );
}
