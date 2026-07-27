import { test, expect } from "@playwright/test";

const DEMO_PASSWORD = "Coil2026!";

test("giriş yapılmadan korumalı sayfa login'e yönlendirir", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("satınalma uzmanı giriş yapar ve dashboard'u görür", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill("satinalma@coilpartners.com");
  await page.getByLabel("Parola").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Giriş Yap" }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15000 });
  await expect(page.getByText("Son Talepler")).toBeVisible();
});

test("hatalı parola reddedilir", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill("satinalma@coilpartners.com");
  await page.getByLabel("Parola").fill("yanlisparola");
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page.getByText(/hatalı/i)).toBeVisible();
});

test("tedarikçi magic-link geçersiz token reddeder", async ({ page }) => {
  await page.goto("/teklif/gecersiz-token-123");
  await expect(page.getByRole("heading", { name: "Bağlantı Açılamadı" })).toBeVisible();
});

test("tedarikçi magic-link EN dil değiştirme çalışır", async ({ page }) => {
  await page.goto("/teklif/gecersiz-token-123?lang=en");
  await expect(page.getByText(/Link Could Not Be Opened/i)).toBeVisible();
});
