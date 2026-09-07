import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold text-[var(--foreground)]">
        Página no encontrada
      </h1>
      <p className="text-sm text-[var(--muted)]">
        El enlace no existe o fue movido.
      </p>
      <Link
        href="/"
        className="inline-flex h-11 items-center rounded-full bg-[var(--green)] px-5 text-sm font-semibold text-white"
      >
        Volver al inicio
      </Link>
    </div>
  );
}
