import { expect, type Page, test } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const ADMIN_STORAGE = resolve(process.cwd(), "e2e/.auth/admin.json");

export function requireStaffCredentials(): { email: string; password: string } {
  const email = process.env.E2E_ADMIN_EMAIL?.trim();
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) {
    test.skip(
      true,
      "Definí E2E_ADMIN_EMAIL y E2E_ADMIN_PASSWORD en .env.local para probar el admin."
    );
    throw new Error("Credenciales E2E no configuradas");
  }
  return { email, password };
}

export async function loginAsStaff(page: Page) {
  const { email, password } = requireStaffCredentials();

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Ingresar" }).click();

  try {
    await page.waitForURL(/\/admin(\/)?(\?.*)?$/, { timeout: 25_000 });
  } catch {
    const stillOnLogin = /\/login/.test(page.url());
    if (stillOnLogin) {
      const body = await page.locator("body").innerText();
      throw new Error(
        `No se pudo iniciar sesión. Revisá email/contraseña o permisos staff. Pantalla: ${body.slice(0, 200)}`
      );
    }
    throw new Error(`Login inesperado. URL actual: ${page.url()}`);
  }

  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}

export async function ensureAdminStorageState(browser: import("@playwright/test").Browser) {
  requireStaffCredentials();
  if (existsSync(ADMIN_STORAGE)) return;

  mkdirSync(dirname(ADMIN_STORAGE), { recursive: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAsStaff(page);
  await context.storageState({ path: ADMIN_STORAGE });
  await context.close();
}

/** Visita una ruta del admin y verifica que no haya error 500 ni pantalla vacía. */
export async function expectAdminPageOk(page: Page, path: string, heading: RegExp | string) {
  const res = await page.goto(path);
  expect(res?.status(), `HTTP ${path}`).toBeLessThan(400);

  if (typeof heading === "string") {
    await expect(
      page.getByRole("heading", { name: heading, exact: false }).first()
    ).toBeVisible();
  } else {
    await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText(heading);
  }

  await expect(page.locator("body")).not.toContainText("Application error");
  await expect(page.locator("body")).not.toContainText("Internal Server Error");
}
