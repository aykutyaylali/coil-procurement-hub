/**
 * Demo/test verilerini siler, yalnızca Excel içe aktarımı + admin kalır.
 * Ardından Excel verisini sisteme uyarlar: boş tarihler sipariş tarihiyle
 * doldurulur; alınmış/tamamlanmış siparişler için mal kabul (goods receipt)
 * oluşturulur. Kategoriler zaten import sırasında atanmıştır.
 *
 * ÇALIŞTIRMADAN ÖNCE YEDEK ALINIR (prisma/backups). Excel dosyası değiştirilmez.
 */
import { prisma } from "@/lib/db";
import { nextNumber } from "@/domain/numbering";

const KEEP_LOGIN_EMAIL = "admin@coilpartners.com";

async function delMany(label: string, fn: () => Promise<{ count: number }>) {
  try {
    const r = await fn();
    if (r.count) console.log(`  sil ${label}: ${r.count}`);
  } catch (e) {
    console.log(`  ! ${label} atlandı: ${(e as Error).message.split("\n")[0]}`);
  }
}

async function main() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) throw new Error("tenant yok");
  const tid = tenant.id;
  const admin = await prisma.user.findFirst({ where: { email: KEEP_LOGIN_EMAIL } });
  if (!admin) throw new Error("admin yok");

  console.log("=== FAZ 1: DEMO/TEST VERİSİ SİLİNİYOR ===");
  // Teklif/RFQ zinciri
  await delMany("BidLine", () => prisma.bidLine.deleteMany({}));
  await delMany("BidRevision", () => prisma.bidRevision.deleteMany({}));
  await delMany("BidEvaluation", () => prisma.bidEvaluation.deleteMany({}));
  await delMany("Bid", () => prisma.bid.deleteMany({}));
  await delMany("AwardDecision", () => prisma.awardDecision.deleteMany({}));
  await delMany("RFQMessage", () => prisma.rFQMessage.deleteMany({}));
  await delMany("SupplierQuestion", () => prisma.supplierQuestion.deleteMany({}));
  await delMany("RFQSupplier", () => prisma.rFQSupplier.deleteMany({}));
  await delMany("RFQLine", () => prisma.rFQLine.deleteMany({}));
  await delMany("RFQ", () => prisma.rFQ.deleteMany({}));
  // Fatura
  await delMany("InvoiceMatch", () => prisma.invoiceMatch.deleteMany({}));
  await delMany("LandedCostItem", () => prisma.landedCostItem.deleteMany({}));
  await delMany("InvoiceLine", () => prisma.invoiceLine.deleteMany({}));
  await delMany("Invoice", () => prisma.invoice.deleteMany({}));
  // Bütçe
  await delMany("BudgetTransaction", () => prisma.budgetTransaction.deleteMany({}));
  await delMany("Budget", () => prisma.budget.deleteMany({}));
  // Kalite / mal kabul / sevkiyat (mevcut demo — sonra Excel'den yeniden oluşturulacak)
  await delMany("QualityInspection", () => prisma.qualityInspection.deleteMany({}));
  await delMany("NonConformance", () => prisma.nonConformance.deleteMany({}));
  await delMany("CAPA", () => prisma.cAPA.deleteMany({}));
  await delMany("GoodsReceiptLine", () => prisma.goodsReceiptLine.deleteMany({}));
  await delMany("GoodsReceipt", () => prisma.goodsReceipt.deleteMany({}));
  await delMany("ShipmentLine", () => prisma.shipmentLine.deleteMany({}));
  await delMany("Shipment", () => prisma.shipment.deleteMany({}));
  await delMany("OrderRevision", () => prisma.orderRevision.deleteMany({}));
  await delMany("OrderConfirmation", () => prisma.orderConfirmation.deleteMany({}));
  // Sözleşme / katalog
  await delMany("ContractItem", () => prisma.contractItem.deleteMany({}));
  await delMany("Contract", () => prisma.contract.deleteMany({}));
  await delMany("Item", () => prisma.item.deleteMany({}));
  // Onay
  await delMany("ApprovalAction", () => prisma.approvalAction.deleteMany({}));
  await delMany("ApprovalInstance", () => prisma.approvalInstance.deleteMany({}));
  // Kullanıcıya bağlı yardımcılar
  await delMany("Notification", () => prisma.notification.deleteMany({}));
  await delMany("Task", () => prisma.task.deleteMany({}));
  await delMany("Comment", () => prisma.comment.deleteMany({}));
  await delMany("Attachment", () => prisma.attachment.deleteMany({}));
  await delMany("Delegation", () => prisma.delegation.deleteMany({}));
  await delMany("AuditLog", () => prisma.auditLog.deleteMany({}));
  await delMany("EmailEvent", () => prisma.emailEvent.deleteMany({}));
  await delMany("EmailMessage", () => prisma.emailMessage.deleteMany({}));

  // Demo talep/sipariş (isImported=false)
  await delMany("RequisitionLine(demo)", () => prisma.requisitionLine.deleteMany({ where: { requisition: { isImported: false } } }));
  await delMany("PurchaseRequisition(demo)", () => prisma.purchaseRequisition.deleteMany({ where: { tenantId: tid, isImported: false } }));
  await delMany("PurchaseOrderLine(demo)", () => prisma.purchaseOrderLine.deleteMany({ where: { order: { isImported: false } } }));
  await delMany("PurchaseOrder(demo)", () => prisma.purchaseOrder.deleteMany({ where: { tenantId: tid, isImported: false } }));

  // Demo tedarikçiler (isImported=false) + bağlı kayıtlar
  const demoSuppliers = await prisma.supplier.findMany({ where: { tenantId: tid, isImported: false }, select: { id: true } });
  const demoSupIds = demoSuppliers.map((s) => s.id);
  if (demoSupIds.length) {
    await delMany("SupplierContact(demo)", () => prisma.supplierContact.deleteMany({ where: { supplierId: { in: demoSupIds } } }));
    await delMany("SupplierBankAccount(demo)", () => prisma.supplierBankAccount.deleteMany({ where: { supplierId: { in: demoSupIds } } }));
    await delMany("SupplierDocument(demo)", () => prisma.supplierDocument.deleteMany({ where: { supplierId: { in: demoSupIds } } }));
    await delMany("SupplierCategoryLink(demo)", () => prisma.supplierCategoryLink.deleteMany({ where: { supplierId: { in: demoSupIds } } }));
    await delMany("SupplierScore(demo)", () => prisma.supplierScore.deleteMany({ where: { supplierId: { in: demoSupIds } } }));
    await delMany("SupplierRisk(demo)", () => prisma.supplierRisk.deleteMany({ where: { supplierId: { in: demoSupIds } } }));
    await delMany("SupplierAudit(demo)", () => prisma.supplierAudit.deleteMany({ where: { supplierId: { in: demoSupIds } } }));
    await delMany("Supplier(demo)", () => prisma.supplier.deleteMany({ where: { id: { in: demoSupIds } } }));
  }

  // Kullanıcılar: admin + Excel talep-açanlar (isImported) DIŞINDAKİLERİ sil
  // Self/dept FK'leri önce temizle
  await prisma.department.updateMany({ data: { managerId: null } });
  await prisma.user.updateMany({ data: { managerId: null } });
  const toDelete = await prisma.user.findMany({
    where: { tenantId: tid, isImported: false, email: { not: KEEP_LOGIN_EMAIL } },
    select: { id: true },
  });
  const delIds = toDelete.map((u) => u.id);
  if (delIds.length) {
    await delMany("UserScope", () => prisma.userScope.deleteMany({ where: { userId: { in: delIds } } }));
    await delMany("UserRole", () => prisma.userRole.deleteMany({ where: { userId: { in: delIds } } }));
    await delMany("Session", () => prisma.session.deleteMany({ where: { userId: { in: delIds } } }));
    await delMany("PasswordResetToken", () => prisma.passwordResetToken.deleteMany({ where: { userId: { in: delIds } } }));
    await delMany("SupplierContact(userLink)", () => prisma.supplierContact.updateMany({ where: { userId: { in: delIds } }, data: { userId: null } }).then((r) => r));
    await delMany("User(demo/test)", () => prisma.user.deleteMany({ where: { id: { in: delIds } } }));
  }

  console.log("\n=== FAZ 2: BOŞ TARİHLER (import siparişler) sipariş tarihiyle dolduruluyor ===");
  const orders = await prisma.purchaseOrder.findMany({
    where: { tenantId: tid, isImported: true },
    select: { id: true, orderDate: true, status: true, lines: { select: { id: true, neededBy: true, quantity: true, description: true } } },
  });
  let filledLines = 0;
  for (const o of orders) {
    for (const l of o.lines) {
      if (!l.neededBy) {
        await prisma.purchaseOrderLine.update({ where: { id: l.id }, data: { neededBy: o.orderDate } });
        filledLines++;
      }
    }
  }
  console.log(`  boş teslim tarihi doldurulan kalem: ${filledLines}`);

  console.log("\n=== FAZ 3: MAL KABUL (alınmış/tamamlanmış siparişler) oluşturuluyor ===");
  const received = orders.filter((o) => o.status === "CLOSED" || o.status === "RECEIVED");
  let grCreated = 0, grLines = 0;
  for (const o of received) {
    const number = await nextNumber(prisma, tid, "GOODS_RECEIPT");
    await prisma.goodsReceipt.create({
      data: {
        orderId: o.id, number, receivedById: admin.id, status: "POSTED", receivedAt: o.orderDate,
        note: "Excel geçmiş verisinden içe aktarıldı",
        lines: {
          create: o.lines.map((l) => ({
            orderLineId: l.id,
            acceptedQty: l.quantity || "0",
            rejectedQty: "0",
            disposition: "ACCEPTED",
          })),
        },
      },
    });
    // Sipariş kalemlerinin alınan miktarını işaretle
    for (const l of o.lines) {
      await prisma.purchaseOrderLine.update({ where: { id: l.id }, data: { receivedQty: l.quantity || "0" } });
    }
    grCreated++; grLines += o.lines.length;
  }
  console.log(`  mal kabul oluşturuldu: ${grCreated} (kalem: ${grLines})`);

  console.log("\n=== MUTABAKAT (son durum) ===");
  const fin = {
    talep: await prisma.purchaseRequisition.count({ where: { tenantId: tid } }),
    siparis: await prisma.purchaseOrder.count({ where: { tenantId: tid } }),
    tedarikci: await prisma.supplier.count({ where: { tenantId: tid } }),
    kullanici: await prisma.user.count({ where: { tenantId: tid } }),
    malKabul: await prisma.goodsReceipt.count({}),
    rfq: await prisma.rFQ.count({}),
    fatura: await prisma.invoice.count({}),
    katalog: await prisma.item.count({}),
  };
  console.log(JSON.stringify(fin, null, 1));
  const loginable = await prisma.user.findMany({ where: { passwordHash: { not: null } }, select: { email: true } });
  console.log("Giriş yapabilen:", loginable.map((u) => u.email).join(", "));

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("HATA:", e); await prisma.$disconnect(); process.exit(1); });
