import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Stage G denetiminde bulunan iki liste-only boşluğun gerçekten kapandığını
 * uçtan uca doğrular: Tedarikçi oluşturma (satınalma müdürü) ve Kullanıcı
 * oluşturma (sistem yöneticisi). Her ikisi de gerçek server action + DB yazımı.
 */
const PW = "Coil2026!";
const prisma = new PrismaClient();
test.afterAll(async () => { await prisma.$disconnect(); });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill(PW);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
}

test("Tedarikçi oluşturma (satınalma müdürü) — form → detay → DB", async ({ page }) => {
  test.setTimeout(90000);
  const name = `E2E Tedarikçi ${Date.now()}`;
  await login(page, "satinalma.md@coilpartners.com");
  await page.goto("/suppliers/new");
  // Label hemen Input'u takip eder (bitişik kardeş); global arama kutusuna değil Ünvan alanına yaz
  await page.locator('label:has-text("Ünvan") + input').fill(name);
  await page.getByRole("button", { name: "Tedarikçi Oluştur" }).click();
  await expect(page).toHaveURL(/\/suppliers\/[a-z0-9]{20,}/i, { timeout: 20000 });
  const id = page.url().split("/suppliers/")[1]!.split("?")[0]!;
  const s = await prisma.supplier.findUnique({ where: { id } });
  expect(s?.legalName).toBe(name);
  expect(s?.code).toMatch(/^TED-/);
  await expect(page.getByText(name).first()).toBeVisible();
});

test("Kullanıcı oluşturma (sistem yöneticisi) — form → liste → DB", async ({ page }) => {
  test.setTimeout(90000);
  const stamp = Date.now();
  const email = `e2e.user.${stamp}@coilpartners.com`;
  await login(page, "admin@coilpartners.com");
  await page.goto("/admin/users/new");
  await page.locator('label:has-text("Ad Soyad") + input').fill(`E2E Kullanıcı ${stamp}`);
  await page.locator('label:has-text("E-posta") + input').fill(email);
  await page.locator('label:has-text("Parola") + input').fill("GecerliParola123");
  // En az bir rol seç (checkbox etiketi)
  await page.getByText("Talep Sahibi", { exact: true }).click();
  await page.getByRole("button", { name: "Kullanıcı Oluştur" }).click();
  await expect(page).toHaveURL(/\/admin\/users$/, { timeout: 20000 });
  const u = await prisma.user.findFirst({ where: { email }, include: { userRoles: true } });
  expect(u).toBeTruthy();
  expect(u?.passwordHash).toBeTruthy();
  expect(u?.userRoles.length ?? 0).toBeGreaterThanOrEqual(1);
});
