"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/states";
import {
  PatientSearchSelect,
  emptyToNull,
} from "@/components/admin/patient-search-select";
import { createClient } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { calculateBmi, formatDate } from "@/lib/utils";
import {
  createAnthropometry,
  listAnthropometry,
} from "@/services/clinical";
import {
  anthropometricSchema,
  type AnthropometricFormValues,
} from "@/lib/validations";
import type { AnthropometricRecord } from "@/types";

const AnthropometryCharts = dynamic(
  () =>
    import("@/components/admin/anthropometry-charts").then(
      (m) => m.AnthropometryCharts
    ),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full" />,
  }
);

export function AnthropometryManager() {
  const [patientId, setPatientId] = useState("");
  const [records, setRecords] = useState<AnthropometricRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");

  const form = useForm<AnthropometricFormValues>({
    resolver: zodResolver(anthropometricSchema) as Resolver<AnthropometricFormValues>,
  });

  const load = useCallback(async () => {
    if (!patientId) {
      setRecords([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const data = await listAnthropometry(supabase, patientId);
      setRecords(data);
      if (data.length >= 2) {
        setCompareA(data[0].id);
        setCompareB(data[data.length - 1].id);
      } else {
        setCompareA("");
        setCompareB("");
      }
    } catch (err) {
      setError(friendlyError(err, "No se pudieron cargar las mediciones."));
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    if (!patientId) {
      toast.error("Seleccioná un paciente primero.");
      return;
    }
    form.reset({
      patient_id: patientId,
      measured_at: new Date().toISOString().slice(0, 10),
      weight_kg: null,
      height_cm: null,
      waist_cm: null,
      hip_cm: null,
      arm_cm: null,
      thigh_cm: null,
      neck_cm: null,
      body_fat_percent: null,
      muscle_mass_kg: null,
      fat_mass_kg: null,
      body_water_percent: null,
      basal_metabolism_kcal: null,
      notes: "",
    });
    setModalOpen(true);
  };

  const weight = form.watch("weight_kg");
  const height = form.watch("height_cm");
  const previewBmi = calculateBmi(
    weight == null || weight === ("" as unknown) ? null : Number(weight),
    height == null || height === ("" as unknown) ? null : Number(height)
  );

  const onSubmit = form.handleSubmit(async (values) => {
    setSaving(true);
    try {
      const supabase = createClient();
      await createAnthropometry(
        supabase,
        emptyToNull(values) as Partial<AnthropometricRecord>
      );
      toast.success("Medición registrada");
      setModalOpen(false);
      await load();
    } catch (err) {
      toast.error(friendlyError(err, "No se pudo guardar la medición."));
    } finally {
      setSaving(false);
    }
  });

  const chartData = useMemo(
    () =>
      records.map((r) => ({
        date: formatDate(r.measured_at),
        peso: r.weight_kg,
        imc: r.bmi,
        grasa: r.body_fat_percent,
        musculo: r.muscle_mass_kg,
      })),
    [records]
  );

  const dateOptions = records.map((r) => ({
    value: r.id,
    label: formatDate(r.measured_at),
  }));

  const recA = records.find((r) => r.id === compareA);
  const recB = records.find((r) => r.id === compareB);

  const delta = (a?: number | null, b?: number | null) => {
    if (a == null || b == null) return "—";
    const d = b - a;
    const sign = d > 0 ? "+" : "";
    return `${sign}${Math.round(d * 100) / 100}`;
  };

  return (
    <div>
      <PageHeader
        title="Antropometría"
        description="Registrá mediciones, seguí la evolución y compará fechas."
        actions={
          <Button onClick={openCreate} disabled={!patientId}>
            <Plus className="h-4 w-4" />
            Nueva medición
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="p-4">
          <PatientSearchSelect
            value={patientId}
            onChange={(id) => setPatientId(id)}
            label="Seleccionar paciente"
            required
          />
        </CardContent>
      </Card>

      {!patientId ? (
        <EmptyState
          title="Elegí un paciente"
          description="Seleccioná un paciente para ver su historial antropométrico."
        />
      ) : loading ? (
        <div className="space-y-3">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
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
      ) : records.length === 0 ? (
        <EmptyState
          title="Sin mediciones"
          description="Todavía no hay registros para este paciente."
          action={
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Registrar medición
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          {(() => {
            const latest = records[records.length - 1];
            const metrics = [
              {
                label: "Peso",
                value: latest.weight_kg != null ? `${latest.weight_kg} kg` : "—",
                bg: "bg-[var(--sage-soft)]",
                fg: "text-[var(--sage-deep)]",
              },
              {
                label: "IMC",
                value: latest.bmi != null ? String(latest.bmi) : "—",
                bg: "bg-[var(--sky-soft)]",
                fg: "text-[#4d6b76]",
              },
              {
                label: "% Grasa",
                value:
                  latest.body_fat_percent != null
                    ? `${latest.body_fat_percent}%`
                    : "—",
                bg: "bg-[var(--rose-soft)]",
                fg: "text-[#9a6b74]",
              },
              {
                label: "Masa muscular",
                value:
                  latest.muscle_mass_kg != null
                    ? `${latest.muscle_mass_kg} kg`
                    : "—",
                bg: "bg-[var(--cream)]",
                fg: "text-[#8a7355]",
              },
              {
                label: "Cintura",
                value: latest.waist_cm != null ? `${latest.waist_cm} cm` : "—",
                bg: "bg-[var(--background-secondary)]",
                fg: "text-[var(--foreground)]",
              },
            ];
            return (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {metrics.map((m) => (
                  <div
                    key={m.label}
                    className={`rounded-[var(--radius)] border border-[var(--border)] px-5 py-5 shadow-[var(--shadow-soft)] ${m.bg}`}
                  >
                    <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                      {m.label}
                    </p>
                    <p className={`mt-1 text-2xl font-semibold ${m.fg}`}>
                      {m.value}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Última: {formatDate(latest.measured_at)}
                    </p>
                  </div>
                ))}
              </div>
            );
          })()}

          <Card className="shadow-[var(--shadow-soft)]">
            <CardHeader>
              <CardTitle>Evolución</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              <AnthropometryCharts data={chartData} />
            </CardContent>
          </Card>

          {records.length >= 2 ? (
            <Card className="shadow-[var(--shadow-soft)]">
              <CardHeader>
                <CardTitle>Comparar dos fechas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select
                    label="Fecha A"
                    options={dateOptions}
                    value={compareA}
                    onChange={(e) => setCompareA(e.target.value)}
                  />
                  <Select
                    label="Fecha B"
                    options={dateOptions}
                    value={compareB}
                    onChange={(e) => setCompareB(e.target.value)}
                  />
                </div>
                {recA && recB ? (
                  <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                    <table className="min-w-full text-sm">
                      <thead className="bg-[var(--sage-soft)]/50 text-left text-xs uppercase text-[var(--muted)]">
                        <tr>
                          <th className="px-4 py-2">Medida</th>
                          <th className="px-4 py-2">
                            {formatDate(recA.measured_at)}
                          </th>
                          <th className="px-4 py-2">
                            {formatDate(recB.measured_at)}
                          </th>
                          <th className="px-4 py-2">Δ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(
                          [
                            ["Peso (kg)", recA.weight_kg, recB.weight_kg],
                            ["IMC", recA.bmi, recB.bmi],
                            [
                              "% Grasa",
                              recA.body_fat_percent,
                              recB.body_fat_percent,
                            ],
                            ["Cintura", recA.waist_cm, recB.waist_cm],
                            [
                              "Masa muscular",
                              recA.muscle_mass_kg,
                              recB.muscle_mass_kg,
                            ],
                          ] as const
                        ).map(([label, a, b]) => (
                          <tr
                            key={label}
                            className="border-t border-[var(--border)]"
                          >
                            <td className="px-4 py-2 font-medium">{label}</td>
                            <td className="px-4 py-2">{a ?? "—"}</td>
                            <td className="px-4 py-2">{b ?? "—"}</td>
                            <td className="px-4 py-2">{delta(a, b)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card className="shadow-[var(--shadow-soft)]">
            <CardHeader>
              <CardTitle>Historial</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--sage-soft)]/50 text-left text-xs uppercase text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Peso</th>
                    <th className="px-4 py-3">Altura</th>
                    <th className="px-4 py-3">IMC</th>
                    <th className="px-4 py-3">% Grasa</th>
                    <th className="px-4 py-3">Cintura</th>
                    <th className="px-4 py-3">Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {[...records].reverse().map((r) => (
                    <tr key={r.id} className="border-t border-[var(--border)] hover:bg-[var(--sage-soft)]/20">
                      <td className="px-4 py-3">
                        {formatDate(r.measured_at)}
                      </td>
                      <td className="px-4 py-3">
                        {r.weight_kg != null ? `${r.weight_kg}` : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {r.height_cm != null ? `${r.height_cm}` : "—"}
                      </td>
                      <td className="px-4 py-3">{r.bmi ?? "—"}</td>
                      <td className="px-4 py-3">
                        {r.body_fat_percent ?? "—"}
                      </td>
                      <td className="px-4 py-3">{r.waist_cm ?? "—"}</td>
                      <td className="max-w-[12rem] truncate px-4 py-3 text-[var(--muted)]">
                        {r.notes || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Registrar medición"
        className="sm:max-w-2xl"
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
          <Input
            label="Fecha"
            type="date"
            required
            error={form.formState.errors.measured_at?.message}
            {...form.register("measured_at")}
          />
          <div className="flex items-end pb-2 text-sm">
            IMC estimado: <strong className="ml-1">{previewBmi ?? "—"}</strong>
          </div>
          <Input
            label="Peso (kg)"
            type="number"
            step="0.1"
            error={form.formState.errors.weight_kg?.message}
            {...form.register("weight_kg")}
          />
          <Input
            label="Altura (cm)"
            type="number"
            step="0.1"
            error={form.formState.errors.height_cm?.message}
            {...form.register("height_cm")}
          />
          <Input
            label="Cintura (cm)"
            type="number"
            step="0.1"
            {...form.register("waist_cm")}
          />
          <Input
            label="Cadera (cm)"
            type="number"
            step="0.1"
            {...form.register("hip_cm")}
          />
          <Input
            label="Brazo (cm)"
            type="number"
            step="0.1"
            {...form.register("arm_cm")}
          />
          <Input
            label="Muslo (cm)"
            type="number"
            step="0.1"
            {...form.register("thigh_cm")}
          />
          <Input
            label="Cuello (cm)"
            type="number"
            step="0.1"
            {...form.register("neck_cm")}
          />
          <Input
            label="% Grasa corporal"
            type="number"
            step="0.1"
            {...form.register("body_fat_percent")}
          />
          <Input
            label="Masa muscular (kg)"
            type="number"
            step="0.1"
            {...form.register("muscle_mass_kg")}
          />
          <Input
            label="Masa grasa (kg)"
            type="number"
            step="0.1"
            {...form.register("fat_mass_kg")}
          />
          <Input
            label="% Agua corporal"
            type="number"
            step="0.1"
            {...form.register("body_water_percent")}
          />
          <Input
            label="Metabolismo basal (kcal)"
            type="number"
            step="1"
            {...form.register("basal_metabolism_kcal")}
          />
          <div className="sm:col-span-2">
            <Textarea label="Notas" {...form.register("notes")} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
