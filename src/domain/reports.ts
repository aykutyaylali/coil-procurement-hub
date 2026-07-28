import "server-only";
import { prisma } from "@/lib/db";
import { add, d, toStr } from "@/lib/money";

/**
 * Rapor hesaplama motoru. Gerçek veritabanından hesaplar (imported + canlı).
 * Raporlama TL değeri: historicalTryTotal (imported) ?? lineTotal (TRY siparişler).
 */
export interface ReportFilters {
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  supplierId?: string;
  operationType?: string;
  currency?: string;
  status?: string;
}

interface LineRec {
  orderId: string;
  orderNumber: string;
  orderDate: Date;
  supplierId: string;
  supplierName: string;
  operationType: string;
  status: string;
  categoryId: string | null;
  categoryName: string;
  lineCurrency: string;
  requesterName: string | null;
  reportingTry: string;
  neededBy: Date | null;
  receivedQty: string;
  quantity: string;
  isImported: boolean;
}

async function loadLines(tenantId: string, f: ReportFilters): Promise<LineRec[]> {
  const orderWhere: Record<string, unknown> = { tenantId, status: { not: "CANCELLED" } };
  if (f.operationType) orderWhere.operationType = f.operationType;
  if (f.supplierId) orderWhere.supplierId = f.supplierId;
  if (f.status) orderWhere.status = f.status;
  if (f.dateFrom || f.dateTo) {
    orderWhere.orderDate = {
      ...(f.dateFrom ? { gte: new Date(f.dateFrom) } : {}),
      ...(f.dateTo ? { lte: new Date(f.dateTo + "T23:59:59") } : {}),
    };
  }

  const orders = await prisma.purchaseOrder.findMany({
    where: orderWhere,
    select: {
      id: true, number: true, orderDate: true, supplierId: true, operationType: true,
      status: true, currency: true, requesterName: true, isImported: true,
      supplier: { select: { legalName: true } },
      lines: {
        select: {
          categoryId: true, currency: true, historicalTryTotal: true,
          lineTotal: true, neededBy: true, receivedQty: true, quantity: true,
        },
      },
    },
  });

  const catMap = new Map(
    (await prisma.category.findMany({ where: { tenantId }, select: { id: true, name: true } })).map((c) => [c.id, c.name]),
  );

  const recs: LineRec[] = [];
  for (const o of orders) {
    for (const l of o.lines) {
      const lineCur = (l.currency as string | null) ?? o.currency;
      if (f.currency && lineCur !== f.currency) continue;
      if (f.categoryId && l.categoryId !== f.categoryId) continue;
      const reportingTry =
        l.historicalTryTotal ?? (o.currency === "TRY" ? (l.lineTotal ?? "0") : "0");
      recs.push({
        orderId: o.id, orderNumber: o.number, orderDate: o.orderDate,
        supplierId: o.supplierId, supplierName: o.supplier.legalName,
        operationType: o.operationType, status: o.status,
        categoryId: l.categoryId, categoryName: l.categoryId ? (catMap.get(l.categoryId) ?? "-") : "(kategorisiz)",
        lineCurrency: lineCur, requesterName: o.requesterName,
        reportingTry, neededBy: l.neededBy, receivedQty: l.receivedQty ?? "0",
        quantity: l.quantity ?? "0", isImported: o.isImported,
      });
    }
  }
  return recs;
}

export interface ReportData {
  totalSpend: string;
  orderCount: number;
  lineCount: number;
  supplierCount: number;
  byCategory: { key: string; value: string; count: number }[];
  bySupplier: { key: string; id: string; value: string; count: number }[];
  byOperationType: { key: string; value: string; count: number }[];
  byCurrency: { key: string; value: string; count: number }[];
  byMonth: { key: string; value: string }[];
  byRequester: { key: string; value: string; count: number }[];
  openOrders: number;
  lateOrders: number;
  detail: LineRec[];
}

export async function computeReports(tenantId: string, f: ReportFilters): Promise<ReportData> {
  const lines = await loadLines(tenantId, f);

  const sumBy = (keyFn: (l: LineRec) => string) => {
    const m = new Map<string, { value: string; count: number }>();
    for (const l of lines) {
      const k = keyFn(l);
      const cur = m.get(k) ?? { value: "0", count: 0 };
      cur.value = toStr(add(cur.value, l.reportingTry), 2);
      cur.count += 1;
      m.set(k, cur);
    }
    return m;
  };

  const cat = sumBy((l) => l.categoryName);
  const sup = new Map<string, { id: string; value: string; count: number }>();
  for (const l of lines) {
    const c = sup.get(l.supplierName) ?? { id: l.supplierId, value: "0", count: 0 };
    c.value = toStr(add(c.value, l.reportingTry), 2); c.count++; sup.set(l.supplierName, c);
  }
  const op = sumBy((l) => l.operationType);
  const cur = sumBy((l) => l.lineCurrency);
  const month = sumBy((l) => `${l.orderDate.getUTCFullYear()}-${String(l.orderDate.getUTCMonth() + 1).padStart(2, "0")}`);
  const req = sumBy((l) => l.requesterName ?? "(belirsiz)");

  const total = add(...lines.map((l) => l.reportingTry));
  const orderIds = new Set(lines.map((l) => l.orderId));
  const supplierIds = new Set(lines.map((l) => l.supplierId));
  const now = Date.now();
  const openStatuses = ["SENT", "ACKNOWLEDGED", "CONFIRMED", "PARTIALLY_RECEIVED", "PARTIALLY_CONFIRMED", "SHIPPED"];
  const openOrders = new Set(lines.filter((l) => openStatuses.includes(l.status)).map((l) => l.orderId)).size;
  const lateOrders = new Set(
    lines.filter((l) => l.neededBy && l.neededBy.getTime() < now && d(l.receivedQty).lessThan(l.quantity) && !["CLOSED", "RECEIVED", "INVOICED"].includes(l.status)).map((l) => l.orderId),
  ).size;

  const sortDesc = (m: Map<string, { value: string; count: number }>) =>
    [...m.entries()].map(([key, v]) => ({ key, value: v.value, count: v.count })).sort((a, b) => (d(b.value).greaterThan(a.value) ? 1 : -1));

  return {
    totalSpend: toStr(total, 2),
    orderCount: orderIds.size,
    lineCount: lines.length,
    supplierCount: supplierIds.size,
    byCategory: sortDesc(cat),
    bySupplier: [...sup.entries()].map(([key, v]) => ({ key, id: v.id, value: v.value, count: v.count })).sort((a, b) => (d(b.value).greaterThan(a.value) ? 1 : -1)).slice(0, 20),
    byOperationType: sortDesc(op),
    byCurrency: sortDesc(cur),
    byMonth: [...month.entries()].map(([key, v]) => ({ key, value: v.value })).sort((a, b) => a.key.localeCompare(b.key)),
    byRequester: sortDesc(req).slice(0, 20),
    openOrders,
    lateOrders,
    detail: lines,
  };
}

/** CSV satırları (harcama detayı) — Excel uyumlu. */
export async function reportDetailCsv(tenantId: string, f: ReportFilters): Promise<string> {
  const data = await computeReports(tenantId, f);
  const header = ["Siparis No", "Tarih", "Tedarikci", "Kategori", "Operasyon", "Durum", "PB", "Talep Eden", "TL Tutar"];
  const rows = data.detail.map((l) => [
    l.orderNumber,
    l.orderDate.toISOString().slice(0, 10),
    l.supplierName,
    l.categoryName,
    l.operationType,
    l.status,
    l.lineCurrency,
    l.requesterName ?? "",
    l.reportingTry,
  ]);
  const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  return "﻿" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
}
