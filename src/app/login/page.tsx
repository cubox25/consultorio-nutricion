"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Eye, EyeOff, Leaf } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { loginSchema } from "@/lib/validations";
import { friendlyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandLogo } from "@/components/brand/logo";

type LoginValues = z.infer<typeof loginSchema>;

function safeNextPath(raw: string | null) {
  if (!raw) return "/admin";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/admin";
  if (!raw.startsWith("/admin")) return "/admin";
  return raw;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    const error = searchParams.get("error");
    if (error === "forbidden") {
      toast.error("Tu cuenta no tiene permisos de administración.");
    } else if (error === "config") {
      toast.error("Falta configuración del servidor. Revisá las variables de entorno.");
    }
  }, [searchParams]);

  const onSubmit = async (values: LoginValues) => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email.trim(),
        password: values.password,
      });
      if (error) throw error;

      const { data: isStaff, error: staffError } = await supabase.rpc("is_staff");
      if (staffError || isStaff !== true) {
        await supabase.auth.signOut();
        throw new Error(
          "Tu cuenta no tiene permisos de administración. Pedile a un administrador que active tu acceso."
        );
      }

      toast.success("Sesión iniciada.");
      router.push(safeNextPath(searchParams.get("next")));
      router.refresh();
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo iniciar sesión."));
      setLoading(false);
    }
  };

  const passwordRegister = register("password");

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-[var(--pink-mist)] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute -left-10 top-20 h-72 w-72 rounded-full bg-[var(--pink-soft)]/60 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute bottom-10 right-0 h-80 w-80 rounded-full bg-[var(--sage)]/40 blur-3xl"
          aria-hidden
        />
        <BrandLogo className="relative h-[6rem] w-auto" />
        <div className="relative max-w-md">
          <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-[var(--shadow-soft)]">
            <Leaf className="h-7 w-7 text-[var(--green)]" />
          </div>
          <h1 className="text-4xl font-bold leading-tight text-[var(--foreground)]">
            Panel profesional
          </h1>
          <p className="mt-4 text-base leading-relaxed text-[var(--muted)]">
            Gestioná turnos, pacientes y antropometría con la identidad de tu
            consultorio.
          </p>
        </div>
        <p className="relative text-sm text-[var(--muted)]">
          Pamela Guerrero
        </p>
      </div>

      <div className="flex items-center justify-center bg-[var(--background)] px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center lg:text-left">
            <div className="mb-6 flex justify-center lg:hidden">
              <BrandLogo className="h-[5.25rem] w-auto" />
            </div>
            <h2 className="text-2xl font-bold text-[var(--foreground)] sm:text-3xl">
              Iniciar sesión
            </h2>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Ingresá con tu cuenta profesional.
            </p>
          </div>

          <div className="rounded-[1.75rem] border border-[var(--border)] bg-white p-6 shadow-[var(--shadow-soft)] sm:p-8">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                error={errors.email?.message}
                {...register("email")}
              />
              <div className="space-y-1.5">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-[var(--foreground)]"
                >
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className={`flex h-11 w-full rounded-[var(--radius-sm)] border bg-white py-0 pl-3.5 pr-11 text-sm text-[var(--foreground)] outline-none transition duration-200 placeholder:text-[var(--muted)]/70 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 ${
                      errors.password
                        ? "border-[var(--pink)] focus:border-[var(--pink)] focus:ring-[var(--pink)]/25"
                        : "border-[var(--border)] focus:border-[var(--green)] focus:ring-[var(--green)]/20"
                    }`}
                    {...passwordRegister}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--pink-mist)] hover:text-[var(--foreground)]"
                    aria-label={
                      showPassword ? "Ocultar contraseña" : "Ver contraseña"
                    }
                    title={showPassword ? "Ocultar contraseña" : "Ver contraseña"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {errors.password?.message ? (
                  <p className="text-sm text-[#9a6b74]">
                    {errors.password.message}
                  </p>
                ) : null}
              </div>
              <Button type="submit" className="w-full" loading={loading}>
                Ingresar
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-[var(--muted)]">
            <Link
              href="/"
              className="font-medium text-[var(--pink)] hover:underline"
            >
              Volver al sitio
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-sm text-[var(--muted)]">
          Cargando…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
