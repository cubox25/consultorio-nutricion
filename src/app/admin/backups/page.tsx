import type { Metadata } from "next";
import { BackupsManager } from "@/components/admin/backups-manager";

export const metadata: Metadata = {
  title: "Backups",
  description: "Respaldos y exportación de datos del consultorio",
};

export default function BackupsPage() {
  return <BackupsManager />;
}
