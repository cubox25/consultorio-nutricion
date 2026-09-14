"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Recarga solo el dashboard sin perder la sesión. */
export function DashboardRetryButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <Button
      type="button"
      loading={loading}
      onClick={() => {
        setLoading(true);
        router.refresh();
        // Si el RSC tarda, el loading del layout cubre; reset por si no remonta.
        window.setTimeout(() => setLoading(false), 4000);
      }}
    >
      <RefreshCw className="h-4 w-4" />
      Reintentar
    </Button>
  );
}
