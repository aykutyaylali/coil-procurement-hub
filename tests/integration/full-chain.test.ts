import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { matchInvoice, type MatchInputLine } from "@/domain/invoice/matching";
import { saveBid } from "@/domain/bidding";
import { hashToken, secureToken } from "@/lib/ids";
import { addDays } from "@/lib/dates";
import { lineNet, lineTax, add, toStr } from "@/lib/money";

/**
 * Zincir arka yarısı (deterministik, gerçek DB, rollback tx):
 *  - Award → PO hesabı (net/KDV/genel toplam)
 *  - Gerçek PO + mal kabul kayıtlarıyla üçlü eşleştirme: tolerans içi MATCHED, tolerans dışı BLOCKED
 */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
async function inRollback<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  let result!: T;
  try {
    await prisma.$transaction(async (tx) => { result = await fn(tx); throw new Error("__ROLLBACK__"); });
  } catch (e) { if (!(e instanceof Error) || e.message !== "__ROLLBACK__") throw e; }
  return result;
}
afterAll(async () => { await prisma.$disconnect(); });

const tol = { qtyPct: "2", pricePct: "2", amountAbs: "10" };

describe("zincir arka yarı — award→PO ve üçlü eşleştirme (gerçek DB)", () => {
  it("award edilen fiyattan PO hesabı doğru (net/KDV/toplam)", async () => {
    const out = await inRollback(async (tx) => {
      const tenant = await tx.tenant.findFirst();
      const company = await tx.company.findFirst({ where: { tenantId: tenant!.id } });
      const admin = await tx.user.findFirst({ where: { tenantId: tenant!.id } });
      const supplier = await tx.supplier.create({ data: { tenantId: tenant!.id, code: "FC-SUP-" + Date.now(), legalName: "FullChain Sup" } });

      // Award: qty 100 x 295 (indirimsiz), KDV %20
      const qty = "100", price = "295", taxRate = "20";
      const net = lineNet(qty, price);
      const tax = lineTax(net, taxRate);
      const grand = add(net, tax);

      const po = await tx.purchaseOrder.create({
        data: {
          tenantId: tenant!.id, number: "FC-PO-" + Date.now(), companyId: company!.id, supplierId: supplier.id,
          status: "DRAFT", currency: "TRY", subtotal: toStr(net, 2), taxTotal: toStr(tax, 2), grandTotal: toStr(grand, 2),
          createdById: admin!.id,
          lines: { create: [{ lineNo: 1, description: "FC kalem", quantity: qty, uom: "AD", unitPrice: price, taxRate, lineTotal: toStr(net, 2) }] },
        },
        include: { lines: true },
      });
      return { subtotal: po.subtotal, taxTotal: po.taxTotal, grandTotal: po.grandTotal };
    });
    expect(out.subtotal).toBe("29500.00");
    expect(out.taxTotal).toBe("5900.00");
    expect(out.grandTotal).toBe("35400.00");
  });

  it("gerçek PO+mal kabul: tolerans içi fatura MATCHED", async () => {
    const passed = await inRollback(async (tx) => {
      const tenant = await tx.tenant.findFirst();
      const company = await tx.company.findFirst({ where: { tenantId: tenant!.id } });
      const admin = await tx.user.findFirst({ where: { tenantId: tenant!.id } });
      const supplier = await tx.supplier.create({ data: { tenantId: tenant!.id, code: "FC2-" + Date.now(), legalName: "FC2" } });
      const po = await tx.purchaseOrder.create({
        data: { tenantId: tenant!.id, number: "FC2-PO-" + Date.now(), companyId: company!.id, supplierId: supplier.id, status: "RECEIVED", currency: "TRY", grandTotal: "35400", createdById: admin!.id,
          lines: { create: [{ lineNo: 1, description: "kalem", quantity: "100", unitPrice: "295", taxRate: "20", lineTotal: "29500", receivedQty: "100" }] } },
        include: { lines: true },
      });
      const line = po.lines[0]!;
      const input: MatchInputLine[] = [{ orderLineId: line.id, description: line.description, orderedQty: "100", orderedPrice: "295", receivedQty: "100", prevInvoicedQty: "0", thisQty: "100", thisPrice: "296", taxRate: "20" }];
      return matchInvoice(input, tol).passed;
    });
    expect(passed).toBe(true);
  });

  it("gerçek PO+mal kabul: tolerans dışı fatura BLOCKED", async () => {
    const result = await inRollback(async (tx) => {
      const tenant = await tx.tenant.findFirst();
      const company = await tx.company.findFirst({ where: { tenantId: tenant!.id } });
      const admin = await tx.user.findFirst({ where: { tenantId: tenant!.id } });
      const supplier = await tx.supplier.create({ data: { tenantId: tenant!.id, code: "FC3-" + Date.now(), legalName: "FC3" } });
      const po = await tx.purchaseOrder.create({
        data: { tenantId: tenant!.id, number: "FC3-PO-" + Date.now(), companyId: company!.id, supplierId: supplier.id, status: "RECEIVED", currency: "TRY", grandTotal: "35400", createdById: admin!.id,
          lines: { create: [{ lineNo: 1, description: "kalem", quantity: "100", unitPrice: "295", taxRate: "20", lineTotal: "29500", receivedQty: "100" }] } },
        include: { lines: true },
      });
      const line = po.lines[0]!;
      // Fiyat %10+ sapma → tolerans dışı
      const input: MatchInputLine[] = [{ orderLineId: line.id, description: line.description, orderedQty: "100", orderedPrice: "295", receivedQty: "100", prevInvoicedQty: "0", thisQty: "100", thisPrice: "340", taxRate: "20" }];
      const m = matchInvoice(input, tol);
      return { passed: m.passed, status: m.lines[0]!.status, reasons: m.blockedReasons.length };
    });
    expect(result.passed).toBe(false);
    expect(result.status).toBe("PRICE_VARIANCE");
    expect(result.reasons).toBeGreaterThan(0);
  });
});

describe("zincir — magic-link teklif gönderimi (saveBid, gerçek token akışı)", () => {
  it("geçerli token ile tedarikçi teklifi SUBMITTED olur", async () => {
    const tenant = await prisma.tenant.findFirst();
    const company = await prisma.company.findFirst({ where: { tenantId: tenant!.id } });
    const admin = await prisma.user.findFirst({ where: { tenantId: tenant!.id } });
    const supplier = await prisma.supplier.findFirst({ where: { tenantId: tenant!.id, status: "ACTIVE" } });
    const token = secureToken(24);

    // RFQ + satır + davetli tedarikçi (token hash saklanır)
    const rfq = await prisma.rFQ.create({
      data: {
        tenantId: tenant!.id, number: "BIDTEST-" + Date.now(), companyId: company!.id, title: "Bid test",
        status: "OPEN", currencyOptions: JSON.stringify(["TRY"]), dueAt: addDays(new Date(), 3), createdById: admin!.id,
        lines: { create: [{ lineNo: 1, description: "Bid kalem", quantity: "100", uom: "AD" }] },
      },
      include: { lines: true },
    });
    const rs = await prisma.rFQSupplier.create({
      data: { rfqId: rfq.id, supplierId: supplier!.id, tokenHash: hashToken(token), tokenExpiresAt: addDays(new Date(), 3), replyToken: secureToken(8), status: "INVITED" },
    });

    try {
      const res = await saveBid({
        token, currency: "TRY", submit: true,
        lines: [{ rfqLineId: rfq.lines[0]!.id, willQuote: true, unitPrice: "295", discountPct: "0", taxRate: "20" }],
      });
      expect(res.status).toBe("SUBMITTED");
      const bid = await prisma.bid.findFirst({ where: { rfqSupplierId: rs.id } });
      expect(bid?.status).toBe("SUBMITTED");
      // Davetli durumu RESPONDED oldu mu?
      const rsAfter = await prisma.rFQSupplier.findUnique({ where: { id: rs.id } });
      expect(rsAfter?.status).toBe("RESPONDED");
    } finally {
      // Temizlik (bu test rollback tx kullanmıyor; oluşturulan kayıtları siler)
      await prisma.notification.deleteMany({ where: { link: `/rfqs/${rfq.id}` } });
      await prisma.bidLine.deleteMany({ where: { bid: { rfqId: rfq.id } } });
      await prisma.bidRevision.deleteMany({ where: { bid: { rfqId: rfq.id } } });
      await prisma.bid.deleteMany({ where: { rfqId: rfq.id } });
      await prisma.rFQSupplier.deleteMany({ where: { rfqId: rfq.id } });
      await prisma.rFQLine.deleteMany({ where: { rfqId: rfq.id } });
      await prisma.rFQ.delete({ where: { id: rfq.id } });
    }
  });
});
