import { PatientDetail } from "@/components/admin/patient-detail";

export const metadata = {
  title: "Ficha del paciente",
};

export default async function PacienteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PatientDetail patientId={id} />;
}
