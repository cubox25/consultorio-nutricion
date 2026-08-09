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
import { Card, CardContent } from "@/components/ui/card";

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
    <div className="admin-shell leaf-pattern flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--sage-soft)] ring-1 ring-white/70">
            <Leaf className="h-7 w-7 text-[var(--sage-deep)]" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)]">
            Acceso profesional
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Ingresá con tu cuenta para gestionar el consultorio.
          </p>
        </div>

        <Card>
          <CardContent className="p-6 sm:p-8">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                required
                error={errors.email?.message}
                {...register("email")}
              />
              <Input
                label="Contraseña"
                type="password"
                autoComplete="current-password"
                required
                error={errors.password?.message}
                {...register("password")}
              />
              <Button type="submit" className="w-full" loading={loading}>
                Ingresar
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-sm text-[var(--muted)]">
          <Link href="/" className="font-medium text-[var(--sage-deep)] hover:underline">
            Volver al sitio público
          </Link>
        </p>
      </div>
    </div>
  );
}
