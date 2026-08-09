import type { Metadata } from "next";
import { AgendaManager } from "@/components/admin/agenda-manager";

export const metadata: Metadata = {
  title: "Agenda",
  description: "Gestión de turnos del consultorio",
};

export default function AgendaPage() {
  return <AgendaManager />;
}
