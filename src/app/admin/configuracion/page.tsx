import type { Metadata } from "next";
import { SettingsManager } from "@/components/admin/settings-manager";

export const metadata: Metadata = {
  title: "Configuración",
  description: "Perfil, políticas de turnos, notificaciones y sistema",
};

export default function ConfiguracionPage() {
  return <SettingsManager />;
}
