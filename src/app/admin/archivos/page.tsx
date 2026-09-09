import { redirect } from "next/navigation";

/** El apartado Archivos se retiró del panel. */
export default function ArchivosPage() {
  redirect("/admin");
}
