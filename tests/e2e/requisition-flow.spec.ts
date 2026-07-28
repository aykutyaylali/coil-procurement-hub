import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Talep taslak/gönderim akışı — tarayıcı regresyonu.
 * Senaryolar: 1 (taslak eksik açıklama), 2 (DRAFT), 3 (gönderilemez), 4 (dostça TR hata),
 * 6 (açıklama dolunca gönderilir), 7 (tek approval instance), 9 (form korunur), 10 (ham hata yok), 11 (pagination).
 */
const PW = "Coil2026!";
const prisma = new PrismaClient();
// Varsayılan (NEVER) politika: talep gönderince onaya gitmez, doğrudan APPROVED olur.
test.beforeAll(async () => { await prisma.company.updateMany({ data: { settings: "{}" } }); });
test.afterAll(async () => { await prisma.$disconnect(); });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill(PW);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
}

function looksRaw(texts: string[]) {
  return texts.some((t) => /\{|\[|"code"|"path"|zoderror|prisma|object Object/i.test(t));
}

test("1-2) eksik açıklamayla TASLAK kaydedilir ve DRAFT olur", async ({ page }) => {
  test.setTimeout(90000);
  await login(page, "talep@coilpartners.com");
  await page.goto("/requisitions/new");
  await page.locator('label:has-text("Miktar") + input').first().fill("5");
  await page.getByRole("button", { name: "Taslak Kaydet" }).click();
  await expect(page).toHaveURL(/\/requisitions\/[a-z0-9]{20,}/i, { timeout: 20000 });
  const id = page.url().split("/requisitions/")[1]!.split("?")[0]!;
  const req = await prisma.purchaseRequisition.findUnique({ where: { id } });
  expect(req?.status).toBe("DRAFT");
});

test("3-4-9-10) eksik açıklamayla ONAYA GÖNDERİLEMEZ; dostça TR hata; form korunur; ham hata yok", async ({ page }) => {
  test.setTimeout(90000);
  await login(page, "talep@coilpartners.com");
  await page.goto("/requisitions/new");
  // Miktar + gerekçe doldur ama açıklamayı boş bırak
  await page.locator('label:has-text("Miktar") + input').first().fill("7");
  await page.getByPlaceholder("Talebin gerekçesi").fill("Acil üretim ihtiyacı");
  await page.getByRole("button", { name: /Kaydet ve Gönder/ }).click();
  await page.waitForTimeout(1500);

  // Gönderilmedi (sayfada kaldı)
  expect(page.url()).toContain("/requisitions/new");
  // Dostça hata metni (ham JSON/kod yok)
  const errTexts = await page.locator(".text-destructive").allInnerTexts();
  expect(errTexts.length).toBeGreaterThan(0);
  expect(looksRaw(errTexts)).toBe(false);
  expect(errTexts.join(" ")).toMatch(/açıklama|kalem/i);
  // Form değerleri korundu
  await expect(page.getByPlaceholder("Talebin gerekçesi")).toHaveValue("Acil üretim ihtiyacı");
  await expect(page.locator('label:has-text("Miktar") + input').first()).toHaveValue("7");
});

test("6) açıklama dolunca GÖNDERİLİR; varsayılan NEVER ile onaysız APPROVED (approval instance yok)", async ({ page, context }) => {
  test.setTimeout(120000);
  await login(page, "talep@coilpartners.com");
  await page.goto("/requisitions/new");
  await page.locator('label:has-text("Açıklama") + input').first().fill("Rulman 6204");
  await page.locator('label:has-text("Miktar") + input').first().fill("20");
  await page.getByRole("button", { name: /Kaydet ve Gönder/ }).click();
  await expect(page).toHaveURL(/\/requisitions\/[a-z0-9]{20,}/i, { timeout: 20000 });
  const id = page.url().split("/requisitions/")[1]!.split("?")[0]!;

  // Varsayılan politika NEVER → doğrudan APPROVED, onay süreci başlamaz
  await expect.poll(async () => (await prisma.purchaseRequisition.findUnique({ where: { id } }))?.status, { timeout: 15000 }).toBe("APPROVED");
  const instances = await prisma.approvalInstance.count({ where: { documentType: "REQUISITION", documentId: id } });
  expect(instances).toBe(0);
  void context;
});

test("11) talep listesi sayfalama ile çalışır", async ({ page }) => {
  test.setTimeout(60000);
  await login(page, "satinalma@coilpartners.com");
  await page.goto("/requisitions");
  // Sayfalama çubuğu görünür (kayıt sayısı metni)
  await expect(page.getByText(/kayıt/)).toBeVisible({ timeout: 15000 });
});
