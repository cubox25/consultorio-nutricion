import { test } from "@playwright/test";
import { expectAdminPageOk, loginAsStaff, requireStaffCredentials } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

test.describe("Admin", () => {
  test.beforeEach(async ({ page }) => {
    requireStaffCredentials();
    await loginAsStaff(page);
  });

  const pages: { path: string; heading: RegExp | string }[] = [
    { path: "/admin", heading: /Hola/i },
    { path: "/admin/pacientes", heading: "Pacientes" },
    { path: "/admin/agenda", heading: "Agenda" },
    { path: "/admin/antropometria", heading: "Antropometría" },
    { path: "/admin/historias", heading: "Historias clínicas" },
    { path: "/admin/archivos", heading: "Archivos" },
    { path: "/admin/configuracion", heading: "Configuración" },
    { path: "/admin/consultorios", heading: "Consultorios" },
    { path: "/admin/whatsapp", heading: "WhatsApp" },
    { path: "/admin/backups", heading: "Backups" },
  ];

  for (const { path, heading } of pages) {
    test(`carga ${path}`, async ({ page }) => {
      await expectAdminPageOk(page, path, heading);
    });
  }

  test("ficha de paciente (opcional E2E_PATIENT_ID)", async ({ page }) => {
    const patientId = process.env.E2E_PATIENT_ID?.trim();
    test.skip(!patientId, "Definí E2E_PATIENT_ID para probar la ficha de un paciente.");

    await expectAdminPageOk(page, `/admin/pacientes/${patientId}`, "Ficha del paciente");
  });
});
