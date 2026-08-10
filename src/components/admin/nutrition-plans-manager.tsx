"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Eye, FileDown, Pencil, Plus, Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/states";
import {
  PatientSearchSelect,
  emptyToNull,
} from "@/components/admin/patient-search-select";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { getCached, invalidateCache, setCached } from "@/lib/query-cache";
import { formatDate, fullName } from "@/lib/utils";
import {
  createNutritionPlan,
  getNutritionPlan,
  listNutritionPlans,
  updateNutritionPlan,
} from "@/services/clinical";
import {
  nutritionPlanSchema,
  type NutritionPlanFormValues,
} from "@/lib/validations";
import type { NutritionPlan, Patient } from "@/types";

const PAGE_SIZE = 20;

async function generatePlanPdf(plan: NutritionPlan, patient?: Patient | null) {
  const jspdf = await import("jspdf");
  const doc = new jspdf.default();
  const name = patient
    ? fullName(patient.first_name, patient.last_name)
    : "Paciente";
  let y = 18;
  const line = (text: string, size = 11, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, 180);
    if (y + lines.length * (size * 0.45) > 280) {
      doc.addPage();
      y = 18;
    }
    doc.text(lines, 15, y);
    y += lines.length * (size * 0.45) + 4;
  };

  line("Plan alimentario", 18, true);
  line(`Paciente: ${name}`, 12, true);
  line(`Título: ${plan.title}`);
  line(`Fecha: ${formatDate(plan.plan_date)}`);
  if (plan.objective) {
    line("Objetivo", 12, true);
    line(plan.objective);
  }
  if (plan.description) {
    line("Descripción", 12, true);
    line(plan.description);
  }
  const meals: [string, string | null][] = [
    ["Desayuno", plan.breakfast],
    ["Media mañana", plan.mid_morning],
    ["Almuerzo", plan.lunch],
    ["Merienda", plan.snack],
    ["Cena", plan.dinner],
    ["Extras", plan.extras],
  ];
  for (const [label, value] of meals) {
    if (value) {
      line(label, 12, true);
      line(value);
    }
  }
  if (plan.recommendations) {
    line("Recomendaciones", 12, true);
    line(plan.recommendations);
  }
  if (plan.observations) {
    line("Observaciones", 12, true);
    line(plan.observations);
  }

  const safe = name.replace(/[^\w.-]+/g, "_");
  doc.save(`plan_${safe}_${plan.plan_date}.pdf`);
}

const emptyPlan = (patientId = ""): NutritionPlanFormValues => ({
  patient_id: patientId,
  title: "Plan alimentario",
  plan_date: new Date().toISOString().slice(0, 10),
  objective: "",
  description: "",
  breakfast: "",
  mid_morning: "",
  lunch: "",
  snack: "",
  dinner: "",
  extras: "",
  recommendations: "",
  observations: "",
});

export function NutritionPlansManager() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [plans, setPlans] = useState<NutritionPlan[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<NutritionPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const form = useForm<NutritionPlanFormValues>({
    resolver: zodResolver(nutritionPlanSchema) as Resolver<NutritionPlanFormValues>,
    defaultValues: emptyPlan(),
  });

  const load = useCallback(async () => {
    const cacheKey = `plans:${search}:${page}`;
    const cached = getCached<{ data: NutritionPlan[]; count: number }>(cacheKey);
    if (cached) {
      setPlans(cached.data);
      setCount(cached.count);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const supabase = createClient();
      const { data, count: total } = await listNutritionPlans(supabase, {
        patientSearch: search || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      setPlans(data);
      setCount(total);
      setCached(cacheKey, { data, count: total });
    } catch (err) {
      setError(friendlyError(err, "No se pudieron cargar los planes."));
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    form.reset(emptyPlan());
    setModalOpen(true);
  };

  const openEdit = async (plan: NutritionPlan) => {
    setBusyId(plan.id);
    try {
      const supabase = createClient();
      const full = await getNutritionPlan(supabase, plan.id);
      setEditing(full);
      form.reset({
        patient_id: full.patient_id,
        title: full.title,
        plan_date: full.plan_date,
        objective: full.objective ?? "",
        description: full.description ?? "",
        breakfast: full.breakfast ?? "",
        mid_morning: full.mid_morning ?? "",
        lunch: full.lunch ?? "",
        snack: full.snack ?? "",
        dinner: full.dinner ?? "",
        extras: full.extras ?? "",
        recommendations: full.recommendations ?? "",
        observations: full.observations ?? "",
      });
      setModalOpen(true);
    } catch (err) {
      toast.error(friendlyError(err, "No se pudo cargar el plan."));
    } finally {
      setBusyId(null);
    }
  };

  const downloadPdf = async (plan: NutritionPlan) => {
    setBusyId(plan.id);
    try {
      const supabase = createClient();
      const full = await getNutritionPlan(supabase, plan.id);
      await generatePlanPdf(full, full.patient);
    } catch (err) {
      toast.error(friendlyError(err, "No se pudo generar el PDF."));
    } finally {
      setBusyId(null);
    }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setSaving(true);
    try {
      const supabase = createClient();
      const payload = emptyToNull(values) as Partial<NutritionPlan>;
      if (editing) {
        // Actualiza el plan existente; no elimina planes anteriores
        await updateNutritionPlan(supabase, editing.id, payload);
        toast.success("Plan actualizado");
      } else {
        await createNutritionPlan(supabase, payload);
        toast.success("Plan creado");
      }
      setModalOpen(false);
      invalidateCache("plans");
      await load();
    } catch (err) {
      toast.error(friendlyError(err, "No se pudo guardar el plan."));
    } finally {
      setSaving(false);
    }
  });

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Planes alimentarios"
        description="Creá y editá planes. Los planes anteriores se conservan."
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nuevo plan
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <Input
              className="pl-9"
              placeholder="Filtrar por paciente…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setPage(1);
                  setSearch(query);
                }
              }}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              setPage(1);
              setSearch(query);
            }}
          >
            Filtrar
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : error ? (
        <EmptyState
          title="Error al cargar"
          description={error}
          action={
            <Button variant="outline" onClick={() => void load()}>
              Reintentar
            </Button>
          }
        />
      ) : plans.length === 0 ? (
        <EmptyState
          title="Sin planes"
          description={
            search
              ? "No hay planes para ese paciente."
              : "Todavía no hay planes alimentarios."
          }
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Nuevo plan
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {plans.map((p) => (
              <div
                key={p.id}
                className="glass-card hover-lift flex flex-col p-6"
              >
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <Badge tone="brand">{formatDate(p.plan_date)}</Badge>
                  <span className="text-xs font-medium text-[var(--muted)]">
                    Activo
                  </span>
                </div>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                  Paciente
                </p>
                <p className="mt-1 font-semibold tracking-tight text-[var(--foreground)]">
                  {p.patient
                    ? fullName(p.patient.first_name, p.patient.last_name)
                    : "—"}
                </p>
                <p className="mt-4 text-lg font-semibold tracking-tight text-[var(--sage-deep)]">
                  {p.title}
                </p>
                <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-[var(--muted)]">
                  {p.objective || "Sin objetivo cargado"}
                </p>
                <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
                  {p.patient_id ? (
                    <Link href={`/admin/pacientes/${p.patient_id}`}>
                      <Button size="sm" variant="ghost">
                        <Eye className="h-4 w-4" />
                        Ver
                      </Button>
                    </Link>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void openEdit(p)}
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="soft"
                    loading={busyId === p.id}
                    onClick={() => void downloadPdf(p)}
                  >
                    <FileDown className="h-4 w-4" />
                    PDF
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 ? (
            <div className="mt-4 flex items-center justify-between text-sm text-[var(--muted)]">
              <span>
                {count} plan{count === 1 ? "" : "es"} · Página {page} de{" "}
                {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Editar plan" : "Nuevo plan alimentario"}
        className="sm:max-w-3xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button loading={saving} onClick={() => void onSubmit()}>
              Guardar
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <PatientSearchSelect
              required
              value={form.watch("patient_id")}
              onChange={(id) =>
                form.setValue("patient_id", id, { shouldValidate: true })
              }
              error={form.formState.errors.patient_id?.message}
              disabled={!!editing}
            />
          </div>
          <Input
            label="Título"
            required
            error={form.formState.errors.title?.message}
            {...form.register("title")}
          />
          <Input
            label="Fecha"
            type="date"
            required
            error={form.formState.errors.plan_date?.message}
            {...form.register("plan_date")}
          />
          <div className="sm:col-span-2">
            <Textarea label="Objetivo" {...form.register("objective")} />
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Descripción" {...form.register("description")} />
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Desayuno" {...form.register("breakfast")} />
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Media mañana" {...form.register("mid_morning")} />
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Almuerzo" {...form.register("lunch")} />
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Merienda" {...form.register("snack")} />
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Cena" {...form.register("dinner")} />
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Extras" {...form.register("extras")} />
          </div>
          <div className="sm:col-span-2">
            <Textarea
              label="Recomendaciones"
              {...form.register("recommendations")}
            />
          </div>
          <div className="sm:col-span-2">
            <Textarea
              label="Observaciones"
              {...form.register("observations")}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
