"use client";

import dynamic from "next/dynamic";

/**
 * Client-only loader so recharts is not pulled into the RSC dashboard path.
 * `ssr: false` is not allowed directly in Server Components.
 */
export const DashboardClinicChart = dynamic(
  () =>
    import("@/components/admin/dashboard-chart").then(
      (m) => m.DashboardClinicChart
    ),
  {
    ssr: false,
    loading: () => <div className="h-64 w-full animate-pulse rounded-xl bg-[var(--surface-muted)]" />,
  }
);
