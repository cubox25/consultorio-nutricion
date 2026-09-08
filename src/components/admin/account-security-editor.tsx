"use client";

import { useEffect, useState } from "react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { clearAdminProfileCache } from "@/lib/admin-profile";
import { friendlyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const changeUsuarioSchema = z.object({
  newUsuario: z.string().email("Ingresá un email válido"),
  currentPassword: z
    .string()
    .min(6, "La contraseña actual es obligatoria"),
});

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

type ChangeUsuarioValues = z.infer<typeof changeUsuarioSchema>;
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
  const [savingUsuario, setSavingUsuario] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const usuarioForm = useForm<ChangeUsuarioValues>({
    resolver: zodResolver(changeUsuarioSchema),
    defaultValues: { newUsuario: "", currentPassword: "" },
  });

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
        const email = user?.email ?? "";
        setCurrentUsuario(email);
        usuarioForm.setValue("newUsuario", email);
      } finally {
        setLoadingUser(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once
  }, []);

  const onChangeUsuario = usuarioForm.handleSubmit(async (values) => {
    setSavingUsuario(true);
    try {
      const next = values.newUsuario.trim().toLowerCase();
      const res = await fetch("/api/admin/account/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: next,
          currentPassword: values.currentPassword,
        }),
      });
      const payload = (await res.json()) as { email?: string; error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "No se pudo cambiar el email.");
      }

      const supabase = createClient();
      // Reingresar con el email nuevo para refrescar la sesión
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: payload.email ?? next,
        password: values.currentPassword,
      });
      if (signInError) {
        toast.success(
          "Email actualizado. Cerrá sesión y volvé a entrar con el email nuevo."
        );
      } else {
        toast.success("Email actualizado en Supabase.");
      }

      clearAdminProfileCache();
      const email = payload.email ?? next;
      setCurrentUsuario(email);
      usuarioForm.reset({ newUsuario: email, currentPassword: "" });
    } catch (error) {
      const msg =
        error instanceof Error && error.message.trim()
          ? error.message
          : friendlyError(error, "No se pudo cambiar el email.");
      toast.error(msg);
    } finally {
      setSavingUsuario(false);
    }
  });

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
      toast.success("Contraseña actualizada en Supabase.");
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
        <p className="text-sm font-medium text-[var(--foreground)]">Mi cuenta</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
          Estos cambios se guardan automáticamente en Supabase (Authentication).
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

      <form className="space-y-3" onSubmit={onChangeUsuario}>
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
          <UserRound className="h-4 w-4 text-[var(--pink)]" />
          Cambiar email
        </div>
        <Input
          label="Nuevo email"
          type="email"
          autoComplete="email"
          error={usuarioForm.formState.errors.newUsuario?.message}
          {...usuarioForm.register("newUsuario")}
        />
        <Input
          label="Contraseña actual"
          type="password"
          autoComplete="current-password"
          error={usuarioForm.formState.errors.currentPassword?.message}
          {...usuarioForm.register("currentPassword")}
        />
        <Button type="submit" size="sm" loading={savingUsuario}>
          Guardar email
        </Button>
      </form>

      <div className="border-t border-[var(--border)] pt-6">
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
    </div>
  );
}
