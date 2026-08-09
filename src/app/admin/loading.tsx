import { PageHeader, Skeleton } from "@/components/ui/states";

export default function AdminLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <PageHeader title="Cargando…" description="Preparando el apartado." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-28 w-full bg-[var(--sage-soft)]" />
        <Skeleton className="h-28 w-full bg-[var(--cream)]" />
        <Skeleton className="h-28 w-full bg-[var(--sky-soft)]" />
      </div>
      <div className="mt-6 space-y-3 rounded-2xl border border-dashed border-[var(--border)] bg-white/60 p-4">
        <Skeleton className="h-12 w-full bg-[var(--sage-soft)]/70" />
        <Skeleton className="h-40 w-full bg-[var(--cream)]/80" />
        <Skeleton className="h-40 w-full bg-[var(--sage-soft)]/60" />
      </div>
    </div>
  );
}
