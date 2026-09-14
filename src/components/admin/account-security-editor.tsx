"use client";

import { useEffect, useState } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";

const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(6, "La contraseña actual es obligatoria"),
    newPassword: z
      .string()
      .min(6, "La nueva contraseña debe tener al menos 6 caracteres"),
    confirmPassword: z.string().min(6, "Confirmá la nueva contraseña"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: "La nueva contraseña debe ser distinta a la actual",
    path: ["newPassword"],
  });

type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

function PasswordField({
  id,
  label,
  error,
  registerProps,
}: {
  id: string;
  label: string;
  error?: string;
  registerProps: UseFormRegisterReturn;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-[var(--foreground)]">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          autoComplete="off"
          className={`w-full rounded-xl border bg-white px-3 py-2.5 pr-11 text-sm outline-none transition focus:border-[var(--pink)] ${
            error ? "border-[#9a6b74]" : "border-[var(--border)]"
          }`}
          {...registerProps}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 flex items-center px-3 text-[var(--muted)]"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error ? <p className="text-sm text-[#9a6b74]">{error}</p> : null}
    </div>
  );
}

export function AccountSecurityEditor() {
  const [currentUsuario, setCurrentUsuario] = useState<string>("");
  const [loadingUser, setLoadingUser] = useState(true);
  const [savingPassword, setSavingPassword] = useState(false);

  const passwordForm = useForm<ChangePasswordValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    void (async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        setCurrentUsuario(user?.email ?? "");
      } finally {
        setLoadingUser(false);
      }
    })();
  }, []);

  const onChangePassword = passwordForm.handleSubmit(async (values) => {
    setSavingPassword(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) throw new Error("Sesión no válida.");

      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: values.currentPassword,
      });
      if (authError) {
        throw new Error("La contraseña actual no es correcta.");
      }

      const { error } = await supabase.auth.updateUser({
        password: values.newPassword,
      });
      if (error) throw error;

      passwordForm.reset({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      toast.success("Contraseña actualizada.");
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo cambiar la contraseña."));
    } finally {
      setSavingPassword(false);
    }
  });

  if (loadingUser) {
    return (
      <div className="h-40 animate-pulse rounded-2xl bg-[var(--sage-soft)]/50" />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs leading-relaxed text-[var(--muted)]">
          Acá podés cambiar la contraseña de ingreso al panel. El email se
          cambia desde Supabase → Authentication → Users.
        </p>
        {currentUsuario ? (
          <p className="mt-2 text-xs text-[var(--muted)]">
            Email actual:{" "}
            <span className="font-medium text-[var(--foreground)]">
              {currentUsuario}
            </span>
          </p>
        ) : null}
      </div>

      <form className="space-y-3" onSubmit={onChangePassword}>
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
          <KeyRound className="h-4 w-4 text-[var(--pink)]" />
          Cambiar contraseña
        </div>
        <PasswordField
          id="current-password-account"
          label="Contraseña actual"
          error={passwordForm.formState.errors.currentPassword?.message}
          registerProps={passwordForm.register("currentPassword")}
        />
        <PasswordField
          id="new-password-account"
          label="Nueva contraseña"
          error={passwordForm.formState.errors.newPassword?.message}
          registerProps={passwordForm.register("newPassword")}
        />
        <PasswordField
          id="confirm-password-account"
          label="Confirmar nueva contraseña"
          error={passwordForm.formState.errors.confirmPassword?.message}
          registerProps={passwordForm.register("confirmPassword")}
        />
        <Button type="submit" size="sm" loading={savingPassword}>
          Guardar contraseña
        </Button>
      </form>
    </div>
  );
}
