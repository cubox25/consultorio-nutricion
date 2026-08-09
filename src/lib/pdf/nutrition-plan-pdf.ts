import { jsPDF } from "jspdf";
import type { NutritionPlan, Patient } from "@/types";
import { formatDate, fullName } from "@/lib/utils";

function addSection(
  doc: jsPDF,
  title: string,
  body: string | null | undefined,
  y: number,
  margin: number,
  maxWidth: number
) {
  if (!body?.trim()) return y;

  const pageHeight = doc.internal.pageSize.getHeight();
  const lineHeight = 5.5;

  if (y > pageHeight - 30) {
    doc.addPage();
    y = margin;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(45, 106, 79);
  doc.text(title, margin, y);
  y += 6;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(28, 43, 34);
  const lines = doc.splitTextToSize(body.trim(), maxWidth) as string[];

  for (const line of lines) {
    if (y > pageHeight - 20) {
      doc.addPage();
      y = margin;
    }
    doc.text(line, margin, y);
    y += lineHeight;
  }

  return y + 4;
}

export function generateNutritionPlanPdf(
  plan: NutritionPlan,
  patient?: Patient | null,
  options?: { professionalName?: string; siteName?: string }
) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 18;
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - margin * 2;
  let y = margin;

  const siteName = options?.siteName ?? "Consultorio de Nutrición";
  const professional = options?.professionalName ?? "Lic. Nutrición";
  const patientName = patient
    ? fullName(patient.first_name, patient.last_name)
    : "Paciente";

  doc.setFillColor(45, 106, 79);
  doc.rect(0, 0, pageWidth, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(siteName, margin, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Plan alimentario", margin, 20);

  y = 38;
  doc.setTextColor(28, 43, 34);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(plan.title || "Plan alimentario", margin, y);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(`Paciente: ${patientName}`, margin, y);
  y += 5;
  doc.text(`Fecha del plan: ${formatDate(plan.plan_date)}`, margin, y);
  y += 5;
  doc.text(`Profesional: ${professional}`, margin, y);
  y += 10;

  doc.setDrawColor(215, 227, 219);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  y = addSection(doc, "Objetivo", plan.objective, y, margin, maxWidth);
  y = addSection(doc, "Descripción", plan.description, y, margin, maxWidth);
  y = addSection(doc, "Desayuno", plan.breakfast, y, margin, maxWidth);
  y = addSection(doc, "Media mañana", plan.mid_morning, y, margin, maxWidth);
  y = addSection(doc, "Almuerzo", plan.lunch, y, margin, maxWidth);
  y = addSection(doc, "Merienda", plan.snack, y, margin, maxWidth);
  y = addSection(doc, "Cena", plan.dinner, y, margin, maxWidth);
  y = addSection(doc, "Extras", plan.extras, y, margin, maxWidth);
  y = addSection(doc, "Recomendaciones", plan.recommendations, y, margin, maxWidth);
  addSection(doc, "Observaciones", plan.observations, y, margin, maxWidth);

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140, 140, 140);
    doc.text(
      `${siteName} · Página ${i} de ${pageCount}`,
      margin,
      doc.internal.pageSize.getHeight() - 10
    );
  }

  return doc;
}

export function downloadNutritionPlanPdf(
  plan: NutritionPlan,
  patient?: Patient | null,
  options?: { professionalName?: string; siteName?: string }
) {
  const doc = generateNutritionPlanPdf(plan, patient, options);
  const safeTitle = (plan.title || "plan")
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñ]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  doc.save(`plan-${safeTitle || "alimentario"}-${plan.plan_date}.pdf`);
  return doc;
}

export function nutritionPlanPdfBlob(
  plan: NutritionPlan,
  patient?: Patient | null,
  options?: { professionalName?: string; siteName?: string }
) {
  return generateNutritionPlanPdf(plan, patient, options).output("blob");
}
