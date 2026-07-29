import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Birleşik Satınalma İşlem Merkezi akışı (gerçek tıklamalar):
 * Talep oluştur → İşlem Merkezi'nde dosyayı bul → dosyada "Teklif Süreci" sekmesinden
 * kalem seçip RFQ oluştur. Kullanıcı ayrı RFQ listesinde numara aramak zorunda kalmaz.
 */
const PW = "Coil2026!";
const prisma = new PrismaClient();
test.beforeAll(async () => { await prisma.company.updateMany({ data: { settings: "{}" } }); });
test.afterAll(async () => { await prisma.$disconnect(); });

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("E-posta").fill(email);
  await page.getByLabel("Parola").fill(PW);
  await page.getByRole("button", { name: "Giriş Yap" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20000 });
}

test("İşlem Merkezi: talep → dosya → Teklif Süreci sekmesinden RFQ", async ({ page, context }) => {
  test.setTimeout(120000);

  // 1) Talep oluştur (NEVER politikası → doğrudan APPROVED)
  await login(page, "talep@coilpartners.com");
  await page.goto("/requisitions/new");
  await page.locator('label:has-text("Açıklama") + input').first().fill("İşlem Merkezi test kalemi");
  await page.locator('label:has-text("Miktar") + input').first().fill("10");
  await page.getByRole("button", { name: /Kaydet ve Gönder/ }).click();
  await expect(page).toHaveURL(/\/requisitions\/[a-z0-9]{20,}/i, { timeout: 20000 });
  const reqId = page.url().split("/requisitions/")[1]!.split("?")[0]!;
  await expect.poll(async () => (await prisma.purchaseRequisition.findUnique({ where: { id: reqId } }))?.status, { timeout: 15000 }).toBe("APPROVED");
  await context.clearCookies();

  // 2) Satınalma: İşlem Merkezi'nde iş kuyrukları + dosya
  await login(page, "satinalma@coilpartners.com");
  await page.goto("/islem-merkezi");
  await expect(page.getByText("Satınalma İşlem Merkezi").first()).toBeVisible();
  await expect(page.getByText(/Teklif Gelenler/).first()).toBeVisible();

  // 3) Dosyayı aç: süreç göstergesi + sekmeler
  await page.goto(`/islem-merkezi/${reqId}?tab=teklif`);
  await expect(page.getByText("Satınalma Dosyası").first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Talep Kalemleri").first()).toBeVisible();

  // 4) Teklif Süreci sekmesinden kalem seçip RFQ oluştur (ayrı listeye gitmeden)
  await page.locator('input[aria-label="Kalem 1 seç"]').check();
  await page.getByRole("button", { name: /Seçili kalemlerden RFQ oluştur/ }).first().click();
  await expect(page).toHaveURL(/\/rfqs\/[a-z0-9]{20,}/i, { timeout: 20000 });
  const rfqId = page.url().split("/rfqs/")[1]!.split("?")[0]!;

  // 5) RFQ, talebin kalemlerinden oluştu ve "← Satınalma Dosyası" ile geri dönülebilir
  const rfq = await prisma.rFQ.findFirst({ where: { id: rfqId }, include: { lines: true } });
  expect(rfq?.lines[0]?.requisitionId).toBe(reqId);
  await expect(page.getByText("Tedarikçi Yanıtları").first()).toBeVisible({ timeout: 15000 });
  await page.getByRole("link", { name: /Satınalma Dosyası/ }).click();
  await expect(page).toHaveURL(new RegExp(`/islem-merkezi/${reqId}`), { timeout: 15000 });
  // Dosyada RFQ görünür
  await expect(page.getByText(rfq!.number).first()).toBeVisible({ timeout: 15000 });
  void context;
});
