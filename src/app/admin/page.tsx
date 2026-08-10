import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDashboardStats } from "@/services/dashboard";
import { EmptyState } from "@/components/ui/states";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { BrandLogo } from "@/components/brand/logo";
import {
  APPOINTMENT_STATUS_LABELS,
  type AppointmentStatus,
  type DashboardStats,
} from "@/types";
import { displayPatientName, formatDate, formatTime } from "@/lib/utils";
import {
  Users,
  CalendarDays,
  Clock3,
  UserPlus,
  CalendarPlus,
  UtensilsCrossed,
  Upload,
  FileHeart,
  ArrowRight,
  Heart,
  Leaf,
  DatabaseBackup,
  Sparkles,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import { DashboardPatientsChart } from "@/components/admin/dashboard-clinic-chart";

function greetingForHour(hour: number) {
  if (hour < 12) return "¡Hola";
  if (hour < 19) return "¡Hola";
  return "¡Hola";
}

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "pink" | "sage" | "green" | "yellow" | "cream";
}) {
  const tones = {
    pink: "bg-[var(--pink-mist)] text-[var(--pink)]",
    sage: "bg-[var(--sage-soft)] text-[var(--green)]",
    green: "bg-[#e5efd5] text-[var(--green-deep)]",
    yellow: "bg-[var(--yellow-soft)] text-[#9a6f10]",
    cream: "bg-[#fff1ec] text-[var(--pink)]",
  };
  return (
    <div className="rounded-[1.35rem] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-soft)] transition hover:shadow-[var(--shadow-lift)] sm:p-5">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${tones[tone]}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
            {value}
          </p>
          <p className="mt-0.5 text-sm font-medium text-[var(--foreground)]">
            {label}
          </p>
          <p className="mt-1 text-xs font-semibold text-[var(--green)]">{hint}</p>
        </div>
      </div>
    </div>
  );
}

function AppointmentRow({
  date,
  start,
  end,
  name,
  status,
  reason,
}: {
  date?: string;
  start: string;
  end: string;
  name: string;
  status: AppointmentStatus;
  reason?: string | null;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <li className="flex items-center gap-3 border-b border-[var(--border)] py-3.5 last:border-0">
      <div className="w-12 shrink-0 text-sm font-bold tabular-nums text-[var(--pink)]">
        {formatTime(start)}
      </div>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--sage-soft)] text-xs font-semibold text-[var(--green)]">
        {initials || "?"}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-[var(--foreground)]">{name}</p>
        <p className="truncate text-xs text-[var(--muted)]">
          {reason || "Control nutricional"}
          {date ? ` · ${formatDate(date)}` : ""}
        </p>
      </div>
      <StatusBadge status={status}>
        {APPOINTMENT_STATUS_LABELS[status]}
      </StatusBadge>
    </li>
  );
}

function QuickAction({
  href,
  label,
  icon: Icon,
  tone,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-center gap-2.5 rounded-2xl p-2 text-center transition hover:-translate-y-0.5"
    >
      <span
        className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm transition group-hover:scale-[1.04] ${tone}`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-[11px] font-semibold leading-tight text-[var(--foreground)] sm:text-xs">
        {label}
      </span>
    </Link>
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
  const { stats, displayName } = await loadDashboard();
  const firstName = displayName.split(/\s+/)[0] || "Pamela";
  const hour = Number(
    new Intl.DateTimeFormat("es-AR", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(new Date())
  );
  const hello = greetingForHour(Number.isFinite(hour) ? hour : 10);
  const todayLabel = new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());

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

  const list = stats.upcoming.length ? stats.upcoming : stats.todayList;

  return (
    <div className="space-y-6 pb-4 lg:space-y-7">
      {/* Header como mockup */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-[1.85rem]">
            {hello}, {firstName}!{" "}
            <span aria-hidden className="font-normal">
              👋
            </span>
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Este es el resumen de tu consultorio.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded-full border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--foreground)] shadow-[var(--shadow-soft)]">
          <CalendarDays className="h-4 w-4 text-[var(--pink)]" />
          {todayLabel}
        </div>
      </div>

      {/* 5 métricas */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Pacientes totales"
          value={stats.totalPatients}
          hint={`↑ ${stats.newPatients} este mes`}
          icon={Users}
          tone="pink"
        />
        <MetricCard
          label="Turnos esta semana"
          value={stats.weekAppointments}
          hint={`${stats.todayAppointments} hoy`}
          icon={CalendarDays}
          tone="sage"
        />
        <MetricCard
          label="Nuevos pacientes"
          value={stats.newPatients}
          hint="↑ este mes"
          icon={Sparkles}
          tone="green"
        />
        <MetricCard
          label="Planes activos"
          value={stats.activePlans}
          hint="Planes alimentarios"
          icon={UtensilsCrossed}
          tone="yellow"
        />
        <MetricCard
          label="Confirmados"
          value={stats.confirmedAppointments}
          hint={`${stats.pendingAppointments} pendientes`}
          icon={TrendingUp}
          tone="cream"
        />
      </div>

      {/* Próximos turnos + Gráfico */}
      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="rounded-[1.5rem]">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold">Próximos turnos</CardTitle>
          </CardHeader>
          <CardContent>
            {list.length ? (
              <>
                <ul>
                  {list.slice(0, 5).map((appt) => (
                    <AppointmentRow
                      key={appt.id}
                      date={appt.appointment_date}
                      start={appt.start_time}
                      end={appt.end_time}
                      name={displayPatientName(appt)}
                      status={appt.status}
                      reason={appt.reason}
                    />
                  ))}
                </ul>
                <Link
                  href="/admin/agenda"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--pink)] hover:underline"
                >
                  Ver agenda completa
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            ) : (
              <EmptyState
                title="Sin próximos turnos"
                description="Cuando haya reservas, aparecerán aquí."
              />
            )}
          </CardContent>
        </Card>

        <Card className="rounded-[1.5rem]">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base font-bold">
              Gráfico de pacientes
            </CardTitle>
            <span className="rounded-full bg-[var(--pink-mist)] px-3 py-1 text-xs font-semibold text-[var(--pink)]">
              Últimos 6 meses
            </span>
          </CardHeader>
          <CardContent>
            {stats.patientsByMonth.some((p) => p.total > 0) ? (
              <DashboardPatientsChart data={stats.patientsByMonth} />
            ) : (
              <p className="py-10 text-center text-sm text-[var(--muted)]">
                Todavía no hay pacientes registrados.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Acciones + Recordatorios + Motivacional */}
      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr_0.85fr]">
        <Card className="rounded-[1.5rem]">
          <CardHeader>
            <CardTitle className="text-base font-bold">Acciones rápidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-3 xl:grid-cols-5">
              <QuickAction
                href="/admin/pacientes"
                label="Nuevo paciente"
                icon={UserPlus}
                tone="bg-[var(--sage-soft)] text-[var(--green)]"
              />
              <QuickAction
                href="/admin/agenda"
                label="Nuevo turno"
                icon={CalendarPlus}
                tone="bg-[var(--pink-mist)] text-[var(--pink)]"
              />
              <QuickAction
                href="/admin/planes"
                label="Nuevo plan"
                icon={UtensilsCrossed}
                tone="bg-[var(--yellow-soft)] text-[#9a6f10]"
              />
              <QuickAction
                href="/admin/archivos"
                label="Subir archivo"
                icon={Upload}
                tone="bg-[#fff1ec] text-[var(--pink)]"
              />
              <QuickAction
                href="/admin/historias"
                label="Historias"
                icon={FileHeart}
                tone="bg-[#e5efd5] text-[var(--green-deep)]"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.5rem]">
          <CardHeader>
            <CardTitle className="text-base font-bold">Recordatorios</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {[
              {
                href: "/admin/historias",
                label: "Revisá historias clínicas pendientes",
                icon: FileHeart,
                tone: "bg-[var(--sage-soft)] text-[var(--green)]",
              },
              {
                href: "/admin/agenda",
                label: `${stats.pendingAppointments} turnos pendientes de confirmar`,
                icon: Clock3,
                tone: "bg-[var(--yellow-soft)] text-[#9a6f10]",
              },
              {
                href: "/admin/backups",
                label: "Backup recomendado",
                icon: DatabaseBackup,
                tone: "bg-[var(--pink-mist)] text-[var(--pink)]",
              },
            ].map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--background)] px-3 py-3 transition hover:bg-white hover:shadow-sm"
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.tone}`}
                >
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="flex-1 text-sm font-medium text-[var(--foreground)]">
                  {item.label}
                </span>
                <ChevronRight className="h-4 w-4 text-[var(--muted)]" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <div className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-[var(--sage-soft)] via-[#f3f9eb] to-[var(--yellow-soft)] p-6 shadow-[var(--shadow-soft)]">
          <Leaf className="absolute -right-2 top-4 h-16 w-16 text-[var(--green)]/25" />
          <Heart className="mb-4 h-6 w-6 fill-[var(--pink)] text-[var(--pink)]" />
          <p
            className="text-xl font-semibold leading-snug text-[var(--foreground)]"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            Cada pequeño cambio cuenta
          </p>
          <div className="mt-6">
            <BrandLogo className="h-8 w-auto" />
          </div>
        </div>
      </div>

      <footer className="flex flex-col items-center justify-between gap-2 border-t border-[var(--border)] pt-5 text-center text-xs text-[var(--muted)] sm:flex-row sm:text-left">
        <p>
          © {new Date().getFullYear()} Pamela Guerrero · Consultorio de Nutrición
        </p>
        <p>Hecho con 💚 para nutricionistas</p>
      </footer>
    </div>
  );
}
