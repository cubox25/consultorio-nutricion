"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Leaf } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { loginSchema } from "@/lib/validations";
import { friendlyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandLogo } from "@/components/brand/logo";

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

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
      router.push("/admin");
      router.refresh();
    } catch (error) {
      toast.error(friendlyError(error, "No se pudo iniciar sesión."));
      setLoading(false);
    }
  };

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
            Gestioná turnos, pacientes, antropometría y planes alimentarios con
            la identidad de tu consultorio.
          </p>
        </div>
        <p className="relative text-sm text-[var(--muted)]">
          Pamela Guerrero · Licenciada en Nutrición
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
              <Input
                label="Contraseña"
                type="password"
                autoComplete="current-password"
                error={errors.password?.message}
                {...register("password")}
              />
              <Button type="submit" className="w-full" loading={loading}>
                Ingresar
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-[var(--muted)]">
            <Link href="/" className="font-medium text-[var(--pink)] hover:underline">
              Volver al sitio
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
