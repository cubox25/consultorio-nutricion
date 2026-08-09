import type { Metadata } from "next";
import { ClinicsManager } from "@/components/admin/clinics-manager";

export const metadata: Metadata = {
  title: "Consultorios",
  description: "Gestión de consultorios y horarios",
};

export default function ConsultoriosPage() {
  return <ClinicsManager />;
}
