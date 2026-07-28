import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Talep kalemlerini AYRI RFQ'lara bölme (farklı tedarikçiler için).
 * Bir talepte 2 kalem → kalem 1'den bir RFQ, kalem 2'den başka bir RFQ.
 * İzole: global onay politikasını değiştirmez; gerçek onay zincirini kullanır.
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

test("bir talebin farklı kalemlerinden ayrı RFQ'lar oluşturulur", async ({ page, context }) => {
  test.setTimeout(180000);

  // 1) Talep Sahibi: 2 kalemli talep (Üretim departmanı → amir onaycı) + onaya gönder
  await login(page, "talep@coilpartners.com");
  await page.goto("/requisitions/new");
  await page.locator("select").nth(1).selectOption({ label: "Üretim" }).catch(() => {});
  const desc = page.locator('label:has-text("Açıklama") + input');
  await desc.first().fill("Hırdavat: Civata M8 x100");
  await page.locator('label:has-text("Miktar") + input').first().fill("100");
  await page.getByRole("button", { name: /Kalem Ekle/ }).click();
  await desc.nth(1).fill("Bakır tel emaye 2.5mm");
  await page.locator('label:has-text("Miktar") + input').nth(1).fill("50");
  await page.getByRole("button", { name: /Kaydet ve Onaya Gönder/ }).click();
  await expect(page).toHaveURL(/\/requisitions\/[a-z0-9]{20,}/i, { timeout: 20000 });
  const reqId = page.url().split("/requisitions/")[1]!.split("?")[0]!;
  await expect.poll(async () => (await prisma.purchaseRequisition.findUnique({ where: { id: reqId } }))?.status, { timeout: 15000 }).toBe("PENDING_APPROVAL");
  await context.clearCookies();

  // 2) Amir onayı
  await login(page, "amir@coilpartners.com");
  await page.goto(`/requisitions/${reqId}`);
  await page.getByRole("button", { name: "Onayla" }).first().click();
  await page.waitForTimeout(1200);
  await context.clearCookies();

  // 3) Satınalma müdürü onayı → APPROVED
  await login(page, "satinalma.md@coilpartners.com");
  await page.goto(`/requisitions/${reqId}`);
  await page.getByRole("button", { name: "Onayla" }).first().click().catch(() => {});
  await expect.poll(async () => (await prisma.purchaseRequisition.findUnique({ where: { id: reqId } }))?.status, { timeout: 15000 }).toBe("APPROVED");
  await context.clearCookies();

  // 4) Satınalma uzmanı: 1. kalemden RFQ
  await login(page, "satinalma@coilpartners.com");
  await page.goto(`/requisitions/${reqId}`);
  await page.locator('input[aria-label="Kalem 1 seç"]').check();
  await page.getByRole("button", { name: /Seçili kalemlerden RFQ oluştur/ }).first().click();
  await expect(page).toHaveURL(/\/rfqs\/[a-z0-9]{20,}/i, { timeout: 20000 });
  const rfq1 = page.url().split("/rfqs/")[1]!.split("?")[0]!;

  // 5) Talebe dön: 2. kalemden ikinci RFQ
  await page.goto(`/requisitions/${reqId}`);
  await page.locator('input[aria-label="Kalem 2 seç"]').check();
  await page.getByRole("button", { name: /Seçili kalemlerden RFQ oluştur/ }).first().click();
  await expect(page).toHaveURL(/\/rfqs\/[a-z0-9]{20,}/i, { timeout: 20000 });
  const rfq2 = page.url().split("/rfqs/")[1]!.split("?")[0]!;

  // 6) Doğrula: iki farklı RFQ, her biri tek kalem; talep kalemleri IN_RFQ
  expect(rfq1).not.toBe(rfq2);
  expect(await prisma.rFQLine.count({ where: { rfqId: rfq1 } })).toBe(1);
  expect(await prisma.rFQLine.count({ where: { rfqId: rfq2 } })).toBe(1);
  expect(await prisma.requisitionLine.count({ where: { requisitionId: reqId, status: "OPEN" } })).toBe(0);
});
