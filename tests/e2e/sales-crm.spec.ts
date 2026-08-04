import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Sales CRM & CPQ uçtan uca:
 * müşteri (seed) → RFQ oluştur → Teklife dönüştür → CPQ teknik parametre + tutar
 * + LME referansı → revizyon artır → PDF (TR/EN) indir → Kanban görünümü.
 * satinalma@ = Satınalma Uzmanı (sales.view + sales.manage).
 */
const PW = "Coil2026!";
const prisma = new PrismaClient();

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola", { exact: true }).fill(PW);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
}

/** Hidrasyon yarışına karşı: buton tıkla → URL değişimini bekle, olmazsa tekrar dene. */
async function clickUntilNav(page: Page, name: RegExp | string, urlRe: RegExp) {
  const btn = page.getByRole("button", { name });
  await expect(btn).toBeVisible();
  for (let i = 0; i < 4; i++) {
    await btn.click({ timeout: 5000 }).catch(() => {});
    try { await page.waitForURL(urlRe, { timeout: 8000 }); return; } catch { /* retry */ }
  }
  throw new Error(`Navigation to ${urlRe} did not happen after clicking ${name}`);
}

test.afterAll(async () => { await prisma.$disconnect(); });

test("Sales CRM E2E: RFQ → Teklif → CPQ → revizyon → PDF → Kanban", async ({ page }) => {
  test.setTimeout(150000);
  const stamp = Date.now();

  const user = await prisma.user.findFirst({ where: { email: "satinalma@coilpartners.com" } });
  expect(user, "seed kullanıcısı satinalma@ bulunmalı").toBeTruthy();
  const custName = `E2E Müşteri ${stamp}`;
  const customer = await prisma.customer.create({
    data: { tenantId: user!.tenantId, code: `E2E-${stamp}`, name: custName, country: "TR", defaultCurrency: "EUR", createdById: user!.id },
  });

  await login(page, "satinalma@coilpartners.com");

  // 1) RFQ oluştur (UI)
  await page.goto("/sales/rfqs/new");
  const custSelect = page.locator("select").first();
  await expect(custSelect).toBeVisible();
  await custSelect.selectOption({ label: custName });
  await clickUntilNav(page, "Kaydet", /\/sales\/rfqs\/[a-z0-9]{20,}/i);
  const rfqId = page.url().split("/sales/rfqs/")[1]!.split("?")[0]!;

  // 2) Teklife dönüştür
  await clickUntilNav(page, /Teklife Dönüştür/, /\/sales\/offers\/[a-z0-9]{20,}/i);
  const offerId = page.url().split("/sales/offers/")[1]!.split("?")[0]!;
  await expect.poll(async () => (await prisma.salesRFQ.findUnique({ where: { id: rfqId } }))?.status, { timeout: 10000 }).toBe("OFFERED");

  // 3) CPQ teknik parametreler + tutar + (varsa) LME referansı
  await page.getByLabel("Teklif Tutarı").fill("13294,80");
  await page.getByLabel("Manufacturer").fill("Siemens");
  await page.getByLabel("Power (kW/MW)").fill("500");
  const lme = page.getByLabel("Onaylı LME Kaydı");
  if ((await lme.locator("option").count()) > 1) await lme.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Kaydet" }).click();
  await expect(page.getByText("Kaydedildi.")).toBeVisible({ timeout: 15000 });
  await expect.poll(async () => (await prisma.salesOffer.findUnique({ where: { id: offerId } }))?.totalAmount, { timeout: 10000 }).toMatch(/13294\.8/);
  await expect.poll(async () => (await prisma.salesOfferTechnicalDetail.findUnique({ where: { offerId } }))?.manufacturer, { timeout: 10000 }).toBe("Siemens");

  // 4) Revizyon (confirm dialog kabul)
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /Revize Et/ }).click();
  await expect.poll(async () => (await prisma.salesOffer.findUnique({ where: { id: offerId } }))?.revisionNo, { timeout: 10000 }).toBe(1);

  // 5) PDF indirme (TR + EN)
  const trPdf = await page.request.get(`/sales/offers/${offerId}/pdf?lang=tr`);
  expect(trPdf.status()).toBe(200);
  expect(trPdf.headers()["content-type"]).toContain("application/pdf");
  const enPdf = await page.request.get(`/sales/offers/${offerId}/pdf?lang=en`);
  expect(enPdf.status()).toBe(200);
  expect((await enPdf.body()).length).toBeGreaterThan(1000);

  // 6) Kanban görünümü render olmalı (Kanban'a özgü ipucu metni + sürüklenebilir kart)
  await page.goto("/sales/rfqs?view=kanban");
  await expect(page.getByText(/Kartları sürükleyip/)).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[draggable="true"]').first()).toBeVisible({ timeout: 15000 });

  // Temizlik (test verisini geri al)
  await prisma.salesOfferNote.deleteMany({ where: { offerId } });
  await prisma.salesOfferTechnicalDetail.deleteMany({ where: { offerId } });
  await prisma.salesOffer.deleteMany({ where: { id: offerId } });
  await prisma.salesRFQ.deleteMany({ where: { id: rfqId } });
  await prisma.customer.deleteMany({ where: { id: customer.id } });
});
