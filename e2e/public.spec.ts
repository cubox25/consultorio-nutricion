import { expect, test } from "@playwright/test";

test.describe("Sitio público", () => {
  test("inicio carga", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator("body")).not.toContainText("Application error");
  });

  test("turnos carga", async ({ page }) => {
    const res = await page.goto("/turnos");
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1, name: /Reservá tu turno/i })).toBeVisible();
  });

  test("login carga", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Contraseña")).toBeVisible();
  });
});

test.describe("API pública", () => {
  test("availability exige clinicId", async ({ request }) => {
    const res = await request.get("/api/availability");
    expect(res.status()).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/clinicId/i);
  });

  test("booking confirm exige id y dni", async ({ request }) => {
    const res = await request.post("/api/booking/confirm", {
      data: {},
    });
    expect(res.status()).toBe(400);
  });
});
