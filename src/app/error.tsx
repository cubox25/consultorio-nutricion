"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold text-[var(--foreground)]">
        Algo salió mal
      </h1>
      <p className="text-sm text-[var(--muted)]">
        Ocurrió un error inesperado. Podés reintentar o volver al inicio.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" onClick={reset}>
          Reintentar
        </Button>
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--border-strong)] bg-white px-5 text-sm font-medium text-[var(--foreground)]"
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
