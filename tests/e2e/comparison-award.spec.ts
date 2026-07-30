import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Teklif karşılaştırma + 2 aşamalı karar (gerçek tıklamalar):
 * 2 tedarikçiden farklı para birimlerinde teklif → kalem bazlı split seçim →
 * gerekçe → Karar Özeti → onay modalı → 2 sipariş oluşur.
 */
const PW = "Coil2026!";
const prisma = new PrismaClient();
let rfqId = "";

let reqId = "";
test.beforeAll(async () => {
  const t = await prisma.tenant.findFirst();
  const co = await prisma.company.findFirst({ where: { tenantId: t!.id } });
  const admin = await prisma.user.findFirst({ where: { email: "admin@coilpartners.com" } });
  const sups = await prisma.supplier.findMany({ where: { tenantId: t!.id }, take: 2 });
  // Talep + kalemler (RFQ'ya bağlanacak — award sonrası talep ORDERED olmalı)
  const req = await prisma.purchaseRequisition.create({
    data: {
      tenantId: t!.id, number: "REQT-" + Date.now(), companyId: co!.id, requesterId: admin!.id, status: "IN_RFQ",
      priority: "NORMAL", purchaseType: "GOODS", operationType: "IMPORT_PURCHASE", currency: "USD",
      lines: { create: [{ lineNo: 1, description: "Test Rulman AA", quantity: "100", uom: "AD", status: "IN_RFQ" }, { lineNo: 2, description: "Test Bakir BB", quantity: "50", uom: "KG", status: "IN_RFQ" }] },
    },
    include: { lines: true },
  });
  reqId = req.id;
  const rfq = await prisma.rFQ.create({
    data: {
      tenantId: t!.id, number: "CMPT-" + Date.now(), companyId: co!.id, title: "Karar testi",
      status: "OPEN", operationType: "IMPORT_PURCHASE", currencyOptions: JSON.stringify(["USD", "EUR"]),
      dueAt: new Date(Date.now() + 7 * 864e5), createdById: admin!.id,
      lines: { create: req.lines.map((rl, j) => ({ lineNo: j + 1, description: rl.description, quantity: rl.quantity, uom: rl.uom, requisitionId: req.id, requisitionLineId: rl.id })) },
    },
    include: { lines: true },
  });
  rfqId = rfq.id;
  for (const [i, s] of sups.entries()) {
    const rs = await prisma.rFQSupplier.create({ data: { rfqId: rfq.id, supplierId: s.id, tokenHash: "tk" + Date.now() + i, tokenExpiresAt: new Date(Date.now() + 7 * 864e5), replyToken: "rt" + i + Date.now(), status: "RESPONDED", respondedAt: new Date() } });
    await prisma.bid.create({ data: { rfqId: rfq.id, rfqSupplierId: rs.id, supplierId: s.id, status: "SUBMITTED", currency: i === 0 ? "USD" : "EUR", source: i === 0 ? "PORTAL" : "MANUAL", paymentTermDays: 60, submittedAt: new Date(), lines: { create: rfq.lines.map((l, j) => ({ rfqLineId: l.id, willQuote: true, unitPrice: i === 0 ? (j === 0 ? "12" : "8") : (j === 0 ? "13" : "7"), discountPct: "0", taxRate: "0", leadTimeDays: 30, currency: i === 0 ? "USD" : "EUR" })) } } });
  }
});
test.afterAll(async () => { await prisma.$disconnect(); });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill(PW);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
}

test("Karşılaştırma → split seçim → Karar Özeti → 2 sipariş", async ({ page }) => {
  test.setTimeout(120000);
  await login(page, "admin@coilpartners.com");
  await page.goto(`/rfqs/${rfqId}`);
  await expect(page.getByText("Teklif Karşılaştırma").first()).toBeVisible({ timeout: 15000 });

  // Sütun bazlı karşılaştırma + rozet
  await expect(page.getByText("En Düşük Fiyat").first()).toBeVisible();
  await expect(page.getByText("TL Karşılığı").first()).toBeVisible();

  // Split seçim: kalem 1 → tedarikçi 1, kalem 2 → tedarikçi 2
  await page.locator('tr:has-text("Test Rulman AA") button').first().click();
  await page.locator('tr:has-text("Test Bakir BB") button').nth(1).click();

  // Gerekçe + tek/en-düşük açıklamaları (en düşük dışı seçildiyse çıkar)
  await page.getByPlaceholder("Neden bu tedarikçi(ler)?").fill("Teknik uygunluk ve termin");
  const lowestBox = page.getByPlaceholder("En düşük teklifin seçilmeme nedeni");
  if (await lowestBox.count()) await lowestBox.fill("Kalite ve teslim önceliği");

  // Aşama 2: Karar Özeti
  await page.getByRole("button", { name: /Karar Özetine Geç/ }).click();
  await expect(page.getByText("Karar Özeti")).toBeVisible({ timeout: 10000 });

  // Onay modalı → oluştur
  await page.getByRole("button", { name: /Kararı Onayla ve \d+ Sipariş Oluştur/ }).click();
  await page.getByRole("button", { name: /Onayla ve Oluştur/ }).click();

  // 2 sipariş oluşmalı (split award: 2 farklı tedarikçi)
  await expect.poll(async () => prisma.purchaseOrder.count({ where: { rfqId } }), { timeout: 20000 }).toBe(2);
  await expect(page.getByText(/sipariş oluşturuldu/).first()).toBeVisible({ timeout: 10000 });

  // Bağlı TALEP artık "Teklifler toplanıyor"da (IN_RFQ) KALMAMALI → ORDERED (bildirilen bug)
  await expect.poll(async () => (await prisma.purchaseRequisition.findUnique({ where: { id: reqId } }))?.status, { timeout: 10000 }).toBe("ORDERED");
});
