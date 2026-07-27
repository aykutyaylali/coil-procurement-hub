import "server-only";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";
import type { Tx } from "@/lib/db";
import { nextNumber } from "@/domain/numbering";
import { writeAudit } from "@/lib/audit";
import { add, toStr } from "@/lib/money";
import {
  KALEM_SHEET,
  parseKalemRows,
  groupByOrder,
  normalizeSupplier,
  orderTotalTry,
  type ParsedLine,
} from "@/domain/import/historical";

/** xlsx buffer'Ä±ndan bir sayfayÄ± satÄ±r nesnelerine Ã§evirir. */
export function readSheetRows(buffer: Buffer, sheetName = KALEM_SHEET): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { cellDates: true });
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error(`"${sheetName}" sayfasÄ± bulunamadÄ±. Mevcut: ${wb.SheetNames.join(", ")}`);
  return XLSX.utils.sheet_to_json(ws, { defval: null, raw: true }) as Record<string, unknown>[];
}

export function listSheets(buffer: Buffer): string[] {
  return XLSX.read(buffer, { type: "buffer" }).SheetNames;
}

export interface DryRunResult {
  totalOrders: number;
  totalLines: number;
  newOrders: number;
  duplicateOrders: number; // zaten mevcut (idempotent atlanacak)
  newSuppliers: number;
  matchedSuppliers: number;
  newCategories: number;
  matchedCategories: number;
  importTotalTry: string;
  duplicateOrderNumbers: string[];
  errorRows: number;
}

/** Dry-run: veritabanÄ±na hiÃ§bir ÅŸey yazmadan sonucu Ã¶ngÃ¶rÃ¼r. */
export async function dryRun(tenantId: string, parsed: ParsedLine[]): Promise<DryRunResult> {
  const existingSuppliers = await prisma.supplier.findMany({
    where: { tenantId },
    select: { legalName: true },
  });
  const supNorm = new Set(existingSuppliers.map((s) => normalizeSupplier(s.legalName)));

  const existingCategories = await prisma.category.findMany({ where: { tenantId }, select: { name: true } });
  const catNorm = new Set(existingCategories.map((c) => normalizeSupplier(c.name)));

  const byOrder = groupByOrder(parsed);
  const existingOrders = await prisma.purchaseOrder.findMany({
    where: { tenantId, number: { in: Array.from(byOrder.keys()) } },
    select: { number: true },
  });
  const existingOrderSet = new Set(existingOrders.map((o) => o.number));

  const importSuppliers = new Set<string>();
  const importCategories = new Set<string>();
  let importTotal = add(0);
  let errorRows = 0;
  for (const l of parsed) {
    if (l.supplierNorm) importSuppliers.add(l.supplierNorm);
    if (l.categoryRaw) importCategories.add(normalizeSupplier(l.categoryRaw));
    if (l.historicalTryTotal != null) importTotal = add(importTotal, l.historicalTryTotal);
    if (l.errors.length) errorRows++;
  }

  let newSuppliers = 0, matchedSuppliers = 0;
  for (const s of importSuppliers) (supNorm.has(s) ? matchedSuppliers++ : newSuppliers++);
  let newCategories = 0, matchedCategories = 0;
  for (const c of importCategories) (catNorm.has(c) ? matchedCategories++ : newCategories++);

  const duplicateOrderNumbers = Array.from(byOrder.keys()).filter((n) => existingOrderSet.has(n));

  return {
    totalOrders: byOrder.size,
    totalLines: parsed.length,
    newOrders: byOrder.size - duplicateOrderNumbers.length,
    duplicateOrders: duplicateOrderNumbers.length,
    newSuppliers, matchedSuppliers,
    newCategories, matchedCategories,
    importTotalTry: toStr(importTotal, 2),
    duplicateOrderNumbers: duplicateOrderNumbers.slice(0, 50),
    errorRows,
  };
}

/**
 * GerÃ§ek iÃ§e aktarma (transaction iÃ§inde Ã§aÄŸrÄ±lÄ±r). Ä°dempotent: mevcut sipariÅŸ
 * numaralarÄ± atlanÄ±r. Yeni tedarikÃ§i/kategori import batch'i ile iÅŸaretlenir.
 */
export async function commitImport(
  tx: Tx,
  params: { tenantId: string; userId: string; companyId: string; batchId: string; parsed: ParsedLine[] },
): Promise<{ ordersCreated: number; linesCreated: number; suppliersCreated: number; categoriesCreated: number; skippedOrders: number; importedTotalTry: string }> {
  const { tenantId, userId, companyId, batchId, parsed } = params;

  // TedarikÃ§i eÅŸleme haritasÄ±
  const existingSuppliers = await tx.supplier.findMany({ where: { tenantId }, select: { id: true, legalName: true } });
  const supMap = new Map<string, string>();
  for (const s of existingSuppliers) supMap.set(normalizeSupplier(s.legalName), s.id);

  // Kategori eÅŸleme haritasÄ±
  const existingCats = await tx.category.findMany({ where: { tenantId }, select: { id: true, name: true } });
  const catMap = new Map<string, string>();
  for (const c of existingCats) catMap.set(normalizeSupplier(c.name), c.id);

  let suppliersCreated = 0, categoriesCreated = 0;

  async function resolveSupplier(line: ParsedLine): Promise<string> {
    const key = line.supplierNorm;
    const existing = supMap.get(key);
    if (existing) return existing;
    const code = await nextNumber(tx, tenantId, "SUPPLIER");
    const created = await tx.supplier.create({
      data: {
        tenantId, code, legalName: line.supplierRaw, status: "ACTIVE",
        supplierType: line.currency === "TRY" ? "DOMESTIC" : "FOREIGN",
        country: line.currency === "TRY" ? "TR" : "-",
        defaultCurrency: line.currency,
        preferredLanguage: line.currency === "TRY" ? "tr" : "en",
        isImported: true, importBatchId: batchId,
      },
    });
    supMap.set(key, created.id);
    suppliersCreated++;
    return created.id;
  }

  async function resolveCategory(name: string | null): Promise<string | null> {
    if (!name) return null;
    const key = normalizeSupplier(name);
    const existing = catMap.get(key);
    if (existing) return existing;
    // Benzersiz kod Ã¼ret
    const code = `IMP-${key.replace(/[^a-z0-9]/g, "").slice(0, 8)}-${categoriesCreated + 1}`;
    const created = await tx.category.create({
      data: { tenantId, code, name, isImported: true, importBatchId: batchId },
    });
    catMap.set(key, created.id);
    categoriesCreated++;
    return created.id;
  }

  const byOrder = groupByOrder(parsed);
  const existingOrders = await tx.purchaseOrder.findMany({
    where: { tenantId, number: { in: Array.from(byOrder.keys()) } },
    select: { number: true },
  });
  const existingOrderSet = new Set(existingOrders.map((o) => o.number));

  let ordersCreated = 0, linesCreated = 0, skippedOrders = 0;
  let importedTotal = add(0);

  for (const [orderNumber, lines] of byOrder) {
    if (existingOrderSet.has(orderNumber)) { skippedOrders++; continue; } // idempotent

    const first = lines[0]!;
    const supplierId = await resolveSupplier(first);
    // SipariÅŸ para birimi: satÄ±rlar tutarlÄ± deÄŸilse TRY (raporlama) kullan
    const distinctCur = Array.from(new Set(lines.map((l) => l.currency)));
    const orderTotal = orderTotalTry(lines); // tarihsel TL

    const lineData = [];
    for (const l of lines) {
      const categoryId = await resolveCategory(l.categoryRaw);
      const flags: string[] = [];
      if (l.unitPrice == null) flags.push("unitPrice");
      if (l.taxRate == null) flags.push("taxRate");
      if (l.historicalTryTotal == null) flags.push("historicalTryTotal");
      if (l.neededBy == null) flags.push("neededBy");
      lineData.push({
        lineNo: l.lineNo,
        categoryId,
        description: l.description,
        quantity: l.quantity, // null kalabilir
        uom: l.uom,
        currency: l.currency,
        unitPrice: l.unitPrice, // null kalabilir (0 ile doldurulmaz)
        taxRate: l.taxRate,
        lineTotal: l.historicalTryTotal, // raporlama TL tutarÄ±
        originalLineTotal: l.originalLineTotal,
        historicalTryTotal: l.historicalTryTotal,
        note: l.note,
        neededBy: l.neededBy,
        dataQualityFlags: flags.length ? JSON.stringify(flags) : null,
        importBatchId: batchId,
        sourceRowNo: l.sourceRowNo,
      });
    }

    const po = await tx.purchaseOrder.create({
      data: {
        tenantId, number: orderNumber, companyId, supplierId,
        status: first.status,
        operationType: first.currency === "TRY" ? "DOMESTIC_PURCHASE" : "IMPORT_PURCHASE",
        orderDate: first.orderDate ?? new Date(),
        currency: "TRY", // raporlama TL (satÄ±rlarda orijinal PB saklÄ±)
        subtotal: orderTotal, taxTotal: "0", grandTotal: orderTotal,
        requesterName: first.requesterName,
        requisitionNumber: first.requisitionNumber,
        isImported: true, importBatchId: batchId, sourceRowNo: first.sourceRowNo,
        notes: distinctCur.length > 1 ? `Ã‡oklu PB: ${distinctCur.join(", ")}` : null,
        createdById: userId,
        lines: { create: lineData },
      },
    });
    ordersCreated++;
    linesCreated += lineData.length;
    importedTotal = add(importedTotal, orderTotal);

    await writeAudit(
      {
        tenantId, userId, action: "IMPORT",
        entityType: "PurchaseOrder", entityId: po.id,
        after: { number: orderNumber, batchId, historicalTry: orderTotal, isImported: true },
        reason: `GeÃ§miÅŸ veri iÃ§e aktarma (batch ${batchId})`,
      },
      tx,
    );
  }

  return {
    ordersCreated, linesCreated, suppliersCreated, categoriesCreated, skippedOrders,
    importedTotalTry: toStr(importedTotal, 2),
  };
}

/** Batch geri alma: yalnÄ±zca bu batch'in oluÅŸturduÄŸu ve baÅŸka iÅŸleme baÄŸlanmamÄ±ÅŸ kayÄ±tlar. */
export async function rollbackImport(
  tx: Tx,
  params: { tenantId: string; userId: string; batchId: string },
): Promise<{ ordersDeleted: number; suppliersDeleted: number; categoriesDeleted: number }> {
  const { tenantId, userId, batchId } = params;

  const orders = await tx.purchaseOrder.findMany({
    where: { tenantId, importBatchId: batchId },
    select: { id: true, invoices: { select: { id: true }, take: 1 }, goodsReceipts: { select: { id: true }, take: 1 } },
  });
  // BaÅŸka iÅŸleme baÄŸlanmamÄ±ÅŸ olanlar
  const deletableOrderIds = orders.filter((o) => o.invoices.length === 0 && o.goodsReceipts.length === 0).map((o) => o.id);

  // SatÄ±rlar cascade ile silinir (onDelete: Cascade)
  await tx.purchaseOrder.deleteMany({ where: { id: { in: deletableOrderIds } } });

  // Bu batch'in oluÅŸturduÄŸu, artÄ±k sipariÅŸi olmayan tedarikÃ§iler
  const impSuppliers = await tx.supplier.findMany({
    where: { tenantId, importBatchId: batchId },
    select: { id: true, purchaseOrders: { select: { id: true }, take: 1 } },
  });
  const delSupIds = impSuppliers.filter((s) => s.purchaseOrders.length === 0).map((s) => s.id);
  await tx.supplier.deleteMany({ where: { id: { in: delSupIds } } });

  // Bu batch'in oluÅŸturduÄŸu, kullanÄ±lmayan kategoriler
  const impCats = await tx.category.findMany({
    where: { tenantId, importBatchId: batchId },
    select: { id: true, items: { select: { id: true }, take: 1 } },
  });
  const delCatIds = impCats.filter((c) => c.items.length === 0).map((c) => c.id);
  await tx.category.deleteMany({ where: { id: { in: delCatIds } } });

  await tx.importBatch.update({ where: { id: batchId }, data: { status: "ROLLED_BACK", rolledBackAt: new Date() } });
  await writeAudit(
    { tenantId, userId, action: "IMPORT_ROLLBACK", entityType: "ImportBatch", entityId: batchId, after: { ordersDeleted: deletableOrderIds.length } },
    tx,
  );

  return { ordersDeleted: deletableOrderIds.length, suppliersDeleted: delSupIds.length, categoriesDeleted: delCatIds.length };
}
