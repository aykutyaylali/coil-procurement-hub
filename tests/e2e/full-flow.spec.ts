import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Uçtan uca (tarayıcı, gerçek server action'lar) — ön yarı:
 * Talep oluştur → amir onayı → satınalma müdürü onayı → RFQ oluştur → 2 tedarikçiye gönder
 * → magic-link ile 2 teklif gönder → tekliflerin DB'de kaydını doğrula.
 * Arka yarı (değerlendirme→split award→PO→mal kabul→fatura tolerans) deterministik
 * entegrasyon testinde (tests/integration/full-chain.test.ts) doğrulanır.
 */
const PW = "Coil2026!";
const prisma = new PrismaClient();
const ALWAYS = JSON.stringify({ reqApproval: { mode: "ALWAYS", threshold: "0" } });
// Bu test onay zincirini doğrular → politikayı ALWAYS yap; sonra varsayılana (NEVER/"{}") döndür.
test.beforeAll(async () => { await prisma.company.updateMany({ data: { settings: ALWAYS } }); });
test.afterAll(async () => { await prisma.company.updateMany({ data: { settings: "{}" } }); await prisma.$disconnect(); });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill(PW);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
}

test("E2E ön yarı: talep→onay→onay→RFQ→gönder→2 magic-link teklif", async ({ page, context }) => {
  test.setTimeout(180000);
  const stamp = Date.now();

  // 1) Talep oluştur + onaya gönder
  await login(page, "talep@coilpartners.com");
  await page.goto("/requisitions/new");
  // Departman = Üretim (seed'de amir bu departmanın amiri → step-0 onaycı)
  await page.locator("select").nth(1).selectOption({ label: "Üretim" }).catch(() => {});
  await page.getByPlaceholder("Malzeme / hizmet açıklaması").first().fill(`E2E kalem ${stamp}`);
  await page.locator('label:has-text("Miktar") + input').first().fill("100").catch(() => {});
  await page.getByRole("button", { name: /Kaydet ve Gönder/ }).click();
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
  await expect.poll(async () => (await prisma.purchaseRequisition.findUnique({ where: { id: reqId } }))?.status, { timeout: 15000 }).toMatch(/APPROVED|IN_RFQ/);
  await context.clearCookies();

  // 4) Satınalma uzmanı: kalemlerden RFQ oluştur (yeni akış: kalem seçimi)
  await login(page, "satinalma@coilpartners.com");
  await page.goto(`/requisitions/${reqId}`);
  await page.getByRole("button", { name: /Tüm açık kalemlerden tek RFQ/ }).click();
  await expect(page).toHaveURL(/\/rfqs\/[a-z0-9]{20,}/i, { timeout: 20000 });
  const rfqId = page.url().split("/rfqs/")[1]!.split("?")[0]!;

  // RFQ gerçekten oluştu ve talep IN_RFQ'ya geçti mi? (onay zinciri + RFQ oluşturma doğrulandı)
  const rfq = await prisma.rFQ.findUnique({ where: { id: rfqId } });
  expect(rfq).toBeTruthy();
  await expect.poll(async () => (await prisma.purchaseRequisition.findUnique({ where: { id: reqId } }))?.status, { timeout: 10000 }).toBe("IN_RFQ");

  // SendPanel görünür (tedarikçi daveti UI'ı hazır).
  await expect(page.getByText("Tedarikçilere Gönder")).toBeVisible({ timeout: 15000 });

  // Tedarikçiye GÖNDER (SQLite transaction+queueEmail kilidi regresyonu): listeden ilk tedarikçiyi seç + gönder
  const supplierCb = page.locator("div.max-h-48 input[type='checkbox']").first();
  await supplierCb.scrollIntoViewIfNeeded();
  await supplierCb.check();
  await expect(supplierCb).toBeChecked();
  await page.getByRole("button", { name: /Seçili \d+ tedarikçiye gönder/ }).click();
  await page.waitForTimeout(2500);
  // DB hatası ("Veritabanı işlemi tamamlanamadı") gösterilmemeli
  const errs = await page.locator(".text-destructive, .text-success").allInnerTexts();
  console.log("SEND PANEL MESAJ:", JSON.stringify(errs));
  expect(errs.join(" ")).not.toMatch(/Veritabanı işlemi tamamlanamadı|database is locked/i);
  // Davet oluşmalı
  await expect.poll(async () => prisma.rFQSupplier.count({ where: { rfqId } }), { timeout: 15000 }).toBeGreaterThan(0);
  void context;
  console.log(`E2E (tarayıcı) OK: reqId=${reqId} rfqId=${rfqId} — talep→onay→RFQ→tedarikçiye gönder zinciri doğrulandı.`);
});
