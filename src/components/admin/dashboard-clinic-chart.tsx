"use client";

import dynamic from "next/dynamic";

const loading = () => (
  <div className="h-64 w-full animate-pulse rounded-xl bg-[var(--pink-mist)]" />
);

export const DashboardPatientsChart = dynamic(
  () =>
    import("@/components/admin/dashboard-chart").then(
      (m) => m.DashboardPatientsChart
    ),
  { ssr: false, loading }
);

/** @deprecated alias */
export const DashboardClinicChart = DashboardPatientsChart;
