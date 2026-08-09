import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDashboardStats } from "@/services/dashboard";
import { EmptyState } from "@/components/ui/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { ActionCard } from "@/components/ui/action-card";
import {
  APPOINTMENT_STATUS_LABELS,
  type AppointmentStatus,
  type DashboardStats,
} from "@/types";
import {
  displayPatientName,
  formatDate,
  formatTime,
} from "@/lib/utils";
import {
  Users,
  CalendarDays,
  Clock3,
  CheckCircle2,
  TrendingUp,
  CalendarPlus,
  FilePlus2,
  Upload,
  UserPlus,
  UtensilsCrossed,
  ArrowRight,
} from "lucide-react";
import { DashboardClinicChart } from "@/components/admin/dashboard-clinic-chart";

function AppointmentRow({
  date,
  start,
  end,
  name,
  clinic,
  status,
  reason,
}: {
  date?: string;
  start: string;
  end: string;
  name: string;
  clinic?: string | null;
  status: AppointmentStatus;
  reason?: string | null;
}) {
  return (
    <li className="flex flex-col gap-3 border-b border-[var(--border-line)] py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium tracking-tight text-[var(--foreground)]">
          {name}
        </p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {date ? `${formatDate(date)} · ` : ""}
          {formatTime(start)} – {formatTime(end)}
          {clinic ? ` · ${clinic}` : ""}
        </p>
        {reason ? (
          <p className="mt-1 truncate text-xs text-[var(--muted)]">{reason}</p>
        ) : null}
      </div>
      <StatusBadge status={status}>
        {APPOINTMENT_STATUS_LABELS[status]}
      </StatusBadge>
    </li>
  );
}

async function loadDashboard(): Promise<{
  stats: DashboardStats | null;
  displayName: string;
}> {
  try {
    const supabase = await createClient();
    const [stats, userRes] = await Promise.all([
      getDashboardStats(supabase),
      supabase.auth.getUser(),
    ]);
    let displayName = "Pamela";
    const user = userRes.data.user;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      displayName =
        profile?.full_name || user.email?.split("@")[0] || "Pamela";
    }
    return { stats, displayName };
  } catch {
    return { stats: null, displayName: "Pamela" };
  }
}

export default async function AdminDashboardPage() {
  const { stats } = await loadDashboard();

  if (!stats) {
    return (
      <div className="max-w-3xl">
        <EmptyState
          title="No se pudo cargar el panel"
          description="Verificá la conexión con Supabase e intentá nuevamente."
        />
      </div>
    );
  }

  const nextAppt = stats.todayList[0] ?? stats.upcoming[0] ?? null;

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* Próximo turno — hero card */}
      <Card className="overflow-hidden hover-lift">
        <div className="grid lg:grid-cols-[1.4fr_0.6fr]">
          <CardContent className="p-7 sm:p-8">
            <p className="text-sm font-medium uppercase tracking-[0.12em] text-[var(--muted)]">
              Próximo turno
            </p>
            {nextAppt ? (
              <>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--foreground)] sm:text-3xl">
                  {displayPatientName(nextAppt)}
                </h2>
                <div className="mt-5 flex flex-wrap gap-3">
                  <span className="inline-flex items-center rounded-full bg-[var(--sage-soft)] px-3.5 py-1.5 text-sm font-medium text-[var(--sage-deep)]">
                    {formatTime(nextAppt.start_time)} –{" "}
                    {formatTime(nextAppt.end_time)}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-[var(--sky-soft)] px-3.5 py-1.5 text-sm text-[#4d6b76]">
                    {formatDate(nextAppt.appointment_date)}
                  </span>
                  {nextAppt.clinic?.name ? (
                    <span className="inline-flex items-center rounded-full bg-[var(--lavender-soft)] px-3.5 py-1.5 text-sm text-[#6b6280]">
                      {nextAppt.clinic.name}
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 text-sm text-[var(--muted)]">
                  {nextAppt.reason || "Consulta nutricional"}
                </p>
                <div className="mt-5">
                  <StatusBadge status={nextAppt.status}>
                    {APPOINTMENT_STATUS_LABELS[nextAppt.status]}
                  </StatusBadge>
                </div>
              </>
            ) : (
              <div className="mt-4">
                <p className="text-xl font-semibold tracking-tight">
                  Sin turnos próximos
                </p>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Cuando haya reservas, el próximo turno aparecerá aquí.
                </p>
                <Link
                  href="/admin/agenda"
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--sage-deep)] transition hover:underline"
                >
                  Ir a la agenda
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            )}
          </CardContent>
          <div className="relative hidden min-h-[12rem] bg-gradient-to-br from-[var(--sage-soft)] via-[var(--sky-soft)] to-[var(--lavender-soft)] lg:block">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/50 shadow-[var(--shadow-soft)] backdrop-blur-sm">
                <CalendarDays className="h-10 w-10 text-[var(--sage-deep)]" />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Pacientes"
          value={stats.totalPatients}
          hint={`${stats.newPatients} nuevos este mes`}
          icon={Users}
          tint="sage"
        />
        <StatCard
          title="Turnos de hoy"
          value={stats.todayAppointments}
          hint="Agenda del día"
          icon={CalendarDays}
          tint="sky"
        />
        <StatCard
          title="Atendidos"
          value={stats.attendedAppointments}
          hint="En el mes actual"
          icon={CheckCircle2}
          tint="cream"
        />
        <StatCard
          title="Pendientes"
          value={stats.pendingAppointments}
          hint="Por confirmar"
          icon={Clock3}
          tint="rose"
        />
      </div>

      {/* Próximos turnos + Acciones rápidas */}
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Próximos turnos</CardTitle>
            <Link
              href="/admin/agenda"
              className="text-xs font-medium text-[var(--sage-deep)] hover:underline"
            >
              Ver agenda
            </Link>
          </CardHeader>
          <CardContent>
            {stats.upcoming.length ? (
              <ul>
                {stats.upcoming.map((appt) => (
                  <AppointmentRow
                    key={appt.id}
                    date={appt.appointment_date}
                    start={appt.start_time}
                    end={appt.end_time}
                    name={displayPatientName(appt)}
                    clinic={appt.clinic?.name}
                    status={appt.status}
                    reason={appt.reason}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState
                title="Sin próximos turnos"
                description="Cuando haya reservas, aparecerán aquí."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acciones rápidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-2">
              <ActionCard
                href="/admin/pacientes"
                label="Nuevo paciente"
                icon={UserPlus}
                tint="sage"
              />
              <ActionCard
                href="/admin/agenda"
                label="Nuevo turno"
                icon={CalendarPlus}
                tint="sky"
              />
              <ActionCard
                href="/admin/historias"
                label="Nueva consulta"
                icon={FilePlus2}
                tint="cream"
              />
              <ActionCard
                href="/admin/planes"
                label="Nuevo plan"
                icon={UtensilsCrossed}
                tint="lavender"
              />
              <ActionCard
                href="/admin/archivos"
                label="Subir archivo"
                icon={Upload}
                tint="rose"
                className="col-span-2 sm:col-span-1 xl:col-span-2"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Evolución */}
      <section id="estadisticas" className="scroll-mt-28">
        <div className="mb-5 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-[var(--sage-deep)]" />
          <h2 className="text-lg font-semibold tracking-tight">
            Evolución del consultorio
          </h2>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Turnos del mes por consultorio</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.byClinic.length ? (
                <DashboardClinicChart data={stats.byClinic} />
              ) : (
                <p className="py-10 text-center text-sm text-[var(--muted)]">
                  Todavía no hay turnos este mes.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Indicadores del mes</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4">
                {[
                  {
                    label: "Total",
                    value: stats.monthAppointments,
                    bg: "bg-[var(--sage-soft)]",
                  },
                  {
                    label: "Atendidos",
                    value: stats.attendedAppointments,
                    bg: "bg-[var(--sky-soft)]",
                  },
                  {
                    label: "Cancelados",
                    value: stats.cancelledAppointments,
                    bg: "bg-[var(--rose-soft)]",
                  },
                  {
                    label: "Confirmados",
                    value: stats.confirmedAppointments,
                    bg: "bg-[var(--lavender-soft)]",
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={`rounded-[var(--radius-sm)] ${item.bg} px-5 py-4`}
                  >
                    <dt className="text-xs text-[var(--muted)]">{item.label}</dt>
                    <dd className="mt-1.5 text-2xl font-semibold tracking-tight">
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
